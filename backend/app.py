"""Classifai back end: your trained SVM + Pandu AI (Google Gemini).

    pip install -r requirements.txt
    python make_demo_model.py        # only if you do not have your own model.joblib yet
    cp .env.example .env             # then put your Gemini key in .env
    python app.py                    # serves http://127.0.0.1:8000  (the Vite dev server proxies /api to it)

Routes
    GET  /api/health          is the server up, is the model loaded, is Gemini connected
    POST /api/predict         { customers: [ {tenure, Contract, MonthlyCharges, ...}, ... ] }
                              -> { predictions: [ { probability, decision, reasons: [...] }, ... ] }
    GET  /api/pandu/status    { gemini: true|false, model, grounding }
    POST /api/pandu           { messages: [{role, content}], context, files: [{name, mime, data(base64)}] }
                              -> { reply, model, grounded, sources: [{title, uri}] }

The Gemini key only ever lives in backend/.env (GEMINI_API_KEY). The browser never sees it.
"""
from __future__ import annotations

import base64
import math
import os
import re
import time
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request

from accounts import init_accounts      # database + real sign-in (accounts.py)
from deploy import init_deploy          # serves the website + online settings (deploy.py)

HERE = Path(__file__).parent
load_dotenv(HERE / ".env")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 24 * 1024 * 1024        # room for a few attached images / PDFs


@app.after_request
def cors(resp):
    # Only needed if you open the built site from another origin. With the Vite proxy (npm run dev) it is not used.
    origin = os.getenv("CORS_ORIGIN")
    if origin:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        resp.headers["Access-Control-Allow-Credentials"] = "true"
    return resp


init_accounts(app)                       # creates classifai.db on first run and adds /api/auth/* and /api/customers
init_deploy(app)                         # online only: also serves the built website


# ══════════════════════════════════════════════════════════════════════════════
#  1 · The SVM
# ══════════════════════════════════════════════════════════════════════════════
_model = None
_model_error = None


def get_model():
    """Loads the joblib pipeline once. Returns None (and remembers why) if it is missing."""
    global _model, _model_error
    if _model is not None:
        return _model
    path = Path(os.getenv("MODEL_PATH", "model/churn_svm.joblib"))
    if not path.is_absolute():
        path = HERE / path
    try:
        import joblib

        _model = joblib.load(path)
        _model_error = None
    except Exception as exc:            # noqa: BLE001 - we want the reason in /api/health
        _model_error = f"{type(exc).__name__}: {exc}"
        _model = None
    return _model


def _sigmoid(x):
    return 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, x))))


def _positive_index(model) -> int:
    classes = list(getattr(model, "classes_", [0, 1]))
    want = os.getenv("POSITIVE_CLASS", "Yes")
    for cand in (1, True, "1", want, "Yes", "yes", "Churn", "churn"):
        if cand in classes:
            return classes.index(cand)
    return len(classes) - 1


def _frame(rows):
    import pandas as pd

    df = pd.DataFrame(rows)
    drop = [c.strip() for c in os.getenv("DROP_COLUMNS", "customerID").split(",") if c.strip()]
    df = df.drop(columns=[c for c in drop if c in df.columns])
    model = get_model()
    names = getattr(model, "feature_names_in_", None)
    if names is not None:                   # same columns, same order as in training
        missing = [c for c in names if c not in df.columns]
        if missing:
            raise ValueError(f"The model needs these columns, but they were not sent: {missing}. Edit toModelRow() in src/lib/predict.js.")
        df = df[list(names)]
    return df


def _scores(df):
    """-> (probabilities, decisions) as plain Python lists."""
    model = get_model()
    decision = None
    if hasattr(model, "decision_function"):
        d = model.decision_function(df)
        decision = [float(x) for x in (d if getattr(d, "ndim", 1) == 1 else d[:, _positive_index(model)])]
    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(df)[:, _positive_index(model)]
        probs = [float(p) for p in proba]
    elif decision is not None:
        probs = [_sigmoid(x) for x in decision]          # an SVC without probability=True: squash the margin score
    else:
        probs = [float(x) for x in model.predict(df)]
    return probs, decision


def _logit(p):
    p = min(0.999, max(0.001, p))
    return math.log(p / (1 - p))


