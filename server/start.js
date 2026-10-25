import { createApp } from "./index.js";
import { openDb } from "./db.js";
import { createPgStore } from "./db-pg.js";

async function main() {
  const port = Number(process.env.PORT || 4180);
  const dist = new URL("../dist", import.meta.url).pathname;
  let store, label;
  if (process.env.DATABASE_URL) { // base Postgres dédiée (ex. version de test en ligne)
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    store = await createPgStore(client, { seedIfEmpty: process.env.CONGEO_SEED_DEMO !== "0" });
    label = "Postgres (DATABASE_URL)";
  } else {
    const path = process.env.CONGEO_DB || new URL("./data/server-db.json", import.meta.url).pathname;
    store = openDb(path);
    label = `fichier ${path}`;
  }
  createApp(store, dist).listen(port, () => console.log(`Congéo V2 : http://127.0.0.1:${port} — stockage : ${label} — accès sans connexion (modèle V1), admin sur /#/admin`));
}
if (import.meta.url === `file://${process.argv[1]}`) main();
