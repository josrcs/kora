import "server-only";

export type ErrorPostgres = { code?: string; hint?: string; constraint?: string; message: string };

/**
 * Extrae el error de PostgreSQL (Drizzle lo envuelve en `cause`).
 * Códigos útiles: 23505 único, 23503 FK, 23514 check, 23P01 exclusión,
 * P0001 RAISE EXCEPTION de un trigger (el `hint` dice cuál).
 */
export function errorPostgres(err: unknown): ErrorPostgres | null {
  for (let e: unknown = err; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    if ("code" in e && typeof (e as { code: unknown }).code === "string" && "severity" in e) {
      return e as unknown as ErrorPostgres;
    }
  }
  return null;
}
