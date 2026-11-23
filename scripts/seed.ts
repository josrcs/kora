/**
 * Datos de prueba a ESCALA REAL: tres colegios aislados, cada uno con
 * 11 grados × 4 salones × 46 estudiantes = 2.024 estudiantes y su acudiente.
 *
 *   npm run db:reset      (recrea el esquema y corre este seed; tarda 1-3 minutos)
 *
 * En cada colegio:
 *   - Primaria (1° a 5°): un docente titular por salón que dicta todas las asignaturas.
 *   - Secundaria y media (6° a 11°): un docente por asignatura y bloque de grados
 *     (6°-8° y 9°-11°): p. ej. el de Matemáticas 9°-11° tiene 12 cursos.
 *   - Cada planilla tiene 4 actividades por periodo (Quiz, Taller, Evaluación, Ser).
 *   - Periodos terminados: notas completas, corte preventivo y cierre. El periodo
 *     en curso: docentes al día, a medias y sin empezar, y su corte preventivo.
 *   - Ventana de recuperación abierta del periodo anterior, con algunas ya registradas.
 *   - Anotaciones en el observador y un proceso disciplinario abierto.
 *
 * Las cuentas de prueba (src/features/auth/demo.ts) entran con la clave de su rol
 * y sin cambio obligatorio. Los demás usuarios usan SEED_PASSWORD ("Kora.2026") y
 * deben cambiarla. Los nombres de colegios (salvo Jorge Isaacs) y los DANE son ficticios.
 *
 * Para cargar cientos de miles de notas en segundos, durante la carga masiva se
 * desactivan los triggers de validación de notas (solo aquí, en desarrollo: los
 * datos se generan coherentes) y se vuelven a activar antes de terminar.
 */
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { calcularDefinitiva } from "../src/lib/grading/calc";
import { CLAVES_DEMO, CUENTAS_DEMO, type CuentaDemo } from "../src/features/auth/demo";

if (process.env.NODE_ENV === "production") throw new Error("El seed no corre en producción");

const schema = process.env.DB_SCHEMA || "public";
const PASSWORD = process.env.SEED_PASSWORD || "Kora.2026";
const HOY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

