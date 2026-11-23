import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularDefinitiva, desempenoDe, parseFallas, parseNota, reprueba, type Escala } from "./calc";

const escala: Escala = {
  min: 1,
  max: 5,
  aprobatoria: 3.6,
  decimales: 1,
  niveles: [
    { desempeno: "BAJO", desde: 1.0, hasta: 3.5 },
    { desempeno: "BASICO", desde: 3.6, hasta: 3.9 },
    { desempeno: "ALTO", desde: 4.0, hasta: 4.5 },
    { desempeno: "SUPERIOR", desde: 4.6, hasta: 5.0 },
  ],
};

test("parseNota acepta coma, punto, atajo y vacío", () => {
  assert.deepEqual(parseNota("4,5", escala), { ok: true, value: 4.5 });
  assert.deepEqual(parseNota(" 3.0 ", escala), { ok: true, value: 3 });
  assert.deepEqual(parseNota("45", escala), { ok: true, value: 4.5 });
  assert.deepEqual(parseNota("5", escala), { ok: true, value: 5 });
  assert.deepEqual(parseNota("10", escala), { ok: true, value: 1 });
  assert.deepEqual(parseNota("", escala), { ok: true, value: null });
});

test("parseNota rechaza valores inválidos", () => {
  assert.equal(parseNota("0.5", escala).ok, false);
  assert.equal(parseNota("5.1", escala).ok, false);
  assert.equal(parseNota("4.55", escala).ok, false);
  assert.equal(parseNota("51", escala).ok, false);
  assert.equal(parseNota("abc", escala).ok, false);
  assert.equal(parseNota("-3", escala).ok, false);
});

test("parseNota con dos decimales", () => {
  const e2: Escala = { ...escala, decimales: 2 };
  assert.deepEqual(parseNota("345", e2), { ok: true, value: 3.45 });
  assert.deepEqual(parseNota("4,55", e2), { ok: true, value: 4.55 });
});

test("definitiva ponderada sin errores de coma flotante", () => {
  const logros = [
    { id: "a", porcentaje: 30 },
    { id: "b", porcentaje: 30 },
    { id: "c", porcentaje: 25 },
    { id: "d", porcentaje: 15 },
  ];
  // 4.0*.30 + 3.5*.30 + 4.2*.25 + 5.0*.15 = 1.2 + 1.05 + 1.05 + 0.75 = 4.05 → 4.1
  const r = calcularDefinitiva(logros, { a: 4, b: 3.5, c: 4.2, d: 5 }, 1);
  assert.deepEqual(r, { nota: 4.1, parcial: 4.1, faltantes: 0 });
});

test("definitiva incompleta: solo parcial", () => {
  const logros = [
    { id: "a", porcentaje: 50 },
    { id: "b", porcentaje: 50 },
  ];
  assert.deepEqual(calcularDefinitiva(logros, { a: 3.2 }, 1), { nota: null, parcial: 3.2, faltantes: 1 });
  assert.deepEqual(calcularDefinitiva(logros, {}, 1), { nota: null, parcial: null, faltantes: 2 });
});

test("porcentajes que no suman 100 se normalizan", () => {
  const logros = [
    { id: "a", porcentaje: 40 },
    { id: "b", porcentaje: 40 },
  ];
  assert.equal(calcularDefinitiva(logros, { a: 3, b: 4 }, 1).nota, 3.5);
});

test("desempeño redondea antes de ubicar (3.55 → 3.6 → Básico)", () => {
  assert.equal(desempenoDe(3.55, escala), "BASICO");
  assert.equal(desempenoDe(3.54, escala), "BAJO");
  assert.equal(desempenoDe(4.6, escala), "SUPERIOR");
  assert.equal(desempenoDe(null, escala), null);
  assert.equal(reprueba(3.5, escala), true);
  assert.equal(reprueba(3.6, escala), false);
});

test("parseFallas", () => {
  assert.deepEqual(parseFallas(""), { ok: true, value: 0 });
  assert.deepEqual(parseFallas("12"), { ok: true, value: 12 });
  assert.equal(parseFallas("1.5").ok, false);
  assert.equal(parseFallas("999").ok, false);
});
