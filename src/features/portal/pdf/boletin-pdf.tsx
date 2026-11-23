import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { DESEMPENO_LABEL, formatNota, reprueba } from "@/lib/grading/calc";
import { fechaHora, fechaLarga, TIPO_DOCUMENTO } from "../formato";
import type { BoletinData, FilaBoletin } from "../types";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Logo de Kora para el pie del boletín (PNG: react-pdf no lee WebP). */
const LOGO_KORA = { data: readFileSync(path.join(process.cwd(), "public", "kora-logo-pdf.png")), format: "png" as const };

/**
 * Boletín oficial en PDF (tamaño carta). Usa Helvetica (fuente estándar del
 * PDF, cubre tildes y eñes) para no depender de archivos de fuentes.
 */
const C = {
  ink: "#0f172a",
  soft: "#334155",
  muted: "#64748b",
  line: "#cbd5e1",
  lineSoft: "#e2e8f0",
  navy: "#1e3a8a",
  band: "#f1f5f9",
  bad: "#b91c1c",
};

const s = StyleSheet.create({
  page: { paddingTop: 32, paddingBottom: 48, paddingHorizontal: 36, fontFamily: "Helvetica", fontSize: 8.5, color: C.ink },
  membrete: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 8, borderBottomWidth: 1.5, borderBottomColor: C.navy },
  sello: { width: 44, height: 44, borderWidth: 0.75, borderColor: C.line, alignItems: "center", justifyContent: "center" },
  selloTexto: { fontFamily: "Helvetica-Bold", fontSize: 14, color: C.navy },
  colegio: { fontFamily: "Helvetica-Bold", fontSize: 10.5, textTransform: "uppercase" },
  pequeno: { fontSize: 7.5, color: C.muted, marginTop: 1.5 },
  informe: { alignItems: "flex-end" },
  informeTitulo: { fontFamily: "Helvetica-Bold", fontSize: 8, color: C.navy, letterSpacing: 0.6 },
  informePeriodo: { fontFamily: "Helvetica-Bold", fontSize: 10, marginTop: 2 },
  datos: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, borderWidth: 0.75, borderColor: C.line },
  dato: { width: "25%", paddingVertical: 4, paddingHorizontal: 6, borderRightWidth: 0.75, borderBottomWidth: 0.75, borderColor: C.lineSoft },
  datoAncho: { width: "50%" },
  etiqueta: { fontSize: 6.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  valor: { fontFamily: "Helvetica-Bold", fontSize: 8.5, marginTop: 1 },
  tabla: { marginTop: 10, borderWidth: 0.75, borderColor: C.line },
  cabecera: { flexDirection: "row", backgroundColor: C.navy, color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 7 },
  area: { backgroundColor: C.band, paddingVertical: 3, paddingHorizontal: 6, fontFamily: "Helvetica-Bold", fontSize: 7, color: C.soft, textTransform: "uppercase", borderTopWidth: 0.75, borderTopColor: C.line },
  fila: { flexDirection: "row", borderTopWidth: 0.5, borderTopColor: C.lineSoft },
  celdaAsig: { flex: 1, paddingVertical: 4, paddingHorizontal: 6 },
  celda: { width: 34, paddingVertical: 4, textAlign: "center" },
  celdaDes: { width: 56, paddingVertical: 4, textAlign: "center" },
  asignatura: { fontFamily: "Helvetica-Bold" },
  docente: { fontSize: 7, color: C.muted, marginTop: 1 },
  logro: { flexDirection: "row", marginTop: 2, fontSize: 7, color: C.soft },
  logroCodigo: { width: 14, color: C.muted },
  observacion: { marginTop: 2.5, fontSize: 7, color: C.soft, fontFamily: "Helvetica-Oblique" },
  resumen: { flexDirection: "row", gap: 12, marginTop: 10 },
  caja: { flex: 1, borderWidth: 0.75, borderColor: C.line, padding: 6 },
  resumenFila: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  firmas: { flexDirection: "row", gap: 40, marginTop: 44, paddingHorizontal: 24 },
  firma: { flex: 1, borderTopWidth: 0.75, borderTopColor: C.ink, paddingTop: 3, alignItems: "center" },
  pie: { position: "absolute", bottom: 22, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 6.5, color: C.muted, borderTopWidth: 0.5, borderTopColor: C.lineSoft, paddingTop: 4 },
});

