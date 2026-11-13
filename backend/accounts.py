"""Classifai accounts and customers: a real SQLite database and a real sign-in.

Nothing to install and nothing to pay for: SQLite is built into Python, and the password hashing comes with Flask.
app.py only needs two lines (see the bottom of this file):

    from accounts import init_accounts
    init_accounts(app)

Where it is stored
    * On your PC (default): the file backend/classifai.db (SQLite), created by itself the first time the server starts.
    * Online: set DATABASE_URL (a free Neon Postgres, see DEPLOY.md) and the very same code stores everything there,
      so accounts and customers survive restarts and re-deploys of a free host.

What is stored
    users      one row per person: name, email, a HASHED password (never the real one), picture
    sessions   one row per signed-in browser: only a hash of its secret token
    customers  that person's customers, one row each, kept apart per account

How the sign-in is kept safe
    * Passwords are hashed with scrypt and a random salt (werkzeug). The real password is never saved or logged.
    * After sign-in the browser gets a random token in an HttpOnly cookie, so JavaScript on the page cannot read it.
      The database only keeps a SHA-256 hash of that token. Log out deletes it.
    * Too many wrong passwords lock that email / address for a few minutes.
    * Every customer route checks who you are, and only ever touches the rows of that account.
    * /api/predict and /api/pandu now need you to be signed in, so strangers cannot use up your AI quota.

Routes
    POST /api/auth/signup     { name, email, password, photo?, avatar? }
    POST /api/auth/login      { email, password }
    POST /api/auth/logout
    GET  /api/auth/me         -> { user } or 401
    PATCH /api/auth/profile   { name, photo?, avatar? }
    POST /api/auth/verify     { password }              (asked before editing or deleting a customer)
    POST /api/auth/password   { current, next }
    GET  /api/customers
    POST /api/customers       { customers: [ ... ] }    add many
    PUT  /api/customers/<id>  { ...customer }
    DELETE /api/customers/<id>
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import sqlite3
import time
from functools import wraps
from pathlib import Path

from flask import Blueprint, g, jsonify, make_response, request
from werkzeug.security import check_password_hash, generate_password_hash

HERE = Path(__file__).parent
# On Vercel the only writable place is /tmp, which is wiped all the time: there you MUST use DATABASE_URL (a free Neon database).
DB_PATH = Path(os.getenv("DB_PATH", "/tmp/classifai.db" if os.getenv("VERCEL") else HERE / "classifai.db"))
COOKIE = "classifai_session"
SESSION_DAYS = 30
MIN_PASSWORD = 8
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")

bp = Blueprint("accounts", __name__, url_prefix="/api")


# ── database ───────────────────────────────────────────────────────────────
# One small wrapper so the rest of the file does not care whether it is SQLite (your PC) or Postgres (online).
# Queries are written once with "?" placeholders; for Postgres they are turned into "%s".
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if DATABASE_URL.startswith("postgres://"):                      # some hosts still hand out the old spelling
    DATABASE_URL = "postgresql://" + DATABASE_URL[len("postgres://"):]
USE_PG = DATABASE_URL.startswith("postgresql://")

SCHEMA = [
    """CREATE TABLE IF NOT EXISTS users (
        id         {pk},
        email      TEXT NOT NULL UNIQUE,
        name       TEXT NOT NULL,
        pw_hash    TEXT NOT NULL,
        photo      TEXT,
        avatar     TEXT,
        created_at BIGINT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at BIGINT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS customers (
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        id      TEXT NOT NULL,
        data    TEXT NOT NULL,
        seq     BIGINT NOT NULL,
        PRIMARY KEY (user_id, id)
    )""",
    "CREATE INDEX IF NOT EXISTS customers_by_user ON customers(user_id, seq)",
]
PK = "BIGSERIAL PRIMARY KEY" if USE_PG else "INTEGER PRIMARY KEY AUTOINCREMENT"


class Conn:
    """execute / executemany / commit / close, the same for both databases. Rows are read by column name."""

    def __init__(self):
        if USE_PG:
            import psycopg
            from psycopg.rows import dict_row

            self.raw = psycopg.connect(DATABASE_URL, row_factory=dict_row, connect_timeout=15)
        else:
            self.raw = sqlite3.connect(DB_PATH, timeout=15)
            self.raw.row_factory = sqlite3.Row
            self.raw.execute("PRAGMA foreign_keys = ON")

    def _sql(self, sql):
        return sql.replace("?", "%s") if USE_PG else sql

    def execute(self, sql, params=()):
        return self.raw.execute(self._sql(sql), params)

    def executemany(self, sql, rows):
        cur = self.raw.cursor()
        cur.executemany(self._sql(sql), rows)
        return cur

    def commit(self):
        self.raw.commit()

    def close(self):
        self.raw.close()


def db() -> Conn:
    if "db" not in g:
        g.db = Conn()
    return g.db


def init_db():
    if not USE_PG:
        con = sqlite3.connect(DB_PATH)
        con.execute("PRAGMA journal_mode = WAL")
        con.close()
    con = Conn()
    for stmt in SCHEMA:
        con.execute(stmt.format(pk=PK))
    con.commit()
    con.close()


# ── helpers ────────────────────────────────────────────────────────────────
def _now() -> int:
    return int(time.time())


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _clean(v) -> str:
    return str(v or "").strip()


def _err(message: str, status: int = 400):
    return jsonify(error=message), status


def _public(u) -> dict:
    return {"name": u["name"], "email": u["email"], "photo": u["photo"], "avatar": u["avatar"]}


def _image_ok(v) -> bool:
    return v is None or (isinstance(v, str) and len(v) <= 1_500_000 and v.startswith("data:image/"))


def _start_session(user_id: int, resp):
    token = secrets.token_urlsafe(32)
    con = db()
    con.execute("DELETE FROM sessions WHERE expires_at < ?", (_now(),))
    con.execute("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", (_hash_token(token), user_id, _now() + SESSION_DAYS * 86400))
    con.commit()
    resp.set_cookie(COOKIE, token, max_age=SESSION_DAYS * 86400, httponly=True, samesite="Lax", secure=request.is_secure, path="/")
    return resp


def current_user():
    """The signed-in user (a Row) or None. Cached for the request."""
    if "user" in g:
        return g.user
    g.user = None
    token = request.cookies.get(COOKIE)
    if token:
        row = db().execute(
            "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
            (_hash_token(token), _now()),
        ).fetchone()
        g.user = row
    return g.user


def login_required(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        if current_user() is None:
            return _err("Please sign in.", 401)
        return fn(*a, **kw)
    return wrapper


# ── too many wrong passwords → a short lock (kept in memory; resets when the server restarts) ──
_fails: dict[str, list[float]] = {}
MAX_FAILS, MAX_FAILS_IP, WINDOW = 6, 40, 300      # per email, per network address, seconds


def _keys(email: str):
    return [(f"e:{email}", MAX_FAILS), (f"ip:{request.remote_addr}", MAX_FAILS_IP)]


def _locked(email: str) -> int:
    now = time.time()
    worst = 0
    for k, limit in _keys(email):
        recent = [t for t in _fails.get(k, []) if now - t < WINDOW]
        _fails[k] = recent
        if len(recent) >= limit:
            worst = max(worst, int(WINDOW - (now - recent[0])))
    return worst


def _fail(email: str):
    for k, _limit in _keys(email):
        _fails.setdefault(k, []).append(time.time())


def _clear_fails(email: str):
    _fails.pop(f"e:{email}", None)


# ── accounts ───────────────────────────────────────────────────────────────
@bp.post("/auth/signup")
def signup():
    b = request.get_json(silent=True) or {}
    name, email, password = _clean(b.get("name")), _clean(b.get("email")).lower(), str(b.get("password") or "")
    photo, avatar = b.get("photo") or None, _clean(b.get("avatar")) or None
    if len(name) < 2 or len(name) > 80:
        return _err("Please enter your name.")
    if not EMAIL_RE.match(email) or len(email) > 200:
        return _err("That email address doesn't look right.")
    if len(password) < MIN_PASSWORD:
        return _err(f"Use at least {MIN_PASSWORD} characters for the password.")
    if len(password) > 200:
        return _err("That password is too long.")
    if not _image_ok(photo):
        return _err("That picture is too large. Choose a smaller one.")
    con = db()
    if con.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
        return _err("An account with this email already exists. Try signing in.", 409)
    try:
        _insert_user(con, name, email, password, photo, avatar)
    except Exception:                                                        # two sign-ups at the same moment
        con.raw.rollback()
        return _err("An account with this email already exists. Try signing in.", 409)
    user = con.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    return _start_session(user["id"], make_response(jsonify(user=_public(user))))


def _insert_user(con, name, email, password, photo, avatar):
    con.execute(
        "INSERT INTO users (email, name, pw_hash, photo, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (email, name, generate_password_hash(password), photo, avatar, _now()),
    )
    con.commit()


@bp.post("/auth/login")
def login():
    b = request.get_json(silent=True) or {}
    email, password = _clean(b.get("email")).lower(), str(b.get("password") or "")
    wait = _locked(email)
    if wait:
        return _err(f"Too many wrong attempts. Try again in {max(1, wait // 60 + (1 if wait % 60 else 0))} minute(s).", 429)
    user = db().execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    # the same message whether the email or the password is wrong, so nobody can find out who has an account
    if user is None or not check_password_hash(user["pw_hash"], password):
        if user is None:
            check_password_hash(generate_password_hash("x"), password)      # spend the same time either way
        _fail(email)
        return _err("Wrong email or password.", 401)
    _clear_fails(email)
    return _start_session(user["id"], make_response(jsonify(user=_public(user))))


@bp.post("/auth/logout")
def logout():
    token = request.cookies.get(COOKIE)
    if token:
        db().execute("DELETE FROM sessions WHERE token_hash = ?", (_hash_token(token),))
        db().commit()
    resp = make_response(jsonify(ok=True))
    resp.delete_cookie(COOKIE, path="/")
    return resp


@bp.get("/auth/me")
def me():
    u = current_user()
    if u is None:
        return _err("Not signed in.", 401)
    return jsonify(user=_public(u))


@bp.patch("/auth/profile")
@login_required
def profile():
    b = request.get_json(silent=True) or {}
    u = current_user()
    name = _clean(b.get("name"))
    if len(name) < 2 or len(name) > 80:
        return _err("Please enter your name.")
    photo, avatar = u["photo"], u["avatar"]
    if "photo" in b:
        photo = b.get("photo") or None
        if not _image_ok(photo):
            return _err("That picture is too large. Choose a smaller one.")
    if "avatar" in b and _clean(b.get("avatar")):
        avatar = _clean(b.get("avatar"))
    db().execute("UPDATE users SET name = ?, photo = ?, avatar = ? WHERE id = ?", (name, photo, avatar, u["id"]))
    db().commit()
    return jsonify(user=_public(db().execute("SELECT * FROM users WHERE id = ?", (u["id"],)).fetchone()))


@bp.post("/auth/verify")
@login_required
def verify():
    u = current_user()
    wait = _locked(u["email"])
    if wait:
        return _err("Too many wrong attempts. Try again in a few minutes.", 429)
    ok = check_password_hash(u["pw_hash"], str((request.get_json(silent=True) or {}).get("password") or ""))
    if not ok:
        _fail(u["email"])
    return jsonify(ok=ok)


@bp.post("/auth/password")
@login_required
def change_password():
    b = request.get_json(silent=True) or {}
    u = current_user()
    if not check_password_hash(u["pw_hash"], str(b.get("current") or "")):
        _fail(u["email"])
        return _err("Your current password isn't right.", 403)
    new = str(b.get("next") or "")
    if len(new) < MIN_PASSWORD:
        return _err(f"Use at least {MIN_PASSWORD} characters for the new password.")
    if len(new) > 200:
        return _err("That password is too long.")
    con = db()
    con.execute("UPDATE users SET pw_hash = ? WHERE id = ?", (generate_password_hash(new), u["id"]))
    keep = _hash_token(request.cookies.get(COOKIE, ""))
    con.execute("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", (u["id"], keep))     # every other device is signed out
    con.commit()
    return jsonify(ok=True)


# ── customers ──────────────────────────────────────────────────────────────
def _valid_customer(c) -> bool:
    return isinstance(c, dict) and isinstance(c.get("id"), str) and 0 < len(c["id"]) <= 80


@bp.get("/customers")
@login_required
def list_customers():
    rows = db().execute("SELECT data FROM customers WHERE user_id = ? ORDER BY seq", (current_user()["id"],)).fetchall()
    return jsonify(customers=[json.loads(r["data"]) for r in rows])


@bp.post("/customers")
@login_required
def add_customers():
    items = (request.get_json(silent=True) or {}).get("customers")
    if not isinstance(items, list) or not items or not all(_valid_customer(c) for c in items):
        return _err("Send { customers: [ ... ] }.")
    con, uid = db(), current_user()["id"]
    seq = int(con.execute("SELECT COALESCE(MAX(seq), 0) AS m FROM customers WHERE user_id = ?", (uid,)).fetchone()["m"]) + 1
    con.executemany(
        "INSERT INTO customers (user_id, id, data, seq) VALUES (?, ?, ?, ?) "
        "ON CONFLICT (user_id, id) DO UPDATE SET data = excluded.data",
        [(uid, c["id"], json.dumps(c, separators=(",", ":")), seq + i) for i, c in enumerate(items)],
    )
    con.commit()
    return jsonify(ok=True, added=len(items))


@bp.put("/customers/<cid>")
@login_required
def update_customer(cid):
    c = request.get_json(silent=True) or {}
    if not _valid_customer(c) or c["id"] != cid:
        return _err("That customer doesn't look right.")
    con = db()
    n = con.execute("UPDATE customers SET data = ? WHERE user_id = ? AND id = ?", (json.dumps(c, separators=(",", ":")), current_user()["id"], cid)).rowcount
    con.commit()
    return jsonify(ok=True) if n else _err("Customer not found.", 404)


@bp.delete("/customers/<cid>")
@login_required
def delete_customer(cid):
    con = db()
    con.execute("DELETE FROM customers WHERE user_id = ? AND id = ?", (current_user()["id"], cid))
    con.commit()
    return jsonify(ok=True)


# ── wiring ─────────────────────────────────────────────────────────────────
PROTECTED = {("POST", "/api/predict"), ("POST", "/api/pandu")}


def init_accounts(app):
    init_db()
    app.register_blueprint(bp)

    @app.teardown_appcontext
    def _close(_exc):
        con = g.pop("db", None)
        if con is not None:
            con.close()

    @app.before_request
    def _guard():
        if (request.method, request.path) in PROTECTED and current_user() is None:
            return _err("Please sign in.", 401)

    @app.after_request
    def _headers(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        if request.path.startswith("/api/auth") or request.path.startswith("/api/customers"):
            resp.headers["Cache-Control"] = "no-store"
        return resp
