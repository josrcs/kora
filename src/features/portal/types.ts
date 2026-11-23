import type { DesempenoCodigo, Escala } from "@/lib/grading/calc";

export type EstudianteOpcion = {
  id: string;
  nombre: string;
  documento: string;
  grupo: string | null;
};

export type Membrete = {
  nombre: string;
  codigoDane: string;
  nit: string | null;
  municipio: string;
  departamento: string;
  direccion: string | null;
  telefono: string | null;
  resolucion: string | null;
  logoUrl: string | null;
};

export type PeriodoPortal = {
  id: string;
  numero: number;
  nombre: string;
  porcentaje: number;
  fechaInicio: string;
  fechaFin: string;
  cerrado: boolean;
};

export type DatosEstudiante = {
  id: string;
  nombre: string;
  tipoDocumento: string;
  documento: string;
  grado: string;
  grupo: string;
  jornada: string;
  director: string | null;
};

export type FilaBoletin = {
  asignatura: string;
  intensidadHoraria: number;
  docente: string;
  /** Nota de cada periodo publicado (cerrado) hasta el periodo del boletín, por id de periodo. */
  notas: Record<string, number | null>;
  nota: number | null;
  desempeno: DesempenoCodigo | null;
  fallas: number;
  /** Ponderado de los periodos publicados con nota (pesos del año). */
  acumulado: number | null;
  logros: { codigo: string; descripcion: string }[];
  observacion: string | null;
};

export type BoletinData = {
  membrete: Membrete;
  anio: number;
  estudiante: DatosEstudiante;
  periodo: PeriodoPortal;
  /** Periodos publicados hasta el del boletín (columnas P1, P2…). */
  periodosPublicados: PeriodoPortal[];
  escala: Escala;
  areas: { nombre: string; filas: FilaBoletin[] }[];
  resumen: { promedio: number | null; enBajo: number; fallas: number; sinNota: number };
  generadoEn: string;
};

export type AsistenciaData = {
  periodos: (PeriodoPortal & { semanas: number })[];
  filas: { asignatura: string; area: string; intensidadHoraria: number; fallas: Record<string, number>; total: number }[];
  totales: Record<string, number>;
};

export type AnotacionPortal = {
  id: string;
  fecha: string;
  tipo: "ACADEMICA" | "DISCIPLINARIA" | "CONVIVENCIA" | "FELICITACION" | "COMPROMISO";
  situacion: "TIPO_I" | "TIPO_II" | "TIPO_III" | null;
  descripcion: string;
  accionPedagogica: string | null;
  autor: string;
  descargos: string | null;
  descargosAt: string | null;
  firma: { acudiente: string; en: string } | null;
  puedeFirmar: boolean;
  puedeDescargos: boolean;
};
