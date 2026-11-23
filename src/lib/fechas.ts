/** Fechas de calendario escolar (zona horaria de Colombia). Puro: sirve en cliente y servidor. */
const ZONA = "America/Bogota";

/** Hoy como "AAAA-MM-DD" en Colombia (no en UTC: a las 8 p. m. ya sería mañana). */
export function hoyISO(ahora = new Date()): string {
  return ahora.toLocaleDateString("en-CA", { timeZone: ZONA });
}

/** Días de calendario de `desde` a `hasta` (ambas "AAAA-MM-DD"); negativo si `hasta` ya pasó. */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

/** "27 nov." · con año si se pide. */
export function fechaCorta(iso: string, conAnio = false): string {
  const fecha = iso.length === 10 ? new Date(`${iso}T12:00:00-05:00`) : new Date(iso);
  return fecha.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: conAnio ? "numeric" : undefined,
    timeZone: ZONA,
  });
}

/** "hoy", "mañana", "en 5 días", "hace 3 días". */
export function relativoDias(dias: number): string {
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  if (dias === -1) return "ayer";
  return dias > 0 ? `en ${dias} días` : `hace ${-dias} días`;
}

/** Porcentaje entero sin pasar de 99 si falta algo (que "100 %" signifique completo). */
export function porcentajeAvance(hecho: number, total: number): number {
  if (total <= 0) return 100;
  const p = Math.floor((hecho / total) * 100);
  return hecho < total ? Math.min(p, 99) : 100;
}
