import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Pool único por proceso. En desarrollo Next recarga módulos con HMR,
 * así que se guarda en globalThis para no abrir conexiones de más.
 * La conexión usa las variables estándar PG* (PGHOST, PGUSER, …).
 */
const globalForDb = globalThis as unknown as { __koraPool?: Pool };

function createPool() {
  const schemaName = process.env.DB_SCHEMA;
  if (schemaName && !/^[a-z_][a-z0-9_]*$/.test(schemaName)) {
    throw new Error("DB_SCHEMA inválido");
  }
  return new Pool({
    max: 10,
    idleTimeoutMillis: 30_000,
    options: schemaName ? `-c search_path=${schemaName}` : undefined,
  });
}

const pool = globalForDb.__koraPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.__koraPool = pool;

export const db = drizzle(pool, { schema });

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type TenantContext = { institutionId: string; userId: string };

/**
 * Ejecuta `fn` en una transacción con el contexto del colegio y del usuario
 * fijado en la sesión de PostgreSQL (`SET LOCAL`). Eso activa RLS y le dice
 * a los triggers de auditoría quién hizo el cambio.
 *
 * TODA lectura o escritura de datos de un colegio debe pasar por aquí.
 */
export function withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.institution_id', ${ctx.institutionId}, true),
                 set_config('app.user_id', ${ctx.userId}, true)`,
    );
    return fn(tx);
  });
}
