// Auth locale du serveur de test : mots de passe haches scrypt, jetons de session.
// Les identifiants seedes sont FICTIFS (demo) ; jamais de vrais comptes ici.
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}
export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 32);
  const ref = Buffer.from(hash, "hex");
  return candidate.length === ref.length && timingSafeEqual(candidate, ref);
}
export const newToken = () => randomBytes(24).toString("hex");
