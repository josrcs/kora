import "server-only";
import { headers } from "next/headers";
import { z } from "zod";

/**
 * IP del cliente. Detrás de un proxy de confianza, la primera IP de
 * X-Forwarded-For es la del cliente; el proxy DEBE sobrescribir ese
 * encabezado, o el cliente podría falsificarlo.
 */
export async function ipCliente(): Promise<string | null> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
  return z.union([z.ipv4(), z.ipv6()]).safeParse(ip).success ? ip : null;
}
