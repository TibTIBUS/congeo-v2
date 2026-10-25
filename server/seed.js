// Seed du serveur de test : memes donnees fictives que la demo + comptes demo.
// Mots de passe de demonstration, documentes dans le README, jamais reels.
import { seed, OFF, D } from "../src/domain/seedData.js";
import { hashPassword } from "./auth.js";

export function seedDb() {
  const base = seed();
  const mk = (id, email, password, role, employeeId, name) =>
    ({ id, email, passwordHash: hashPassword(password), role, employeeId, name });
  return {
    ...base,
    users: [
      mk("u-admin", "admin@echoppe.test", "demo-admin", "admin", null, "Admin (fictif)"),
      mk("u-emma", "emma@echoppe.test", "demo-emma", "employee", "emma", "Emma R."),
      mk("u-hugo", "hugo@echoppe.test", "demo-hugo", "employee", "hugo", "Hugo B."),
      mk("u-lea", "lea@echoppe.test", "demo-lea", "employee", "lea", "Léa M."),
      mk("u-tom", "tom@echoppe.test", "demo-tom", "employee", "tom", "Tom D."),
      mk("u-ines", "ines@echoppe.test", "demo-ines", "employee", "ines", "Inès K."),
    ],
    sessions: {}, // jeton -> { userId, at }
  };
}
export { OFF, D };
