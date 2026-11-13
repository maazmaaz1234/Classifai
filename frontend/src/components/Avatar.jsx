// A round picture for a customer or for the signed-in person: their own photo if they added one, otherwise their default avatar.
import { avatarSrc, defaultAvatarFor } from "../lib/avatars";

export const pictureOf = (p) => (p ? p.photo || avatarSrc(p.avatar) || avatarSrc(defaultAvatarFor(p.customerId || p.email || p.name || "", p.gender || "")) : null);

export default function Avatar({ person, size = 44, className = "", alt = "" }) {
  const src = pictureOf(person);
  return (
    <span className={`avatar ${className}`} style={{ "--s": typeof size === "number" ? `${size}px` : size }}>
      {src ? <img src={src} alt={alt} draggable="false" /> : <b>{(person?.name || "?").trim().charAt(0).toUpperCase()}</b>}
    </span>
  );
}
