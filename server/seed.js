// Seed du serveur de test : mêmes données fictives que la démo navigateur.
// Accès identique à la V1 (décision utilisateur 25/10 12h57) : pas de comptes,
// le salarié choisit son nom, l'admin est à une adresse séparée.
import { seed, OFF, D } from "../src/domain/seedData.js";

export function seedDb() { return { ...seed() }; }
export { OFF, D };
