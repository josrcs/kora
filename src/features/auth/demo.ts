/**
 * Perfiles de ingreso y cuentas de prueba.
 *
 * Este módulo es la ÚNICA fuente de las cuentas de demostración: el seed
 * (scripts/seed.ts) las crea con estas claves y la pantalla de ingreso las
 * lista para autocompletar. La lista solo se muestra fuera de producción
 * (o con KORA_MOSTRAR_CUENTAS_DEMO=1); en producción no existen estas cuentas.
 *
 * Sin "server-only": lo importan el seed (Node) y la página de ingreso.
 */
// Ruta relativa (no "@/"): este archivo también lo carga el seed fuera de Next.
import type { Rol } from "../../db/schema";

export const PERFILES = [
  { id: "ESTUDIANTE", texto: "Estudiante", roles: ["STUDENT"] },
  { id: "ACUDIENTE", texto: "Acudiente", roles: ["GUARDIAN"] },
  { id: "DOCENTE", texto: "Docente", roles: ["TEACHER"] },
  { id: "COORDINADOR", texto: "Coordinador", roles: ["COORDINATOR"] },
  { id: "RECTOR", texto: "Rector", roles: ["RECTOR"] },
  { id: "SECRETARIA", texto: "Secretaría", roles: ["ADMIN"] },
] as const satisfies readonly { id: string; texto: string; roles: readonly Rol[] }[];

export type PerfilId = (typeof PERFILES)[number]["id"];

export function perfilDeRol(rol: Rol): PerfilId {
  return PERFILES.find((p) => (p.roles as readonly Rol[]).includes(rol))!.id;
}

/** Clave de las cuentas de prueba, por rol (cumplen la política: 8+ caracteres, letras y números). */
export const CLAVES_DEMO: Record<Rol, string> = {
  STUDENT: "Estudiante2026",
  GUARDIAN: "Acudiente2026",
  TEACHER: "Docente2026",
  COORDINATOR: "Coordinador2026",
  RECTOR: "Rector2026",
  ADMIN: "Admin2026",
};

export type CuentaDemo = {
  slug: string;
  rol: Rol;
  documento: string;
  nombres: string;
  apellidos: string;
  detalle: string;
  /** Estudiantes: salón donde el seed los matricula. */
  grupo?: string;
  /** Acudientes: documento del estudiante (o estudiantes) a cargo. */
  acudidos?: string[];
};

/** Personal: mismos documentos en cada colegio a propósito (son personas distintas: prueba de aislamiento). */
const personal = (slug: string, n: Record<"rector" | "coordinador" | "admin" | "docente" | "primaria", [string, string]>): CuentaDemo[] => [
  { slug, rol: "RECTOR", documento: "1000000002", nombres: n.rector[0], apellidos: n.rector[1], detalle: "Rectoría" },
  { slug, rol: "COORDINATOR", documento: "1000000003", nombres: n.coordinador[0], apellidos: n.coordinador[1], detalle: "Coordinación académica" },
  { slug, rol: "ADMIN", documento: "1000000001", nombres: n.admin[0], apellidos: n.admin[1], detalle: "Secretaría académica" },
  { slug, rol: "TEACHER", documento: "1000000004", nombres: n.docente[0], apellidos: n.docente[1], detalle: "Matemáticas 9° a 11° (12 cursos)" },
  { slug, rol: "TEACHER", documento: "1000000005", nombres: n.primaria[0], apellidos: n.primaria[1], detalle: "Titular de 3°-A (primaria)" },
];

export const CUENTAS_DEMO: CuentaDemo[] = [
  // IED Jorge Isaacs · Barranquilla
  ...personal("ied-jorge-isaacs", {
    rector: ["Martha Lucía", "Ospino Barrios"],
    coordinador: ["Jaime Alberto", "Mendoza Polo"],
    admin: ["Rosa Elena", "Barrios Charris"],
    docente: ["Andrés Felipe", "Sarmiento Orozco"],
    primaria: ["Gladys Esther", "Rada Pacheco"],
  }),
  { slug: "ied-jorge-isaacs", rol: "STUDENT", documento: "1100000001", nombres: "Valeria", apellidos: "Acosta Rada", detalle: "Estudiante de 9-A", grupo: "9-A" },
  { slug: "ied-jorge-isaacs", rol: "STUDENT", documento: "1100000002", nombres: "Mateo", apellidos: "Bolaño Rada", detalle: "Estudiante de 9-A (hermano de Valeria)", grupo: "9-A" },
  { slug: "ied-jorge-isaacs", rol: "STUDENT", documento: "1100000003", nombres: "Mariana", apellidos: "Cantillo Díaz", detalle: "Estudiante de 9-B", grupo: "9-B" },
  { slug: "ied-jorge-isaacs", rol: "GUARDIAN", documento: "52000001", nombres: "Luz Dary", apellidos: "Rada Fontalvo", detalle: "Madre de Valeria y Mateo", acudidos: ["1100000001", "1100000002"] },

  // IED Los Corales · Cartagena
  ...personal("ied-los-corales", {
    rector: ["Hernando José", "Villalba Castro"],
    coordinador: ["Ingrid Paola", "Julio Marrugo"],
    admin: ["Yenis María", "Cassiani Pérez"],
    docente: ["Wilfrido Antonio", "Herrera Blanco"],
    primaria: ["Eneida", "Caraballo Puello"],
  }),
  { slug: "ied-los-corales", rol: "STUDENT", documento: "1200000001", nombres: "Sebastián", apellidos: "De la Rosa Pájaro", detalle: "Estudiante de 10-A", grupo: "10-A" },
  { slug: "ied-los-corales", rol: "GUARDIAN", documento: "53000001", nombres: "Edilma", apellidos: "Pájaro Torres", detalle: "Madre de Sebastián", acudidos: ["1200000001"] },

  // IE Técnica Industrial Las Palmas · Soledad
  ...personal("ie-tecnica-las-palmas", {
    rector: ["Álvaro Enrique", "Ruiz Mercado"],
    coordinador: ["Lucía Fernanda", "Mendoza Ariza"],
    admin: ["Nelly Judith", "Coll Orozco"],
    docente: ["Mónica Patricia", "Ariza Rada"],
    primaria: ["Ana Beatriz", "Molina Pertuz"],
  }),
  { slug: "ie-tecnica-las-palmas", rol: "STUDENT", documento: "1300000001", nombres: "Valentina", apellidos: "Escorcia Navarro", detalle: "Estudiante de 11-A", grupo: "11-A" },
  { slug: "ie-tecnica-las-palmas", rol: "GUARDIAN", documento: "54000001", nombres: "Carlos Mario", apellidos: "Escorcia Ruiz", detalle: "Padre de Valentina", acudidos: ["1300000001"] },
];

/** ¿Se muestran las cuentas de prueba en la pantalla de ingreso? */
export function mostrarCuentasDemo() {
  return process.env.NODE_ENV !== "production" || process.env.KORA_MOSTRAR_CUENTAS_DEMO === "1";
}