# A "typical" customer. For each group of columns we swap in the typical values and see how far the score moves:
# a big drop means that group was pushing this customer toward leaving. Key names match the front end (reasonsFor).
REFERENCE = {
    "Contract": "One year", "tenure": 30, "InternetService": "DSL", "MonthlyCharges": 60.0, "TotalCharges": 1800.0,
    "PaymentMethod": "Bank transfer (automatic)", "TechSupport": "No", "OnlineSecurity": "No", "OnlineBackup": "No",
    "DeviceProtection": "No", "PaperlessBilling": "No", "SeniorCitizen": 0, "Partner": "No", "Dependents": "No",
}
GROUPS = {
    "contract": ["Contract"],
    "tenure": ["tenure", "TotalCharges"],
    "internet": ["InternetService"],
    "charges": ["MonthlyCharges", "TotalCharges"],
    "payment": ["PaymentMethod"],
    "support": ["TechSupport"],
    "security": ["OnlineSecurity"],
    "protection": ["OnlineBackup", "DeviceProtection"],
    "billing": ["PaperlessBilling"],
    "senior": ["SeniorCitizen"],
    "household": ["Partner", "Dependents"],
}
TEXT = {
    "contract": lambda r, up: ("Month-to-month contract", "No commitment: the customer can cancel any month.") if r.get("Contract") == "Month-to-month" else (f"{r.get('Contract')} contract", "A longer commitment keeps customers."),
    "tenure": lambda r, up: ("Still early", f"{r.get('tenure')} months with the service.") if up else ("Long-time customer", f"{r.get('tenure')} months with the service."),
    "internet": lambda r, up: (f"{r.get('InternetService')} plan", "This plan churns more often than the average." if up else "This plan keeps customers well."),
    "charges": lambda r, up: ("High monthly bill", f"Pays {r.get('MonthlyCharges')} a month.") if up else ("Comfortable monthly bill", f"Pays {r.get('MonthlyCharges')} a month."),
    "payment": lambda r, up: (f"Pays by {str(r.get('PaymentMethod')).lower()}", "Manual payments leave a monthly moment to cancel." if up else "Automatic payments keep customers attached."),
    "support": lambda r, up: ("No tech support", "Customers without support churn more.") if up else ("Has tech support", "Support add-on lowers churn."),
    "security": lambda r, up: ("No online security", "Customers without the add-on churn more.") if up else ("Has online security", "The add-on lowers churn."),
    "protection": lambda r, up: ("Few protection add-ons", "Backup and device protection are missing.") if up else ("Protected", "Backup or device protection lowers churn."),
    "billing": lambda r, up: ("Paperless billing", "Paperless customers churn slightly more.") if up else ("Paper bills", "Paper billing keeps customers slightly longer."),
    "senior": lambda r, up: ("Senior citizen", "Seniors churn a little more often.") if up else ("Not a senior", "Younger customers are steadier here."),
    "household": lambda r, up: ("Lives alone", "Single-person households churn more than families.") if up else ("Family household", "Partners and dependants make customers stay."),
}


def _reasons(rows, df, base_decision_prob):
    """What-if analysis, one customer at a time (small batches only: it scores the data ~12x)."""
    import pandas as pd

    out = [[] for _ in rows]
    for key, cols in GROUPS.items():
        cols = [c for c in cols if c in df.columns and c in REFERENCE]
        if not cols:
            continue
        alt = df.copy()
        for c in cols:
            alt[c] = REFERENCE[c]
        if "tenure" in cols and "MonthlyCharges" in alt.columns and "TotalCharges" in alt.columns and key == "tenure":
            alt["TotalCharges"] = (alt["MonthlyCharges"] * alt["tenure"]).round(2)
        probs, _ = _scores(alt)
        for i, p_alt in enumerate(probs):
            impact = _logit(base_decision_prob[i]) - _logit(p_alt)
            if abs(impact) < 0.12:
                continue
            label, detail = TEXT[key](rows[i], impact > 0)
            out[i].append({"key": key, "label": label, "detail": detail, "impact": round(impact, 3)})
    for lst in out:
        lst.sort(key=lambda r: -abs(r["impact"]))
    return out


@app.get("/api/health")
def health():
    return jsonify(ok=True, model=get_model() is not None, model_error=_model_error, gemini=bool(os.getenv("GEMINI_API_KEY")) or _blues_ready())