function iniciales(nombre: string) {
  return (
    nombre
      .replace(/\b(Institución|Educativa|Distrital|Departamental|Técnica|Colegio|IED|IE|de|del|la|las|los|y)\b/gi, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join("") || "IE"
  );
}

function BoletinPdf({ data }: { data: BoletinData }) {
  const { membrete, estudiante, periodo, periodosPublicados, escala, resumen } = data;
  const d = escala.decimales;
  const nota = (n: number | null) => (n === null ? "—" : formatNota(n, d));

  const Fila = ({ f }: { f: FilaBoletin }) => (
    <View style={s.fila} wrap={false}>
      <View style={s.celdaAsig}>
        <Text style={s.asignatura}>{f.asignatura}</Text>
        <Text style={s.docente}>{f.docente}</Text>
        {f.logros.map((l) => (
          <View key={l.codigo} style={s.logro}>
            <Text style={s.logroCodigo}>{l.codigo}</Text>
            <Text style={{ flex: 1 }}>{l.descripcion}</Text>
          </View>
        ))}
        {f.observacion && <Text style={s.observacion}>Observación: {f.observacion}</Text>}
      </View>
      <Text style={[s.celda, { color: C.muted }]}>{f.intensidadHoraria}</Text>
      {periodosPublicados.map((p) => {
        const n = f.notas[p.id];
        return (
          <Text
            key={p.id}
            style={[
              s.celda,
              p.id === periodo.id ? { fontFamily: "Helvetica-Bold" } : { color: C.soft },
              n !== null && reprueba(n, escala) ? { color: C.bad } : {},
            ]}
          >
            {nota(n)}
          </Text>
        );
      })}
      <Text style={[s.celdaDes, f.desempeno === "BAJO" ? { color: C.bad, fontFamily: "Helvetica-Bold" } : {}]}>
        {f.desempeno ? DESEMPENO_LABEL[f.desempeno] : "Sin nota"}
      </Text>
      <Text style={s.celda}>{f.fallas || "—"}</Text>
      <Text style={[s.celda, f.acumulado !== null && reprueba(f.acumulado, escala) ? { color: C.bad } : {}]}>{nota(f.acumulado)}</Text>
    </View>
  );

  return (
    <Document
      title={`Informe académico ${periodo.nombre} ${data.anio} — ${estudiante.nombre}`}
      author={membrete.nombre}
      creator="Kora · Plataforma de Gestión Académica"
      language="es-CO"
    >
      <Page size="LETTER" style={s.page}>
        {/* Membrete (se repite en cada página) */}
        <View style={s.membrete} fixed>
          {membrete.logoUrl?.startsWith("https://") ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf no admite alt
            <Image src={membrete.logoUrl} style={{ width: 44, height: 44, objectFit: "contain" }} />
          ) : (
            <View style={s.sello}>
              <Text style={s.selloTexto}>{iniciales(membrete.nombre)}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.colegio}>{membrete.nombre}</Text>
            {membrete.resolucion && <Text style={s.pequeno}>{membrete.resolucion}</Text>}
            <Text style={s.pequeno}>
              {[membrete.nit && `NIT ${membrete.nit}`, membrete.direccion, membrete.telefono, `${membrete.municipio}, ${membrete.departamento}`]
                .filter(Boolean)
                .join("  ·  ")}
            </Text>
          </View>
          <View style={s.informe}>
            <Text style={s.informeTitulo}>INFORME ACADÉMICO</Text>
            <Text style={s.informePeriodo}>{periodo.nombre}</Text>
            <Text style={s.pequeno}>Año lectivo {data.anio}</Text>
          </View>
        </View>

        {/* Datos del estudiante */}
        <View style={s.datos}>
          <View style={[s.dato, s.datoAncho]}>
            <Text style={s.etiqueta}>Estudiante</Text>
            <Text style={s.valor}>{estudiante.nombre}</Text>
          </View>
          <View style={s.dato}>
            <Text style={s.etiqueta}>Documento</Text>
            <Text style={s.valor}>
              {TIPO_DOCUMENTO[estudiante.tipoDocumento] ?? estudiante.tipoDocumento} {estudiante.documento}
            </Text>
          </View>
          <View style={[s.dato, { borderRightWidth: 0 }]}>
            <Text style={s.etiqueta}>Grado y grupo</Text>
            <Text style={s.valor}>
              {estudiante.grado} · {estudiante.grupo}
            </Text>
          </View>
          <View style={[s.dato, s.datoAncho, { borderBottomWidth: 0 }]}>
            <Text style={s.etiqueta}>Director(a) de grupo</Text>
            <Text style={s.valor}>{estudiante.director ?? "—"}</Text>
          </View>
          <View style={[s.dato, { borderBottomWidth: 0 }]}>
            <Text style={s.etiqueta}>Jornada</Text>
            <Text style={s.valor}>{estudiante.jornada}</Text>
          </View>
          <View style={[s.dato, { borderBottomWidth: 0, borderRightWidth: 0 }]}>
            <Text style={s.etiqueta}>Periodo</Text>
            <Text style={s.valor}>
              {periodo.porcentaje}% · hasta {fechaLarga(periodo.fechaFin)}
            </Text>
          </View>
        </View>

        {/* Calificaciones */}
        <View style={s.tabla}>
          <View style={s.cabecera} fixed>
            <Text style={[s.celdaAsig, { paddingVertical: 4 }]}>ÁREA / ASIGNATURA</Text>
            <Text style={s.celda}>IH</Text>
            {periodosPublicados.map((p) => (
              <Text key={p.id} style={s.celda}>
                P{p.numero}
              </Text>
            ))}
            <Text style={s.celdaDes}>DESEMPEÑO</Text>
            <Text style={s.celda}>FALLAS</Text>
            <Text style={s.celda}>ACUM.</Text>
          </View>
          {data.areas.map((area) => (
            <View key={area.nombre}>
              <Text style={s.area} minPresenceAhead={30}>
                {area.nombre}
              </Text>
              {area.filas.map((f) => (
                <Fila key={f.asignatura} f={f} />
              ))}
            </View>
          ))}
        </View>

        {/* Resumen y escala */}
        <View style={s.resumen} wrap={false}>
          <View style={s.caja}>
            <Text style={s.etiqueta}>Resumen del periodo</Text>
            <View style={s.resumenFila}>
              <Text>Promedio</Text>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>{resumen.promedio === null ? "—" : formatNota(resumen.promedio, 2)}</Text>
            </View>
            <View style={s.resumenFila}>
              <Text>Asignaturas en desempeño bajo</Text>
              <Text style={{ fontFamily: "Helvetica-Bold", color: resumen.enBajo ? C.bad : C.ink }}>{resumen.enBajo}</Text>
            </View>
            <View style={s.resumenFila}>
              <Text>Fallas del periodo (horas)</Text>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>{resumen.fallas}</Text>
            </View>
            <View style={s.resumenFila}>
              <Text>Nota de convivencia</Text>
              <Text style={{ fontFamily: "Helvetica-Bold", color: data.convivencia.desempeno === "BAJO" ? C.bad : C.ink }}>
                {data.convivencia.nota === null ? "—" : `${formatNota(data.convivencia.nota, d)}${data.convivencia.desempeno ? ` (${DESEMPENO_LABEL[data.convivencia.desempeno]})` : ""}`}
              </Text>
            </View>
            {data.convivencia.observacion ? <Text style={[s.pequeno, { marginTop: 2 }]}>Convivencia: {data.convivencia.observacion}</Text> : null}
          </View>
          <View style={s.caja}>
            <Text style={s.etiqueta}>Escala de valoración · Decreto 1290 de 2009</Text>
            {[...escala.niveles].reverse().map((n) => (
              <View key={n.desempeno} style={s.resumenFila}>
                <Text>Desempeño {DESEMPENO_LABEL[n.desempeno].toLowerCase()}</Text>
                <Text>
                  {formatNota(n.desde, d)} – {formatNota(n.hasta, d)}
                </Text>
              </View>
            ))}
            <Text style={[s.pequeno, { marginTop: 3 }]}>
              Nota mínima aprobatoria: {formatNota(escala.aprobatoria, d)}. Acum.: promedio ponderado de los periodos publicados.
            </Text>
          </View>
        </View>

        {/* Firmas */}
        <View style={s.firmas} wrap={false}>
          <View style={s.firma}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{estudiante.director ?? " "}</Text>
            <Text style={s.pequeno}>Director(a) de grupo</Text>
          </View>
          <View style={s.firma}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}> </Text>
            <Text style={s.pequeno}>Rector(a)</Text>
          </View>
        </View>

        <View style={s.pie} fixed>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf no admite alt */}
            <Image src={LOGO_KORA} style={{ width: 46, height: 14, objectFit: "contain" }} />
            <Text>
              {membrete.nombre} · DANE {membrete.codigoDane} · Generado el {fechaHora(data.generadoEn)}
            </Text>
          </View>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function renderBoletinPdf(data: BoletinData): Promise<Buffer> {
  return renderToBuffer(<BoletinPdf data={data} />);
}
