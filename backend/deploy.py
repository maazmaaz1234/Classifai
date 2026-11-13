"""Things that only matter when Classifai runs ONLINE (a free host), in one place. app.py calls init_deploy(app).

* Serves the built website (the frontend's dist folder), so the site and the API live at ONE web address.
  That also means no cross-site cookie or CORS problems. On your own PC with `npm run dev` nothing here is used.
* Trusts the host's proxy headers (TRUST_PROXY=1), so the sign-in cookie is marked Secure on https.
* Browser safety headers.
"""
from __future__ import annotations

import os
from pathlib import Path

from flask import jsonify, send_from_directory
from werkzeug.exceptions import NotFound
from werkzeug.middleware.proxy_fix import ProxyFix

HERE = Path(__file__).parent


def init_deploy(app):
    if os.getenv("TRUST_PROXY", "").strip() in ("1", "true", "yes"):
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    site = Path(os.getenv("SITE_DIR") or HERE.parent / "frontend" / "dist")
    if (site / "index.html").is_file():
        @app.get("/", defaults={"path": ""})
        @app.get("/<path:path>")
        def website(path):
            if path.startswith("api/") or path == "api":
                return jsonify(error="Not found."), 404
            try:
                if path:
                    resp = send_from_directory(site, path)
                    if path.startswith("assets/"):                  # file names change whenever the code changes
                        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
                    return resp
            except NotFound:
                pass
            resp = send_from_directory(site, "index.html")          # every other address is the single-page app
            resp.headers["Cache-Control"] = "no-cache"
            return resp

    @app.after_request
    def safety_headers(resp):
        resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        resp.headers.setdefault("Referrer-Policy", "same-origin")
        resp.headers.setdefault("Permissions-Policy", "microphone=(self), camera=()")
        return resp