@app.post("/api/predict")
def predict():
    body = request.get_json(silent=True) or {}
    rows = body.get("customers")
    if not isinstance(rows, list) or not rows:
        return jsonify(error="Send { customers: [ ... ] }"), 400
    if get_model() is None:
        return jsonify(error="model not loaded", detail=_model_error), 503
    started = time.time()
    try:
        df = _frame(rows)
        probs, decisions = _scores(df)
        reasons = _reasons(rows, df, probs) if len(rows) <= 40 else [None] * len(rows)   # big CSV imports skip reasons: the app works them out
    except Exception as exc:            # noqa: BLE001
        return jsonify(error=str(exc)), 400
    print(f"[predict] scored {len(rows)} customers in {time.time() - started:.1f}s")
    preds = []
    for i, p in enumerate(probs):
        item = {"probability": round(p, 5)}
        if decisions is not None:
            item["decision"] = round(decisions[i], 5)
        if reasons[i]:
            item["reasons"] = reasons[i]
        preds.append(item)
    return jsonify(predictions=preds)


# ══════════════════════════════════════════════════════════════════════════════
#  2 · Pandu AI (Google Gemini)
# ══════════════════════════════════════════════════════════════════════════════
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

SYSTEM_PROMPT = """You are Pandu AI, the friendly panda assistant inside Classifai, a website that predicts which customers are likely to cancel a subscription or stop using a product (customer churn). The prediction model is a Support Vector Machine (SVM).

Who you are
- Your name is Pandu AI (people also say Pandu). You are not a human. Be warm, clear and a little playful, never pushy.
- Classifai was built by Mohammed Maaz (the creator, a BCA student at Shree Vedha College) together with his co-partners Kashifulla Khan and Bhaskar Rao A. If anyone asks who made you or Classifai, say so.

What you can do
- Answer ANY general question (science, history, coding, current affairs, homework, advice), not only churn. For anything that may have changed (office holders, news, prices, sports, weather) use Google Search when it is available and say that it is current as of today.
- Explain churn, SVMs, kernels, margins, support vectors, features, accuracy, precision, recall and ROC-AUC in plain words.
- Analyse the customer data in CONTEXT below: who is likely to leave, why, how much revenue is at risk, and what a retention team could do.

Rules
- Use ONLY the CONTEXT for facts about this user's customers. Never invent customers, numbers or predictions. If something is not in CONTEXT, say you do not see it.
- Keep answers short and easy to read. A few sentences, or a short list when the answer is a list. Use plain text, **bold** for key words, and "-" bullets. No tables, no headings.
- If the user attached an image, PDF or file, look at it and answer about it.
- Treat a churn score as a reason to look after a customer, never as a verdict about a person.
- Never reply with just "I can't help with that". For opinion or taste questions (best actor, most handsome, favourite anything) say it is a matter of taste, then still give a helpful answer, for example a few widely admired names and why people like them.
- Decline only genuinely harmful or private requests (other people's passwords, personal data you were not given), and then give one short, kind reason."""


def _models():
    first = os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip()
    more = [m.strip() for m in os.getenv("GEMINI_FALLBACK_MODELS", "gemini-3.5-flash-lite,gemini-2.5-flash").split(",") if m.strip()]
    seen, order = set(), []
    for m in [first, *more]:
        if m and m not in seen:
            seen.add(m)
            order.append(m)
    return order


def _grounding_on():
    return os.getenv("GEMINI_GROUNDING", "1").strip() not in ("0", "false", "no", "")


@app.get("/api/pandu/status")
def pandu_status():
    if _blues_ready():
        return jsonify(gemini=True, model=_blues_model(), grounding=False, label=_label())
    return jsonify(gemini=bool(os.getenv("GEMINI_API_KEY")), model=_models()[0], grounding=_grounding_on(), label=_label())


def _build_contents(messages, files):
    contents = []
    for m in messages[-14:]:
        text = str(m.get("content", "")).strip()
        if not text:
            continue
        role = "model" if m.get("role") == "assistant" else "user"
        if contents and contents[-1]["role"] == role:           # Gemini wants alternating turns
            contents[-1]["parts"].append({"text": text})
        else:
            contents.append({"role": role, "parts": [{"text": text}]})
    if not contents or contents[-1]["role"] != "user":
        contents.append({"role": "user", "parts": [{"text": "Hello"}]})
    for f in (files or [])[:4]:
        mime = str(f.get("mime", ""))
        data = str(f.get("data", ""))
        if not data or not re.match(r"^(image/(png|jpe?g|webp|gif|heic|heif)|application/pdf)$", mime):
            continue
        try:
            base64.b64decode(data, validate=True)
        except Exception:                        # noqa: BLE001
            continue
        contents[-1]["parts"].append({"inline_data": {"mime_type": mime, "data": data}})
    return contents


