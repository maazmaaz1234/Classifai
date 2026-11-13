// Account settings: change your name and picture, or your password.
import { useState } from "react";
import Modal from "./Modal";
import AvatarPicker from "./AvatarPicker";
import { changePassword, updateProfile, useSession } from "../lib/auth";
import { toast } from "../lib/toast";

export default function SettingsModal({ onClose }) {
  const user = useSession();
  const [name, setName] = useState(user?.name || "");
  const [pic, setPic] = useState({ photo: user?.photo || null, avatar: user?.avatar || "" });
  const [profErr, setProfErr] = useState("");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [busy, setBusy] = useState(false);

  const saveProfile = async (e, close) => {
    e.preventDefault();
    setProfErr("");
    try {
      await updateProfile({ name, photo: pic.photo, avatar: pic.avatar || user.avatar });
      toast("Profile updated");
      close();
    } catch (err) { setProfErr(err.message); }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setPwErr("");
    if (!cur) return setPwErr("Enter your current password.");
    if (next.length < 8) return setPwErr("Use at least 8 characters for the new password.");
    if (next !== again) return setPwErr("The two new passwords don't match.");
    setBusy(true);
    try {
      await changePassword(cur, next);
      setCur(""); setNext(""); setAgain("");
      toast("Password changed");
    } catch (err) { setPwErr(err.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Profile and settings" subtitle={user?.email} onClose={onClose} size={600}>
      {({ close }) => (
        <div className="stack">
          <form onSubmit={(e) => saveProfile(e, close)} noValidate className="cform-sec">
            <h3 className="cform-h">Your profile</h3>
            <AvatarPicker photo={pic.photo} avatar={pic.avatar} name={name} fallbackSeed={user?.email} onChange={setPic} />
            <div className="field">
              <label htmlFor="st-name">Name</label>
              <input id="st-name" className="input" value={name} onChange={(e) => { setName(e.target.value); setProfErr(""); }} autoComplete="name" />
            </div>
            {profErr && <p className="form-error" role="alert">{profErr}</p>}
            <div className="row"><button type="submit" className="btn btn-primary btn-sm">Save profile</button></div>
          </form>

          <form onSubmit={savePassword} noValidate className="cform-sec">
            <h3 className="cform-h">Change password <small>you also use it to confirm edits and removals</small></h3>
            <div className="form-grid">
              <div className="field span-2"><label htmlFor="st-cur">Current password</label><input id="st-cur" type="password" className="input" value={cur} onChange={(e) => { setCur(e.target.value); setPwErr(""); }} autoComplete="current-password" /></div>
              <div className="field"><label htmlFor="st-new">New password</label><input id="st-new" type="password" className="input" value={next} onChange={(e) => { setNext(e.target.value); setPwErr(""); }} autoComplete="new-password" placeholder="At least 8 characters" /></div>
              <div className="field"><label htmlFor="st-again">New password again</label><input id="st-again" type="password" className="input" value={again} onChange={(e) => { setAgain(e.target.value); setPwErr(""); }} autoComplete="new-password" /></div>
            </div>
            {pwErr && <p className="form-error" role="alert">{pwErr}</p>}
            <div className="row"><button type="submit" className="btn btn-ghost btn-sm" disabled={busy}>{busy ? "Updating…" : "Update password"}</button></div>
          </form>
          <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={close}>Close</button></div>
        </div>
      )}
    </Modal>
  );
}
