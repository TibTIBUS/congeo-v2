// Adaptateur Neon Functions (contrat vérifié : export default { fetch }, Node 24).
// Même montage que la V1 : pool pg sur DATABASE_URL (injectée par Neon) +
// attachDatabasePool, CORS limité à ALLOWED_ORIGINS, routage = handleApi du
// serveur local (même code, mêmes règles).
// ACCÈS COMME LA V1 : pas de connexion ; identité déclarée (?employee= / ?as=admin).
import pg from "pg";
import { attachDatabasePool } from "@neon/functions";
import { createPgStore } from "./db-pg.js";
import { handleApi } from "./index.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
attachDatabasePool(pool);

// Schéma injecté au bundling (esbuild define) : pas de fs dans la Function.
const SCHEMA_SQL = typeof __CONGEO_SCHEMA_SQL__ !== "undefined" ? __CONGEO_SCHEMA_SQL__ : null;

let schemaReady = null;
async function store() {
  // Une connexion dédiée par requête : les transactions (BEGIN/COMMIT avec
  // verrou de ligne) de db-pg.js exigent une connexion stable, pas le pool.
  if (!schemaReady) {
    schemaReady=(async()=>{const c=await pool.connect();try{await createPgStore(c,{seedIfEmpty:process.env.CONGEO_SEED_DEMO==='1',schemaSql:SCHEMA_SQL});}finally{c.release();}})().catch(e=>{schemaReady=null;throw e;});
  }
  await schemaReady;
  const client=await pool.connect();
  try{return {client,storeApi:await createPgStore(client,{seedIfEmpty:false,applySchema:false})};}catch(e){client.release();throw e;}

}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin");
    const allowed = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (origin && !allowed.includes(origin)) return Response.json({ error: "Origine non autorisée." }, { status: 403 });
    const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
    if (origin) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type");
      headers.set("Access-Control-Max-Age", "600");
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true, application: "congeo-v2" }, { headers });
    if (!url.pathname.startsWith("/api/")) return Response.json({ error: "Page introuvable." }, { status: 404, headers });

    let body = {};
    if (request.method === "POST" || request.method === "PUT") {
      try { body = await request.json(); } catch { body = {}; }
    }
    let client;
    try {
    const opened = await store();client=opened.client;const storeApi=opened.storeApi;
    let out;
    try {
      out = await handleApi(storeApi, request.method, url, body);
    } finally {
      client.release();
    }
    return Response.json(out.obj, { status: out.code, headers });
    }catch(e){console.error("Congéo API",e.message);return Response.json({error:"Impossible d’enregistrer. Actualisez le planning et réessayez."},{status:500,headers});}
  },
};