def _call_gemini(model, payload, key):
    return requests.post(
        GEMINI_URL.format(model=model),
        headers={"x-goog-api-key": key, "Content-Type": "application/json"},
        json=payload,
        timeout=45,
    )


# ── Bluesminds (an alternative to Gemini) ───────────────────────────────────────────────────
# Used automatically when BLUESMINDS_API_KEY *and* BLUESMINDS_MODEL are set in backend/.env.
# Take the exact model name from your Bluesminds dashboard. Remove either line to go back to Gemini.
def _label():
    """The name shown in the chat header. Change it with PANDU_LABEL in backend/.env."""
    return os.getenv("PANDU_LABEL", "Classifai AI").strip() or "Classifai AI"


def _blues_key():
    return os.getenv("BLUESMINDS_API_KEY", "").strip()


def _blues_model():
    return os.getenv("BLUESMINDS_MODEL", "").strip()


def _blues_ready():
    return bool(_blues_key() and _blues_model())


def _blues_base():
    base = os.getenv("BLUESMINDS_BASE_URL", "https://api.bluesminds.com").strip().rstrip("/")
    for tail in ("/v1/messages", "/v1/chat/completions", "/v1"):
        if base.endswith(tail):
            base = base[: -len(tail)]
    return base


def _valid_files(files):
    out = []
    for f in (files or [])[:4]:
        mime = str(f.get("mime", ""))
        data = str(f.get("data", ""))
        if not data or not re.match(r"^(image/(png|jpe?g|webp|gif)|application/pdf)$", mime):
            continue
        try:
            base64.b64decode(data, validate=True)
        except Exception:                        # noqa: BLE001
            continue
        out.append((mime, data))
    return out


def _simple_turns(messages):
    turns = []
    for m in messages[-14:]:
        text = str(m.get("content", "")).strip()
        if not text:
            continue
        role = "assistant" if m.get("role") == "assistant" else "user"
        if turns and turns[-1]["role"] == role:
            turns[-1]["text"] += "\n\n" + text
        else:
            turns.append({"role": role, "text": text})
    while turns and turns[0]["role"] != "user":
        turns.pop(0)
    if not turns or turns[-1]["role"] != "user":
        turns.append({"role": "user", "text": "Hello"})
    return turns


def _system_text(body):
    context = str(body.get("context") or "No customer data has been added yet.")[: 4000 if body.get("voice") else 12000]
    voice_note = ""
    if body.get("voice"):
        voice_note = "\n\nThis is a LIVE VOICE CALL: your answer will be spoken aloud. Reply in at most three short, natural sentences. No lists, no markdown, no links, no emoji."
    return f"{SYSTEM_PROMPT}{voice_note}\n\nCONTEXT (the signed-in user's customer data, live):\n{context}"


REFUSAL = re.compile(r"^\W*(i['’]?m|i am) (really |very )?sorry,? (but )?i (can['’]?t|cannot|am unable to|won['’]?t) |^\W*i (can['’]?t|cannot) (help|assist|answer|comply)", re.I)


def _is_refusal(text):
    """A bare 'I'm sorry, but I can't help with that.' from a model that was just being over-careful."""
    t = text.strip()
    return len(t) < 160 and bool(REFUSAL.search(t))


SMART_WORDS = ("analys", "explain", "why", "compare", "strategy", "plan", "recommend", "reduce churn", "retain", "retention",
               "write", "code", "summar", "forecast", "step by step", "difference", "how can", "how do", "how does", "what should")


def _needs_smart(question, has_files):
    q = question.lower()
    return has_files or len(q) > 180 or any(w in q for w in SMART_WORDS)


def _csv_env(name):
    return [m.strip() for m in os.getenv(name, "").split(",") if m.strip()]