/* ---------- aleatoriedad determinista ---------- */
let semilla = 20261122;
function rand() {
  semilla |= 0;
  semilla = (semilla + 0x6d2b79f5) | 0;
  let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
function normal(media: number, desviacion: number) {
  return media + desviacion * Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}
const nota = (media: number) => Math.min(5, Math.max(1, Math.round(normal(media, 0.5) * 10) / 10));

const NOMBRES_F = ["Valentina", "Sofía", "Isabella", "Mariana", "Daniela", "Gabriela", "Salomé", "Luciana", "Sara", "Valeria", "Camila", "María José", "Ana Lucía", "Juliana", "Natalia", "Paula Andrea", "Laura", "Danna", "Emily", "Allison", "Karol Melissa", "Daniela Natalia", "Luisa Fernanda", "Yuliana"];
const NOMBRES_M = ["Santiago", "Sebastián", "Matías", "Samuel", "Alejandro", "Nicolás", "Juan David", "Juan José", "Miguel Ángel", "Andrés Felipe", "Daniel", "Thiago", "Emmanuel", "Jerónimo", "Kevin", "Brayan", "Jesús David", "Luis Carlos", "Dylan", "Mateo", "Emmanuel Andrés", "Andrés Andrés", "Jhon Fredy"];
const APELLIDOS = ["Rodríguez", "Martínez", "García", "Pérez", "Gómez", "Hernández", "López", "Díaz", "Sánchez", "Ramírez", "Torres", "Castro", "Barrios", "Charris", "De la Hoz", "Mendoza", "Orozco", "Polo", "Ariza", "Pacheco", "Escorcia", "Rada", "Fontalvo", "Ospino", "Cantillo", "Montes", "Padilla", "Villa", "Jiménez", "Navarro", "Ortiz", "Puello", "Cassiani", "Pájaro", "Julio", "Marrugo", "Caraballo", "Zúñiga"];
const nombrePersona = (mujer: boolean): [string, string] => [pick(mujer ? NOMBRES_F : NOMBRES_M), `${pick(APELLIDOS)} ${pick(APELLIDOS)}`];

const SUBJECTS = [
  { area: "Matemáticas", nombre: "Matemáticas", abrev: "MAT", ih: 5 },
  { area: "Humanidades: Lengua Castellana e Idiomas Extranjeros", nombre: "Lengua Castellana", abrev: "LEN", ih: 4 },
  { area: "Humanidades: Lengua Castellana e Idiomas Extranjeros", nombre: "Inglés", abrev: "ING", ih: 3 },
  { area: "Ciencias Naturales y Educación Ambiental", nombre: "Ciencias Naturales", abrev: "CNA", ih: 4 },
  { area: "Ciencias Sociales, Historia, Geografía, Constitución Política y Democracia", nombre: "Ciencias Sociales", abrev: "SOC", ih: 4 },
  { area: "Tecnología e Informática", nombre: "Tecnología e Informática", abrev: "TEC", ih: 2 },
  { area: "Educación Física, Recreación y Deportes", nombre: "Educación Física", abrev: "EFI", ih: 2 },
  { area: "Educación Artística y Cultural", nombre: "Educación Artística", abrev: "ART", ih: 2 },
  { area: "Educación Ética y en Valores Humanos", nombre: "Ética y Valores", abrev: "ETI", ih: 1 },
  { area: "Educación Religiosa", nombre: "Educación Religiosa", abrev: "REL", ih: 1 },
] as const;

const ACTIVIDADES = [
  { nombre: "Quiz temático", pct: 30 },
  { nombre: "Taller en clase", pct: 30 },
  { nombre: "Evaluación escrita", pct: 25 },
  { nombre: "Actitudinal / Ser", pct: 15 },
] as const;

const SALONES = ["A", "B", "C", "D"] as const;
const POR_SALON = 46;

type Colegio = {
  slug: string;
  nombre: string;
  dane: string;
  municipio: string;
  departamento: string;
  dominio: string;
  periodos: { nombre: string; pct: number; ini: string; fin: string; limite: string }[];
  prefijoEstudiante: number;
  prefijoAcudiente: number;
};

const COLEGIOS: Colegio[] = [
  {
    slug: "ied-jorge-isaacs",
    nombre: "Institución Educativa Distrital Jorge Isaacs",
    dane: "108001003421",
    municipio: "Barranquilla",
    departamento: "Atlántico",
    dominio: "jorgeisaacs.edu.co",
    periodos: [
      { nombre: "Periodo 1", pct: 25, ini: "2026-01-26", fin: "2026-04-10", limite: "2026-04-17" },
      { nombre: "Periodo 2", pct: 25, ini: "2026-04-13", fin: "2026-06-19", limite: "2026-06-26" },
      { nombre: "Periodo 3", pct: 25, ini: "2026-07-06", fin: "2026-09-18", limite: "2026-09-25" },
      { nombre: "Periodo 4", pct: 25, ini: "2026-09-21", fin: "2026-11-27", limite: "2026-12-02" },
    ],
    prefijoEstudiante: 1100000000,
    prefijoAcudiente: 52000000,
  },
  {
    slug: "ied-los-corales",
    nombre: "Institución Educativa Distrital Los Corales",
    dane: "113001999998",
    municipio: "Cartagena",
    departamento: "Bolívar",
    dominio: "loscorales.edu.co",
    periodos: [
      { nombre: "Periodo 1", pct: 25, ini: "2026-01-26", fin: "2026-03-27", limite: "2026-04-03" },
      { nombre: "Periodo 2", pct: 25, ini: "2026-04-06", fin: "2026-06-12", limite: "2026-06-19" },
      { nombre: "Periodo 3", pct: 25, ini: "2026-07-06", fin: "2026-09-11", limite: "2026-09-18" },
      { nombre: "Periodo 4", pct: 25, ini: "2026-09-14", fin: "2026-11-27", limite: "2026-12-02" },
    ],
    prefijoEstudiante: 1200000000,
    prefijoAcudiente: 53000000,
  },
  {
    slug: "ie-tecnica-las-palmas",
    nombre: "Institución Educativa Técnica Industrial Las Palmas",
    dane: "108758999997",
    municipio: "Soledad",
    departamento: "Atlántico",
    dominio: "laspalmas.edu.co",
    periodos: [
      { nombre: "Periodo 1", pct: 30, ini: "2026-01-26", fin: "2026-05-08", limite: "2026-05-15" },
      { nombre: "Periodo 2", pct: 30, ini: "2026-05-11", fin: "2026-08-28", limite: "2026-09-04" },
      { nombre: "Periodo 3", pct: 40, ini: "2026-08-31", fin: "2026-11-27", limite: "2026-11-30" },
    ],
    prefijoEstudiante: 1300000000,
    prefijoAcudiente: 54000000,
  },
];

type Q = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

async function main() {
  const db = new Client({ options: `-c search_path=${schema}` });
  await db.connect();
  const q: Q = async (text, params = []) => (await db.query(text, params)).rows;
  const t0 = Date.now();
  try {
    if ((await q("SELECT 1 FROM institutions WHERE slug = ANY($1)", [COLEGIOS.map((c) => c.slug)])).length) {
      console.log("Ya hay colegios de prueba. Para regenerar: npm run db:reset");
      return;
    }
    const hashGeneral = await bcrypt.hash(PASSWORD, 10);
    const hashDemo: Record<string, string> = {};
    for (const [rol, clave] of Object.entries(CLAVES_DEMO)) hashDemo[rol] = await bcrypt.hash(clave, 10);

    for (const colegio of COLEGIOS) {
      await db.query("BEGIN");
      const r = await sembrarColegio(colegio, q, hashGeneral, hashDemo);
      await db.query("COMMIT");
      console.log(`✓ ${colegio.nombre}: ${r.estudiantes} estudiantes, ${r.docentes} docentes, ${r.calificaciones.toLocaleString("es-CO")} definitivas, ${r.notasActividad.toLocaleString("es-CO")} notas de actividades (${Math.round((Date.now() - t0) / 1000)} s)`);
    }
    console.log("\nCuentas de prueba (colegio · rol · documento · clave):");
    for (const c of CUENTAS_DEMO) console.log(`  ${c.slug.padEnd(22)} ${c.rol.padEnd(12)} ${c.documento.padEnd(11)} ${CLAVES_DEMO[c.rol]}`);
  } catch (err) {
    await db.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    // Por si algo falló a mitad: los triggers siempre vuelven a quedar activos.
    await db.query("ALTER TABLE grades ENABLE TRIGGER USER; ALTER TABLE activity_scores ENABLE TRIGGER USER;").catch(() => {});
    await db.end();
  }
}

/** Inserta filas en lotes con json_to_recordset. `cols` define nombre y tipo SQL de cada columna. */
async function insertar(q: Q, tabla: string, cols: [string, string][], filas: Record<string, unknown>[], devolver?: string) {
  const resultado: Record<string, unknown>[] = [];
  const LOTE = 4000;
  const nombres = cols.map(([c]) => c).join(", ");
  const tipos = cols.map(([c, t]) => `${c} ${t}`).join(", ");
  for (let i = 0; i < filas.length; i += LOTE) {
    const r = await q(
      `INSERT INTO ${tabla} (${nombres}) SELECT ${nombres} FROM json_to_recordset($1::json) AS x(${tipos})${devolver ? ` RETURNING ${devolver}` : ""}`,
      [JSON.stringify(filas.slice(i, i + LOTE))],
    );
    resultado.push(...r);
  }
  return resultado;
}

async function sembrarColegio(c: Colegio, q: Q, hashGeneral: string, hashDemo: Record<string, string>) {
  const demos = CUENTAS_DEMO.filter((d) => d.slug === c.slug);
  const demo = (rol: CuentaDemo["rol"]) => demos.filter((d) => d.rol === rol);
  const esDemo = (doc: string) => demos.some((d) => d.documento === doc);

  /* ---------- institución y SIEE (escala nacional 1.0–5.0, aprueba 3.0, recuperación hasta 3.0) ---------- */
  const [{ id: inst }] = await q<{ id: string }>(
    `INSERT INTO institutions (nombre, slug, codigo_dane, nit, municipio, departamento, direccion, telefono, resolucion,
                               escala_min, escala_max, nota_aprobatoria, decimales_nota, nota_max_recuperacion)
     VALUES ($1, $2, $3, '900000000-0', $4, $5, 'Calle 00 # 00-00', '(605) 000 0000', $6, 1.0, 5.0, 3.0, 1, 3.0) RETURNING id`,
    [c.nombre, c.slug, c.dane, c.municipio, c.departamento, `Aprobada por Resolución N.° 0000 de 2000 · Código DANE ${c.dane}`],
  );
  await q(`SELECT set_config('app.institution_id', $1, true)`, [inst]);
  await q(
    `INSERT INTO performance_levels (institution_id, desempeno, nota_desde, nota_hasta) VALUES
       ($1, 'BAJO', 1.0, 2.9), ($1, 'BASICO', 3.0, 3.9), ($1, 'ALTO', 4.0, 4.5), ($1, 'SUPERIOR', 4.6, 5.0)`,
    [inst],
  );

  const crearUsuarios = async (us: { tipo: string; doc: string; nombres: string; apellidos: string; rol: string; telefono?: string | null; email?: string | null }[]) => {
    const filas = us.map((u) => ({
      institution_id: inst,
      tipo_documento: u.tipo,
      documento_identidad: u.doc,
      nombres: u.nombres,
      apellidos: u.apellidos,
      email: u.email ?? null,
      telefono: u.telefono ?? null,
      password_hash: esDemo(u.doc) ? hashDemo[u.rol] : hashGeneral,
      rol: u.rol,
      debe_cambiar_password: !esDemo(u.doc),
    }));
    const r = await insertar(
      q,
      "users",
      [["institution_id", "uuid"], ["tipo_documento", "tipo_documento"], ["documento_identidad", "text"], ["nombres", "text"], ["apellidos", "text"], ["email", "text"], ["telefono", "text"], ["password_hash", "text"], ["rol", "rol_usuario"], ["debe_cambiar_password", "boolean"]],
      filas,
      "id, documento_identidad",
    );
    return new Map(r.map((x) => [x.documento_identidad as string, x.id as string]));
  };

  /* ---------- personal directivo ---------- */
  const staff = (rol: CuentaDemo["rol"]) => demo(rol)[0];
  const directivos = await crearUsuarios(
    (["ADMIN", "RECTOR", "COORDINATOR"] as const).map((rol) => ({ tipo: "CC", doc: staff(rol).documento, nombres: staff(rol).nombres, apellidos: staff(rol).apellidos, rol, email: `${rol.toLowerCase()}@${c.dominio}` })),
  );
  const admin = directivos.get(staff("ADMIN").documento)!;
  const coordinador = directivos.get(staff("COORDINATOR").documento)!;
  await q(`SELECT set_config('app.user_id', $1, true)`, [admin]);

  /* ---------- año, periodos, grados, áreas, asignaturas ---------- */
  const [{ id: anio }] = await q<{ id: string }>(
    `INSERT INTO academic_years (institution_id, anio, fecha_inicio, fecha_fin, activo) VALUES ($1, 2026, $2, $3, true) RETURNING id`,
    [inst, c.periodos[0].ini, c.periodos.at(-1)!.fin],
  );
  const periodoId: string[] = [];
  for (const [i, p] of c.periodos.entries()) {
    const [{ id }] = await q<{ id: string }>(
      `INSERT INTO periods (institution_id, academic_year_id, numero, nombre, porcentaje, fecha_inicio, fecha_fin, fecha_limite_notas, fecha_corte)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $6::date + ($7::date - $6::date) / 2) RETURNING id`,
      [inst, anio, i + 1, p.nombre, p.pct, p.ini, p.fin, p.limite],
    );
    periodoId.push(id);
  }
  // Periodo en curso: el que contiene hoy (o el último).
  const enCurso = Math.max(0, c.periodos.findIndex((p) => p.ini <= HOY && HOY <= p.fin));

  const gradoId: Record<number, string> = {};
  for (let g = 1; g <= 11; g++) {
    const [{ id }] = await q<{ id: string }>(`INSERT INTO grade_levels (institution_id, codigo, nombre, nivel) VALUES ($1, $2, $3, $4) RETURNING id`, [
      inst,
      g,
      `${g}°`,
      g <= 5 ? "BASICA_PRIMARIA" : g <= 9 ? "BASICA_SECUNDARIA" : "MEDIA",
    ]);
    gradoId[g] = id;
  }
  const areaId: Record<string, string> = {};
  const materiaId: Record<string, string> = {};
  for (const [i, s] of SUBJECTS.entries()) {
    areaId[s.area] ??= (await q<{ id: string }>(`INSERT INTO areas (institution_id, nombre, orden) VALUES ($1, $2, $3) RETURNING id`, [inst, s.area, i + 1]))[0].id;
    materiaId[s.abrev] = (await q<{ id: string }>(`INSERT INTO subjects (institution_id, area_id, nombre, abreviatura) VALUES ($1, $2, $3, $4) RETURNING id`, [inst, areaId[s.area], s.nombre, s.abrev]))[0].id;
  }

  /* ---------- docentes ---------- */
  // Primaria: un titular por salón (1°-A … 5°-D). Secundaria: un docente por asignatura y bloque.
  type Docente = { doc: string; nombres: string; apellidos: string };
  const docentes: Docente[] = [];
  const titular: Record<string, string> = {}; // grupo → doc
  const porMateriaBloque: Record<string, string> = {}; // "MAT|9" (bloque 6 o 9) → doc
  let consecutivoDocente = 100;
  const nuevoDocente = (fijo?: CuentaDemo): string => {
    if (fijo) {
      docentes.push({ doc: fijo.documento, nombres: fijo.nombres, apellidos: fijo.apellidos });
      return fijo.documento;
    }
    const [n, a] = nombrePersona(rand() < 0.6);
    const doc = String(1000000000 + consecutivoDocente++);
    docentes.push({ doc, nombres: n, apellidos: a });
    return doc;
  };
  const [docenteMat, docentePrimaria] = demo("TEACHER");
  for (let g = 1; g <= 5; g++) for (const s of SALONES) titular[`${g}-${s}`] = nuevoDocente(g === 3 && s === "A" ? docentePrimaria : undefined);
  for (const bloque of [6, 9]) for (const s of SUBJECTS) porMateriaBloque[`${s.abrev}|${bloque}`] = nuevoDocente(bloque === 9 && s.abrev === "MAT" ? docenteMat : undefined);
  const idDocente = await crearUsuarios(docentes.map((d) => ({ tipo: "CC", doc: d.doc, nombres: d.nombres, apellidos: d.apellidos, rol: "TEACHER" })));
  // Estado de cada docente en el periodo en curso: al día, a medias o sin empezar (el demo de matemáticas, a medias).
  const avance: Record<string, "completo" | "parcial" | "sin"> = {};
  for (const d of docentes) avance[d.doc] = d.doc === docenteMat.documento ? "parcial" : rand() < 0.45 ? "completo" : rand() < 0.7 ? "parcial" : "sin";

  /* ---------- grupos ---------- */
  const grupos: { codigo: string; grado: number; id: string }[] = [];
  for (let g = 1; g <= 11; g++) {
    for (const s of SALONES) {
      const codigo = `${g}-${s}`;
      const director = g <= 5 ? titular[codigo] : porMateriaBloque[`${pick(SUBJECTS).abrev}|${g <= 8 ? 6 : 9}`];
      const [{ id }] = await q<{ id: string }>(
        `INSERT INTO groups (institution_id, academic_year_id, grade_level_id, codigo, jornada, director_id, capacidad)
         VALUES ($1, $2, $3, $4, $5, $6, 48) RETURNING id`,
        [inst, anio, gradoId[g], codigo, g <= 5 ? "TARDE" : "MANANA", idDocente.get(director)],
      );
      grupos.push({ codigo, grado: g, id });
    }
  }

  /* ---------- estudiantes, acudientes y matrículas ---------- */
  const estudiantesDemo = demo("STUDENT");
  const acudientesDemo = demo("GUARDIAN");
  type Est = { doc: string; grupo: string; mujer: boolean; nombres: string; apellidos: string; media: number };
  const estudiantes: Est[] = [];
  let consecutivo = 100;
  for (const g of grupos) {
    const fijos = estudiantesDemo.filter((e) => e.grupo === g.codigo);
    for (let i = 0; i < POR_SALON; i++) {
      const fijo = fijos[i];
      const mujer = rand() < 0.5;
      const [n, a] = nombrePersona(mujer);
      // Desempeño base: mayoría entre básico y alto, ~15 % en riesgo, algunos superiores.
      const media = rand() < 0.15 ? 2.2 + rand() * 0.7 : 3.1 + rand() * 1.6;
      estudiantes.push({
        doc: fijo ? fijo.documento : String(c.prefijoEstudiante + consecutivo++),
        grupo: g.codigo,
        mujer,
        nombres: fijo?.nombres ?? n,
        apellidos: fijo?.apellidos ?? a,
        media: fijo?.documento === estudiantesDemo[0]?.documento ? 2.9 : media, // la primera demo tiene materias en riesgo
      });
    }
  }
  const idEst = await crearUsuarios(
    estudiantes.map((e) => ({ tipo: Number(e.grupo.split("-")[0]) >= 7 ? "TI" : "RC", doc: e.doc, nombres: e.nombres, apellidos: e.apellidos, rol: "STUDENT" })),
  );
  // Acudientes: uno por estudiante, salvo los acudientes demo que tienen a cargo a varios.
  const acudidoPorDemo = new Map<string, CuentaDemo>();
  for (const a of acudientesDemo) for (const d of a.acudidos ?? []) acudidoPorDemo.set(d, a);
  const acudientes: { doc: string; nombres: string; apellidos: string; telefono: string; de: string[]; parentesco: string }[] = [];
  let consecutivoAcu = 100;
  for (const a of acudientesDemo) acudientes.push({ doc: a.documento, nombres: a.nombres, apellidos: a.apellidos, telefono: "3001234567", de: a.acudidos ?? [], parentesco: a.detalle.startsWith("Padre") ? "Padre" : "Madre" });
  for (const e of estudiantes) {
    if (acudidoPorDemo.has(e.doc)) continue;
    const madre = rand() < 0.7;
    const [n] = nombrePersona(madre);
    acudientes.push({
      doc: String(c.prefijoAcudiente + consecutivoAcu++),
      nombres: n,
      apellidos: `${e.apellidos.split(" ")[madre ? 1 : 0] ?? pick(APELLIDOS)} ${pick(APELLIDOS)}`,
      telefono: `300${String(1000000 + consecutivoAcu * 37).slice(-7)}`,
      de: [e.doc],
      parentesco: madre ? "Madre" : "Padre",
    });
  }
  const idAcu = await crearUsuarios(acudientes.map((a) => ({ tipo: "CC", doc: a.doc, nombres: a.nombres, apellidos: a.apellidos, rol: "GUARDIAN", telefono: a.telefono })));
  await insertar(
    q,
    "student_guardians",
    [["institution_id", "uuid"], ["student_id", "uuid"], ["guardian_id", "uuid"], ["parentesco", "text"], ["es_principal", "boolean"]],
    acudientes.flatMap((a) => a.de.map((d) => ({ institution_id: inst, student_id: idEst.get(d), guardian_id: idAcu.get(a.doc), parentesco: a.parentesco, es_principal: true }))),
  );
  const grupoId = new Map(grupos.map((g) => [g.codigo, g.id]));
  const matriculas = await insertar(
    q,
    "enrollments",
    [["institution_id", "uuid"], ["academic_year_id", "uuid"], ["group_id", "uuid"], ["student_id", "uuid"], ["fecha_matricula", "date"]],
    estudiantes.map((e) => ({ institution_id: inst, academic_year_id: anio, group_id: grupoId.get(e.grupo), student_id: idEst.get(e.doc), fecha_matricula: c.periodos[0].ini })),
    "id, student_id, group_id",
  );
  const estPorId = new Map(estudiantes.map((e) => [idEst.get(e.doc)!, e]));
  const matriculasPorGrupo = new Map<string, { id: string; studentId: string; media: number }[]>();
  for (const m of matriculas) {
    const lista = matriculasPorGrupo.get(m.group_id as string) ?? [];
    lista.push({ id: m.id as string, studentId: m.student_id as string, media: estPorId.get(m.student_id as string)!.media });
    matriculasPorGrupo.set(m.group_id as string, lista);
  }

  /* ---------- carga académica ---------- */
  type Asig = { id: string; groupId: string; grado: number; materia: string; docente: string };
  const filasCarga = grupos.flatMap((g) =>
    SUBJECTS.map((s) => {
      const doc = g.grado <= 5 ? titular[g.codigo] : porMateriaBloque[`${s.abrev}|${g.grado <= 8 ? 6 : 9}`];
      return { institution_id: inst, group_id: g.id, subject_id: materiaId[s.abrev], teacher_id: idDocente.get(doc), intensidad_horaria: s.ih, _materia: s.abrev, _grado: g.grado, _doc: doc };
    }),
  );
  const creadas = await insertar(
    q,
    "teacher_assignments",
    [["institution_id", "uuid"], ["group_id", "uuid"], ["subject_id", "uuid"], ["teacher_id", "uuid"], ["intensidad_horaria", "smallint"]],
    filasCarga,
    "id, group_id, subject_id",
  );
  const asignaciones: Asig[] = creadas.map((r) => {
    const f = filasCarga.find((x) => x.group_id === r.group_id && x.subject_id === r.subject_id)!;
    return { id: r.id as string, groupId: f.group_id, grado: f._grado, materia: f._materia, docente: f._doc };
  });

  /* ---------- logros (descripción curricular del boletín) ---------- */
  const logros: Record<string, unknown>[] = [];
  for (const [pi] of c.periodos.entries())
    for (let g = 1; g <= 11; g++)
      for (const s of SUBJECTS)
        for (const [j, l] of [
          ["L1", `Comprende los conceptos de ${s.nombre} trabajados en el periodo.`],
          ["L2", `Aplica lo aprendido en ${s.nombre} para resolver situaciones de su contexto.`],
          ["L3", "Demuestra responsabilidad, respeto y participación en las actividades de clase."],
        ].entries())
          logros.push({ institution_id: inst, period_id: periodoId[pi], subject_id: materiaId[s.abrev], grade_level_id: gradoId[g], codigo: l[0], descripcion: l[1], porcentaje: [40, 40, 20][j], orden: j + 1 });
  await insertar(q, "achievements", [["institution_id", "uuid"], ["period_id", "uuid"], ["subject_id", "uuid"], ["grade_level_id", "uuid"], ["codigo", "text"], ["descripcion", "text"], ["porcentaje", "numeric"], ["orden", "smallint"]], logros);

  /* ---------- actividades y notas, periodo por periodo ---------- */
  // Carga masiva: se apagan los triggers de validación de notas (ver encabezado) y se reactivan al final.
  await q("ALTER TABLE grades DISABLE TRIGGER USER; ALTER TABLE activity_scores DISABLE TRIGGER USER;");
  let totalDefinitivas = 0;
  let totalNotas = 0;
  for (let pi = 0; pi <= enCurso; pi++) {
    const enCursoAhora = pi === enCurso;
    const acts: Record<string, unknown>[] = [];
    for (const a of asignaciones) {
      if (enCursoAhora && avance[a.docente] === "sin") continue; // aún no ha creado actividades
      for (const [o, act] of ACTIVIDADES.entries()) {
        acts.push({ institution_id: inst, teacher_assignment_id: a.id, period_id: periodoId[pi], nombre: act.nombre, porcentaje: act.pct, orden: o + 1, created_by: idDocente.get(a.docente) });
      }
    }
    const actCreadas = await insertar(
      q,
      "activities",
      [["institution_id", "uuid"], ["teacher_assignment_id", "uuid"], ["period_id", "uuid"], ["nombre", "text"], ["porcentaje", "numeric"], ["orden", "smallint"], ["created_by", "uuid"]],
      acts,
      "id, teacher_assignment_id, orden, porcentaje",
    );
    const actsPorAsig = new Map<string, { id: string; orden: number; porcentaje: number }[]>();
    for (const r of actCreadas) {
      const l = actsPorAsig.get(r.teacher_assignment_id as string) ?? [];
      l.push({ id: r.id as string, orden: Number(r.orden), porcentaje: Number(r.porcentaje) });
      actsPorAsig.set(r.teacher_assignment_id as string, l);
    }

    const scores: Record<string, unknown>[] = [];
    const definitivas: Record<string, unknown>[] = [];
    for (const a of asignaciones) {
      const lista = actsPorAsig.get(a.id);
      if (!lista) continue;
      const estado = enCursoAhora ? avance[a.docente] : "completo";
      const sesgo = (rand() - 0.5) * 0.6; // asignaturas más o menos exigentes
      const ms = matriculasPorGrupo.get(a.groupId)!;
      for (const [i, m] of ms.entries()) {
        const notas: Record<string, number> = {};
        for (const act of lista) {
          // A medias: Quiz y Taller completos, Evaluación hasta el 60 % de la lista, Ser vacío.
          if (estado === "parcial" && (act.orden === 4 || (act.orden === 3 && i > ms.length * 0.6))) continue;
          notas[act.id] = nota(m.media + sesgo);
          scores.push({ institution_id: inst, activity_id: act.id, enrollment_id: m.id, nota: notas[act.id], updated_by: idDocente.get(a.docente) });
        }
        const def = calcularDefinitiva(lista, notas, 1).nota;
        const fallas = rand() < 0.6 ? 0 : Math.floor(rand() * (rand() < 0.15 ? 12 : 4)) + 1;
        if (def === null && fallas === 0) continue;
        definitivas.push({
          institution_id: inst,
          enrollment_id: m.id,
          teacher_assignment_id: a.id,
          period_id: periodoId[pi],
          nota: def,
          fallas,
          observacion: def !== null && def < 3 && rand() < 0.4 ? pick(["Debe presentar plan de mejoramiento.", "Se cita al acudiente para acordar compromisos."]) : null,
          updated_by: idDocente.get(a.docente),
        });
      }
    }
    await insertar(q, "activity_scores", [["institution_id", "uuid"], ["activity_id", "uuid"], ["enrollment_id", "uuid"], ["nota", "numeric"], ["updated_by", "uuid"]], scores);
    await insertar(
      q,
      "grades",
      [["institution_id", "uuid"], ["enrollment_id", "uuid"], ["teacher_assignment_id", "uuid"], ["period_id", "uuid"], ["nota", "numeric"], ["fallas", "smallint"], ["observacion", "text"], ["updated_by", "uuid"]],
      definitivas,
    );
    totalNotas += scores.length;
    totalDefinitivas += definitivas.length;

    // Corte preventivo (con el periodo aún abierto) y cierre de los periodos terminados.
    await q(`SELECT fn_generar_corte_preventivo($1, $2)`, [periodoId[pi], coordinador]);
    if (!enCursoAhora) {
      const cierre = `${c.periodos[pi].limite} 18:00-05`;
      await q(`UPDATE periods SET cerrado = true, cerrado_at = $1, cerrado_por = $2 WHERE id = $3`, [cierre, coordinador, periodoId[pi]]);
      await q(`INSERT INTO period_events (institution_id, period_id, accion, actor_id, created_at) VALUES ($1, $2, 'CIERRE', $3, $4)`, [inst, periodoId[pi], coordinador, cierre]);
    }
  }
  await q("ALTER TABLE grades ENABLE TRIGGER USER; ALTER TABLE activity_scores ENABLE TRIGGER USER;");

  /* ---------- recuperaciones del periodo anterior (ventana abierta), con triggers activos ---------- */
  if (enCurso > 0) {
    const perdidas = await q<{ id: string; nota: string; teacher_id: string }>(
      `SELECT g.id, g.nota, ta.teacher_id FROM grades g JOIN teacher_assignments ta ON ta.id = g.teacher_assignment_id
        WHERE g.period_id = $1 AND g.nota < 3.0 ORDER BY g.id`,
      [periodoId[enCurso - 1]],
    );
    let n = 0;
    for (const p of perdidas) {
      const doc = docentes.find((d) => idDocente.get(d.doc) === p.teacher_id)!.doc;
      // Los docentes al día ya registraron la mayoría de recuperaciones; el demo de matemáticas aún no.
      if (doc === docenteMat.documento || avance[doc] !== "completo" || rand() < 0.3) continue;
      const rec = Math.min(3, Math.max(Number(p.nota), Math.round((2.6 + rand() * 0.6) * 10) / 10));
      await q(`UPDATE grades SET nota_recuperacion = $1, recuperada_at = now(), recuperada_por = $2, updated_by = $2 WHERE id = $3`, [rec, p.teacher_id, p.id]);
      n++;
    }
    console.log(`  · ${n} recuperaciones registradas de ${perdidas.length} asignaturas perdidas en ${c.periodos[enCurso - 1].nombre}`);
  }

  /* ---------- observador ---------- */
  const g9 = grupoId.get(demo("STUDENT")[0]?.grupo ?? "9-A")!;
  const [m1, m2, m3] = matriculasPorGrupo.get(g9)!;
  const mat9 = asignaciones.find((a) => a.groupId === g9 && a.materia === "MAT")!;
  const docMat = idDocente.get(mat9.docente)!;
  const pIni = c.periodos[enCurso].ini;
  await q(
    `INSERT INTO student_observer (institution_id, student_id, enrollment_id, autor_id, fecha, tipo, situacion, descripcion, accion_pedagogica)
     VALUES ($1, $2, $3, $4, $5, 'CONVIVENCIA', 'TIPO_I', 'Interrumpe reiteradamente la clase con comentarios fuera de lugar hacia sus compañeros.', 'Diálogo reflexivo y compromiso verbal de mejorar su comportamiento.'),
            ($1, $6, $7, $4, $5, 'FELICITACION', NULL, 'Obtuvo el primer puesto en las Olimpiadas de Matemáticas institucionales.', NULL)`,
    [inst, m1.studentId, m1.id, docMat, pIni, m2.studentId, m2.id],
  );
  await q(
    `INSERT INTO student_observer (institution_id, student_id, enrollment_id, autor_id, fecha, tipo, situacion, descripcion, accion_pedagogica, proceso)
     VALUES ($1, $2, $3, $4, $5, 'DISCIPLINARIA', 'TIPO_II', 'Agresión verbal reiterada a un compañero durante el descanso, con testigos.', 'Citación al acudiente y remisión al comité de convivencia.', 'ABIERTO')`,
    [inst, m3.studentId, m3.id, coordinador, pIni],
  );

  return { estudiantes: estudiantes.length, docentes: docentes.length, calificaciones: totalDefinitivas, notasActividad: totalNotas };
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
