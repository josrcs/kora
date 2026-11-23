/**
 * Aplica en orden las migraciones SQL de db/migrations que aún no se han aplicado.
 *
 *   npm run db:migrate          aplica las pendientes
 *   npm run db:reset            (solo desarrollo) borra el esquema DB_SCHEMA y lo recrea
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const schema = process.env.DB_SCHEMA || "public";
if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("DB_SCHEMA inválido");

const reset = process.argv.includes("--reset");
const dir = path.join(process.cwd(), "db", "migrations");

async function main() {
  const client = new Client({ options: `-c search_path=${schema}` });
  await client.connect();
  try {
    if (reset) {
      if (process.env.NODE_ENV === "production" || schema === "public") {
        throw new Error("--reset solo se permite en desarrollo y con un DB_SCHEMA dedicado");
      }
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      console.log(`· esquema ${schema} eliminado`);
    }
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        nombre      text PRIMARY KEY,
        aplicada_en timestamptz NOT NULL DEFAULT now()
      )`);

    const aplicadas = new Set(
      (await client.query<{ nombre: string }>("SELECT nombre FROM schema_migrations")).rows.map((r) => r.nombre),
    );
    const archivos = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

    for (const archivo of archivos) {
      if (aplicadas.has(archivo)) continue;
      const contenido = await readFile(path.join(dir, archivo), "utf8");
      await client.query(contenido); // cada archivo maneja su propio BEGIN/COMMIT
      await client.query("INSERT INTO schema_migrations (nombre) VALUES ($1)", [archivo]);
      console.log(`✓ ${archivo}`);
    }
    console.log(`Migraciones al día (esquema ${schema}).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