def _model_order(body, question, files):
    """Which models to try, in order. Quick one first; the strong one for hard questions; the rest as back-ups."""
    fast = _blues_model()
    smart = os.getenv("BLUESMINDS_SMART_MODEL", "").strip()
    vision = os.getenv("BLUESMINDS_VISION_MODEL", "").strip()
    spare = _csv_env("BLUESMINDS_FALLBACK_MODELS")
    has_image = any(m.startswith("image/") for m, _ in files)
    if body.get("voice"):
        order = [fast, *spare]                                   # a call must feel instant: never the slow, strong model
    elif has_image and vision:
        order = [vision, smart, fast, *spare]
    elif smart and _needs_smart(question, bool(files)):
        order = [smart, fast, *spare]
    else:
        order = [fast, smart, *spare]
    seen, out = set(), []
    for m in order:
        if m and m not in seen:
            seen.add(m)
            out.append(m)
    return out


def _pandu_bluesminds(body):
    messages = body.get("messages") or []
    if not isinstance(messages, list) or not messages:
        return jsonify(error="Send { messages: [...] }"), 400
    key, base = _blues_key(), _blues_base()
    fmt = os.getenv("BLUESMINDS_FORMAT", "anthropic").strip().lower()
    turns = _simple_turns(messages)
    files = _valid_files(body.get("files"))
    system = _system_text(body)
    try:
        max_out = int(os.getenv("BLUESMINDS_MAX_TOKENS", "0")) or None
    except ValueError:
        max_out = None
    if not max_out:
        max_out = 300 if body.get("voice") else 700             # short answers come back faster
    effort = os.getenv("BLUESMINDS_REASONING_EFFORT", "").strip().lower()   # optional: low | medium | high

    def build(model):
        if fmt == "openai":
            url = f"{base}/v1/chat/completions"
            headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
            msgs = [{"role": "system", "content": system}]
            msgs += [{"role": t["role"], "content": t["text"]} for t in turns]
            pics = [(m, d) for m, d in files if m.startswith("image/")]      # PDFs are not sent in this format
            if pics:
                msgs[-1]["content"] = [{"type": "text", "text": turns[-1]["text"]}] + [
                    {"type": "image_url", "image_url": {"url": f"data:{m};base64,{d}"}} for m, d in pics
                ]
            payload = {"model": model, "messages": msgs, "temperature": 0.7, "max_tokens": max_out}
            if effort in ("low", "medium", "high"):
                payload["reasoning_effort"] = effort
            return url, headers, payload
        url = f"{base}/v1/messages"
        headers = {"x-api-key": key, "Authorization": f"Bearer {key}", "anthropic-version": "2023-06-01", "Content-Type": "application/json"}
        msgs = [{"role": t["role"], "content": t["text"]} for t in turns]
        if files:
            blocks = [{"type": "text", "text": turns[-1]["text"]}]
            for m, d in files:
                kind = "document" if m == "application/pdf" else "image"
                blocks.append({"type": kind, "source": {"type": "base64", "media_type": m, "data": d}})
            msgs[-1]["content"] = blocks
        return url, headers, {"model": model, "system": system, "messages": msgs, "max_tokens": max_out, "temperature": 0.7}

    def read_text(data):
        if fmt == "openai":
            return str(data["choices"][0]["message"]["content"] or "").strip()
        return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()

    last_code, last_detail = "gemini_failed", "Unknown error"
    refusal_seen = False
    for n, model in enumerate(_model_order(body, str(turns[-1]["text"]), files)):
        url, headers, payload = build(model)
        try:
            r = requests.post(url, headers=headers, json=payload, timeout=60 if n == 0 else 40)
        except requests.RequestException as exc:
            print(f"[Pandu] {model}: could not reach the AI service ({type(exc).__name__})")
            last_code, last_detail = "gemini_failed", f"Could not reach the AI service ({type(exc).__name__})"
            continue
        print(f"[Pandu] {model}: HTTP {r.status_code}")
        if r.status_code in (401, 403):
            return jsonify(error="bad_key", detail="The AI service rejected the API key. Check BLUESMINDS_API_KEY in backend/.env."), 401
        if r.status_code == 429:
            last_code, last_detail = "rate_limited", "The AI service says the limit was reached for now. Try again in a minute."
            continue
        if r.status_code != 200:
            last_code, last_detail = "gemini_failed", f"{model} answered {r.status_code}: {r.text[:160]}"
            continue
        try:
            text = read_text(r.json())
        except Exception:                            # noqa: BLE001
            last_code, last_detail = "gemini_failed", f"{model} sent a reply that could not be read."
            continue
        if not text:
            last_code, last_detail = "gemini_failed", f"{model} returned no text."
            continue
        if _is_refusal(text):
            print(f"[Pandu] {model}: refused, trying the next model")
            refusal_seen = True
            continue
        print(f"[Pandu] answered by {model}")
        return jsonify(reply=text, model=model, grounded=False, sources=[])
    if refusal_seen:
        return jsonify(reply="I could not get a good answer to that from my AI models. Try asking it in a different way, or ask me something else.", model="", grounded=False, sources=[])
    return jsonify(error=last_code, detail=last_detail), (429 if last_code == "rate_limited" else 502)


