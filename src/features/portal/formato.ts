/** Formatos compartidos por la vista web y el PDF (zona horaria de Colombia). */
const ZONA = "America/Bogota";

export function fechaLarga(iso: string) {
  const fecha = iso.length === 10 ? new Date(`${iso}T12:00:00-05:00`) : new Date(iso);
  return fecha.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: ZONA });
}

export function fechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: ZONA,
  });
}

export const TIPO_ANOTACION: Record<string, string> = {
  ACADEMICA: "Académica",
  DISCIPLINARIA: "Disciplinaria",
  CONVIVENCIA: "Convivencia",
  FELICITACION: "Felicitación",
  COMPROMISO: "Compromiso",
};

export const SITUACION: Record<string, string> = {
  TIPO_I: "Situación tipo I",
  TIPO_II: "Situación tipo II",
  TIPO_III: "Situación tipo III",
};

export const TIPO_DOCUMENTO: Record<string, string> = {
  RC: "R.C.",
  TI: "T.I.",
  CC: "C.C.",
  CE: "C.E.",
  NUIP: "NUIP",
  PPT: "PPT",
  PA: "Pasaporte",
};
