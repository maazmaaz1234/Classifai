// "Add a photo" for a customer or an account: upload your own, or pick one of the 22 default pictures,
// or leave it and one is chosen automatically. Used in the add / edit customer form, sign-up and settings.
import { useRef, useState } from "react";
import Avatar from "./Avatar";
import { IconUpload } from "./icons";
import { AVATARS, avatarFits, avatarSrc } from "../lib/avatars";
import { readImage } from "../lib/store";

export default function AvatarPicker({ photo, avatar, gender = "", name = "", onChange, fallbackSeed = "", compact = false }) {
  const fileRef = useRef(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);

  const onFile = async (file) => {
    if (!file) return;
    setErr("");
    if (!file.type.startsWith("image/")) return setErr("Choose an image file.");
    try { onChange({ photo: await readImage(file, 360, true), avatar }); }
    catch (e) { setErr(e.message || "Could not use that picture."); }
  };

  // what the preview shows right now
  const preview = { photo, avatar: avatar && avatarFits(avatar, gender) ? avatar : "", name, gender, email: fallbackSeed, customerId: fallbackSeed };

  return (
    <div className={`avpick${compact ? " is-compact" : ""}`}>
      <div className="avpick-top">
        <Avatar person={preview} size={compact ? 64 : 84} className="avpick-preview" />
        <div className="avpick-actions">
          <div className="row">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}><IconUpload /> {photo ? "Change photo" : "Upload photo"}</button>
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "Hide avatars" : "Pick an avatar"}</button>
            {photo && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ photo: null, avatar })}>Remove photo</button>}
          </div>
          <small className="form-note">{photo ? "Your photo is shown everywhere." : avatar ? "No photo: this avatar is used." : "Optional. With no photo, a friendly avatar is chosen for you."}</small>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {open && (
        <div className="avpick-grid" role="listbox" aria-label="Default avatars">
          {AVATARS.filter((a) => avatarFits(a.id, gender)).map((a) => (
            <button
              key={a.id}
              type="button"
              role="option"
              aria-selected={avatar === a.id}
              aria-label={a.name}
              title={a.name}
              className={`avpick-opt${avatar === a.id ? " is-on" : ""}`}
              onClick={() => onChange({ photo, avatar: avatar === a.id ? "" : a.id })}
            >
              <img src={avatarSrc(a.id)} alt="" draggable="false" />
            </button>
          ))}
        </div>
      )}
      {err && <p className="form-error" role="alert">{err}</p>}
    </div>
  );
}