@app.post("/api/pandu")
def pandu():
    body = request.get_json(silent=True) or {}
    if _blues_ready():
        return _pandu_bluesminds(body)
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        return jsonify(error="no_key", detail="Add GEMINI_API_KEY (or BLUESMINDS_API_KEY and BLUESMINDS_MODEL) to backend/.env and restart the server."), 503
    messages = body.get("messages") or []
    if not isinstance(messages, list) or not messages:
        return jsonify(error="Send { messages: [...] }"), 400
    context = str(body.get("context") or "No customer data has been added yet.")[:12000]

    voice_note = ""
    if body.get("voice"):
        voice_note = "\n\nThis is a LIVE VOICE CALL: your answer will be spoken aloud. Reply in at most three short, natural sentences. No lists, no markdown, no links, no emoji."
    payload = {
        "system_instruction": {"parts": [{"text": f"{SYSTEM_PROMPT}{voice_note}\n\nCONTEXT (the signed-in user's customer data, live):\n{context}"}]},
        "contents": _build_contents(messages, body.get("files")),
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 1100},
    }
    use_search = _grounding_on()
    last_error = ""
    for model in _models():
        for with_tools in ([True, False] if use_search else [False]):
            body_out = dict(payload)
            if with_tools:
                body_out["tools"] = [{"google_search": {}}]
            try:
                r = _call_gemini(model, body_out, key)
            except requests.RequestException as exc:
                last_error = f"Could not reach Google: {type(exc).__name__}"
                break                                           # network problem: trying other models will not help
            if r.status_code == 200:
                data = r.json()
                cand = (data.get("candidates") or [{}])[0]
                parts = (cand.get("content") or {}).get("parts") or []
                text = "".join(p.get("text", "") for p in parts).strip()
                if not text:
                    reason = cand.get("finishReason") or (data.get("promptFeedback") or {}).get("blockReason") or "empty"
                    last_error = f"Gemini returned no text ({reason})."
                    break
                chunks = ((cand.get("groundingMetadata") or {}).get("groundingChunks")) or []
                sources = [{"title": c["web"].get("title", ""), "uri": c["web"].get("uri", "")} for c in chunks if c.get("web")][:5]
                return jsonify(reply=text, model=model, grounded=bool(sources), sources=sources)
            try:
                msg = (r.json().get("error") or {}).get("message", "")
            except ValueError:
                msg = r.text[:200]
            last_error = f"{r.status_code}: {msg}"
            if r.status_code in (401, 403) or "API key" in msg:
                return jsonify(error="bad_key", detail="Google rejected the API key. Check GEMINI_API_KEY in backend/.env."), 401
            if r.status_code == 429:
                return jsonify(error="rate_limited", detail="Gemini's free limit was reached for now. Try again in a minute."), 429
            if r.status_code == 400 and with_tools:
                continue                                        # this model may not allow search with these inputs: retry without it
            if r.status_code in (404, 400):
                break                                           # unknown model: try the next one
    return jsonify(error="gemini_failed", detail=last_error or "Unknown error"), 502


if __name__ == "__main__":
    get_model()
    print(f"SVM model: {'loaded' if _model is not None else 'NOT loaded (' + str(_model_error) + ')'}")
    if _blues_ready():
        print(f"Pandu AI:  Bluesminds · model {_blues_model()} · {_blues_base()}")
    else:
        print(f"Gemini:    {'key found' if os.getenv('GEMINI_API_KEY') else 'no key yet (add GEMINI_API_KEY to backend/.env)'} · model {_models()[0]}")
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "8000")), debug=False)
