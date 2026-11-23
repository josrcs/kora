/**
 * Cálculo de calificaciones (SIEE · Decreto 1290 de 2009).
 *
 * Este módulo es PURO y se usa igual en el navegador (cálculo en vivo de la
 * planilla) y en el servidor (la definitiva que se guarda). Así lo que ve el
 * docente es exactamente lo que queda en la base de datos.
 *
 * Para evitar errores de coma flotante (0.1 + 0.2 ≠ 0.3) todo se opera en
 * CENTÉSIMAS enteras: 4.35 → 435. Los porcentajes también: 33.33 % → 3333.
 */

export type DesempenoCodigo = "SUPERIOR" | "ALTO" | "BASICO" | "BAJO";

export type NivelDesempeno = { desempeno: DesempenoCodigo; desde: number; hasta: number };

export type Escala = {
  min: number;
  max: number;
  aprobatoria: number;
  decimales: 1 | 2;
  niveles: NivelDesempeno[];
};

export const DESEMPENO_LABEL: Record<DesempenoCodigo, string> = {
  SUPERIOR: "Superior",
  ALTO: "Alto",
  BASICO: "Básico",
  BAJO: "Bajo",
};

/** 4.35 → 435 */
export const aCentesimas = (n: number) => Math.round(n * 100);

/** Redondea un valor en centésimas (puede tener fracción) a `decimales`, mitad hacia arriba. Devuelve la nota. */
export function redondearCentesimas(c: number, decimales: 1 | 2): number {
  const factor = 10 ** (2 - decimales);
  return (Math.round(c / factor + 1e-9) * factor) / 100;
}

export function redondear(n: number, decimales: 1 | 2): number {
  return redondearCentesimas(n * 100, decimales);
}

export function formatNota(n: number | null | undefined, decimales: 1 | 2): string {
  return n === null || n === undefined ? "" : n.toFixed(decimales);
}

/** Ubica la nota en la escala de desempeños del colegio (se redondea primero: 3.55 → 3.6). */
export function desempenoDe(nota: number | null | undefined, escala: Escala): DesempenoCodigo | null {
  if (nota === null || nota === undefined || Number.isNaN(nota)) return null;
  const c = aCentesimas(redondear(nota, escala.decimales));
  return escala.niveles.find((n) => c >= aCentesimas(n.desde) && c <= aCentesimas(n.hasta))?.desempeno ?? null;
}

export function reprueba(nota: number | null | undefined, escala: Escala): boolean {
  return nota !== null && nota !== undefined && aCentesimas(redondear(nota, escala.decimales)) < aCentesimas(escala.aprobatoria);
}

export type LogroPeso = { id: string; porcentaje: number };

export type ResultadoDefinitiva = {
  /** Nota del periodo. Solo existe cuando todos los logros tienen nota. */
  nota: number | null;
  /** Ponderado de los logros que ya tienen nota (informativo mientras se digita). */
  parcial: number | null;
  /** Logros sin nota. */
  faltantes: number;
};

/**
 * Definitiva del periodo = promedio ponderado de las notas de los logros.
 * Si los porcentajes no suman 100 (configuración incompleta) se normaliza
 * por la suma real, para no castigar al estudiante.
 */
export function calcularDefinitiva(
  logros: readonly LogroPeso[],
  notas: Readonly<Record<string, number | null | undefined>>,
  decimales: 1 | 2,
): ResultadoDefinitiva {
  if (logros.length === 0) return { nota: null, parcial: null, faltantes: 0 };

  let suma = 0; // centésimas × porcentaje en centésimas
  let pesoConNota = 0;
  let pesoTotal = 0;
  let faltantes = 0;

  for (const logro of logros) {
    const peso = aCentesimas(logro.porcentaje);
    pesoTotal += peso;
    const valor = notas[logro.id];
    if (valor === null || valor === undefined) {
      faltantes++;
      continue;
    }
    suma += aCentesimas(valor) * peso;
    pesoConNota += peso;
  }

  const parcial = pesoConNota > 0 ? redondearCentesimas(suma / pesoConNota, decimales) : null;
  const nota = faltantes === 0 && pesoTotal > 0 ? redondearCentesimas(suma / pesoTotal, decimales) : null;
  return { nota, parcial, faltantes };
}

export type ParseResult = { ok: true; value: number | null } | { ok: false; error: string };

/**
 * Interpreta lo que el docente digita en una celda de nota:
 *   ""      → vacío (borra la nota)
 *   "4,5"   → 4.5   (coma decimal, como se escribe en Colombia)
 *   "45"    → 4.5   (atajo de digitación rápida: sin separador y fuera de escala)
 *   "345"   → 3.45  (ídem, si el colegio usa dos decimales)
 */
export function parseNota(raw: string, escala: Escala): ParseResult {
  const texto = raw.trim().replace(",", ".");
  if (texto === "") return { ok: true, value: null };
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(texto)) return { ok: false, error: "Solo números" };

  let valor = Number(texto);
  const enEscala = (v: number) => v >= escala.min && v <= escala.max;

  if (!texto.includes(".") && !enEscala(valor)) {
    const candidatos = escala.decimales === 2 ? [valor / 10, valor / 100] : [valor / 10];
    const atajo = candidatos.find((c) => enEscala(c) && redondear(c, escala.decimales) === c);
    if (atajo !== undefined) valor = atajo;
  }

  const error = errorNota(valor, escala);
  return error ? { ok: false, error } : { ok: true, value: valor };
}

/** Valida un número ya interpretado contra la escala del colegio. Devuelve el error o null. */
export function errorNota(valor: number, escala: Escala): string | null {
  if (!Number.isFinite(valor) || valor < escala.min || valor > escala.max) {
    return `Fuera de escala (${formatNota(escala.min, escala.decimales)} – ${formatNota(escala.max, escala.decimales)})`;
  }
  if (redondear(valor, escala.decimales) !== valor) {
    return escala.decimales === 1 ? "Máximo un decimal" : "Máximo dos decimales";
  }
  return null;
}

export const FALLAS_MAX = 500;

export function parseFallas(raw: string): ParseResult {
  const texto = raw.trim();
  if (texto === "") return { ok: true, value: 0 };
  if (!/^\d{1,3}$/.test(texto)) return { ok: false, error: "Número entero de horas" };
  const valor = Number(texto);
  if (valor > FALLAS_MAX) return { ok: false, error: `Máximo ${FALLAS_MAX}` };
  return { ok: true, value: valor };
}
