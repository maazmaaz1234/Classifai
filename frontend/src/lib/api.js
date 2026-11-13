// One small helper for talking to the Python server (accounts and customers live there, in a database).
// Errors come back as normal Error objects whose message is safe to show on screen.
import { apiBase } from "./predict";

let onSignedOut = () => {};
export const setSignedOutHandler = (fn) => { onSignedOut = fn; };

export async function api(path, { method = "GET", body, quiet = false } = {}) {
  let res;
  try {
    res = await fetch(`${apiBase}${path}`, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Can't reach the Classifai server. Start it with: python app.py (in the backend folder).");
  }
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    // the sign-in expired (or was ended on another device): go back to the sign-in page
    if (res.status === 401 && !quiet && !path.startsWith("/auth/")) onSignedOut();
    const err = new Error((data && data.error) || `The server answered with an error (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data || {};
}
