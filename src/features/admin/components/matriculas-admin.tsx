"use client";

import { startTransition, useActionState, useState, useTransition } from "react";
import { hoyISO, fechaCorta } from "@/lib/fechas";
import { TIPO_DOCUMENTO } from "@/features/portal/formato";
import { cambiarGrupo, consultarDocumento, matricular, restablecerClave, retirar } from "../actions/matriculas";
import type { GrupoOpcion, MatriculaFila } from "../server/matriculas";
import { estadoFormInicial, TIPOS_DOCUMENTO, type EstadoForm } from "../types";
import { BotonConfirmado, btnPrimario, btnTexto, campo, Desplegable, etiqueta, Resultado, type Accion } from "./ui";

const ROL_TEXTO: Record<string, string> = {
  ADMIN: "administración",
  COORDINATOR: "coordinación",
  TEACHER: "docente",
  STUDENT: "estudiante",
  GUARDIAN: "acudiente",
};

type DatosPersona = { tipoDocumento: string; documento: string; nombres: string; apellidos: string; telefono: string };
const vacia = (tipo: string): DatosPersona => ({ tipoDocumento: tipo, documento: "", nombres: "", apellidos: "", telefono: "" });

/** Documento + nombres con consulta al salir del campo: prellena si la persona ya existe. */
function CamposPersona({
  prefijo,
  rol,
  datos,
  onChange,
  conTelefono,
}: {
  prefijo: "" | "acudiente";
  rol: "STUDENT" | "GUARDIAN";
  datos: DatosPersona;
  onChange: (d: DatosPersona) => void;
  conTelefono?: boolean;
}) {
  const [aviso, setAviso] = useState<{ tono: "ok" | "warn" | "bad"; texto: string } | null>(null);
  const [buscando, iniciar] = useTransition();
  const n = (campoNombre: string) => (prefijo ? `${prefijo}${campoNombre[0].toUpperCase()}${campoNombre.slice(1)}` : campoNombre);

  const consultar = (documento: string) => {
    if (documento.replace(/[.\s]/g, "").length < 4) return setAviso(null);
    iniciar(async () => {
      const r = await consultarDocumento(documento);
      if ("error" in r) return setAviso({ tono: "bad", texto: r.error });
      if (!r.existe) return setAviso({ tono: "ok", texto: "No registrado: se creará con una clave temporal." });
      if (r.rol !== rol) {
        return setAviso({ tono: "bad", texto: `Ese documento pertenece a ${r.nombres} ${r.apellidos}, registrado como ${ROL_TEXTO[r.rol]}.` });
      }
      onChange({ ...datos, documento, tipoDocumento: r.tipoDocumento, nombres: r.nombres, apellidos: r.apellidos, telefono: r.telefono ?? datos.telefono });
      setAviso(
        r.matriculadoEn && rol === "STUDENT"
          ? { tono: "bad", texto: `${r.nombres} ${r.apellidos} ya tiene matrícula este año en ${r.matriculadoEn}.` }
          : { tono: "warn", texto: `Ya registrado: ${r.nombres} ${r.apellidos}. Se usará su cuenta existente.` },
      );
    });
  };

  return (
    <div className="space-y-2">
      <div className={`grid gap-3 ${conTelefono ? "sm:grid-cols-[7rem_1fr_1fr_1fr_9rem]" : "sm:grid-cols-[7rem_1fr_1fr_1fr]"}`}>
        <label className={etiqueta}>
          Tipo
          <select name={n("tipoDocumento")} value={datos.tipoDocumento} onChange={(e) => onChange({ ...datos, tipoDocumento: e.target.value })} className={campo}>
            {TIPOS_DOCUMENTO.map((t) => (
              <option key={t} value={t} title={TIPO_DOCUMENTO[t]}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className={etiqueta}>
          Documento
          <input
            name={n("documento")}
            value={datos.documento}
            onChange={(e) => onChange({ ...datos, documento: e.target.value })}
            onBlur={(e) => consultar(e.target.value)}
            required={rol === "STUDENT"}
            inputMode="numeric"
            autoComplete="off"
            className={campo}
          />
        </label>
        <label className={etiqueta}>
          Nombres
          <input name={n("nombres")} value={datos.nombres} onChange={(e) => onChange({ ...datos, nombres: e.target.value })} maxLength={80} className={campo} />
        </label>
        <label className={etiqueta}>
          Apellidos
          <input name={n("apellidos")} value={datos.apellidos} onChange={(e) => onChange({ ...datos, apellidos: e.target.value })} maxLength={80} className={campo} />
        </label>
        {conTelefono && (
          <label className={etiqueta}>
            Teléfono
            <input name={n("telefono")} value={datos.telefono} onChange={(e) => onChange({ ...datos, telefono: e.target.value })} inputMode="tel" maxLength={20} className={campo} />
          </label>
        )}
      </div>
      <p aria-live="polite" className={`min-h-4 text-xs ${aviso?.tono === "bad" ? "text-bad" : aviso?.tono === "warn" ? "text-warn" : "text-muted"}`}>
        {buscando ? "Consultando…" : aviso?.texto}
      </p>
    </div>
  );
}

export function MatricularForm({ grupo }: { grupo: GrupoOpcion }) {
  const [estado, enviar, pendiente] = useActionState(matricular, estadoFormInicial);
  const [est, setEst] = useState(vacia("TI"));
  const [acu, setAcu] = useState(vacia("CC"));
  const [parentesco, setParentesco] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [previo, setPrevio] = useState(estado);
  const [formKey, setFormKey] = useState(0);
  if (previo !== estado) {
    setPrevio(estado);
    if (estado.ok) {
      // Matrícula hecha: queda listo para la siguiente (los avisos de consulta se reinician con la key).
      setEst(vacia(est.tipoDocumento));
      setAcu(vacia("CC"));
      setParentesco("");
      setFormKey((k) => k + 1);
    }
  }

  return (
    <div className="space-y-3">
      <form
        key={formKey}
        onSubmit={(e) => {
          e.preventDefault();
          const datos = new FormData(e.currentTarget);
          startTransition(() => enviar(datos));
        }}
        className="space-y-4"
      >
        <input type="hidden" name="groupId" value={grupo.id} />
        <fieldset className="space-y-1">
          <legend className="text-xs font-semibold tracking-wide text-ink-soft uppercase">Estudiante</legend>
          <CamposPersona prefijo="" rol="STUDENT" datos={est} onChange={setEst} />
        </fieldset>
        <fieldset className="space-y-1">
          <legend className="text-xs font-semibold tracking-wide text-ink-soft uppercase">Acudiente (opcional)</legend>
          <CamposPersona prefijo="acudiente" rol="GUARDIAN" datos={acu} onChange={setAcu} conTelefono />
          <label className={`${etiqueta} max-w-xs`}>
            Parentesco
            <input
              name="acudienteParentesco"
              value={parentesco}
              onChange={(e) => setParentesco(e.target.value)}
              list="parentescos"
              maxLength={30}
              required={acu.documento.trim() !== ""}
              className={campo}
            />
            <datalist id="parentescos">
              {["Madre", "Padre", "Abuela", "Abuelo", "Tía", "Tío", "Hermana", "Hermano", "Tutor legal"].map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
        </fieldset>
        <div className="flex flex-wrap items-end gap-3">
          <label className={etiqueta}>
            Fecha de matrícula
            <input type="date" name="fechaMatricula" value={fecha} onChange={(e) => setFecha(e.target.value)} required className={campo} />
          </label>
          <button type="submit" disabled={pendiente} className={btnPrimario}>
            {pendiente ? "Matriculando…" : `Matricular en ${grupo.codigo}`}
          </button>
        </div>
      </form>
      <Resultado estado={estado} />
    </div>
  );
}

export function TablaMatriculas({ filas, grupo, grupos }: { filas: MatriculaFila[]; grupo: GrupoOpcion; grupos: GrupoOpcion[] }) {
  const [verRetirados, setVerRetirados] = useState(false);
  // El resultado de cambiar de grupo o retirar va aquí: la fila desaparece de la lista y con ella su formulario.
  const [aviso, setAviso] = useState<EstadoForm>(estadoFormInicial);
  const activas = filas.filter((f) => f.estado === "ACTIVA");
  const retiradas = filas.filter((f) => f.estado !== "ACTIVA");
  const visibles = verRetirados ? filas : activas;
  const mismoGrado = grupos.filter((g) => g.gradeLevelId === grupo.gradeLevelId && g.id !== grupo.id);

  return (
    <div className="rounded-sm border border-line bg-surface">
      {(aviso.ok || aviso.error) && (
        <div className="flex items-start justify-between gap-2 border-b border-line bg-canvas px-4 py-2">
          <Resultado estado={aviso} />
          <button type="button" onClick={() => setAviso(estadoFormInicial)} className={btnTexto}>
            Cerrar
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
        <p className="text-xs text-muted">
          {activas.length} activos{retiradas.length > 0 && ` · ${retiradas.length} retirados o trasladados`}
        </p>
        {retiradas.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-ink-soft">
            <input type="checkbox" checked={verRetirados} onChange={(e) => setVerRetirados(e.target.checked)} />
            Mostrar retirados
          </label>
        )}
      </div>
      {visibles.length === 0 ? (
        <p className="px-4 py-3 text-muted">No hay estudiantes matriculados en {grupo.codigo}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <caption className="sr-only">Estudiantes de {grupo.codigo}</caption>
            <thead className="text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-1.5 font-medium">Estudiante</th>
                <th scope="col" className="px-2 py-1.5 font-medium">Documento</th>
                <th scope="col" className="px-2 py-1.5 font-medium">Acudiente</th>
                <th scope="col" className="px-4 py-1.5"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <FilaMatricula key={f.enrollmentId} fila={f} destinos={mismoGrado} onResultado={setAviso} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type Panel = "grupo" | "retiro" | null;

/** Envía a una acción y reporta el resultado al contenedor (que sobrevive aunque esta fila desaparezca). */
function FormFila({
  accion,
  onResultado,
  boton,
  children,
}: {
  accion: Accion;
  onResultado: (r: EstadoForm) => void;
  boton: string;
  children: React.ReactNode;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        iniciar(async () => {
          const r = await accion(estadoFormInicial, datos);
          setError(r.error);
          if (r.ok) onResultado(r);
        });
      }}
      className="space-y-3"
    >
      {children}
      <button type="submit" disabled={pendiente} className={btnPrimario}>
        {pendiente ? "Guardando…" : boton}
      </button>
      {error && (
        <p role="alert" className="text-xs text-bad">
          {error}
        </p>
      )}
    </form>
  );
}

function FilaMatricula({ fila: f, destinos, onResultado }: { fila: MatriculaFila; destinos: GrupoOpcion[]; onResultado: (r: EstadoForm) => void }) {
  const [panel, setPanel] = useState<Panel>(null);
  const activa = f.estado === "ACTIVA";
  return (
    <>
      <tr className={`border-t border-line align-top ${activa ? "" : "text-muted"}`}>
        <td className="px-4 py-1.5">
          <p className={activa ? "font-medium" : ""}>{f.nombre}</p>
          {!activa && (
            <p className="text-xs">
              {f.estado === "RETIRADA" ? "Retirado" : "Trasladado a otra institución"} el {f.fechaRetiro && fechaCorta(f.fechaRetiro, true)}
              {f.motivoRetiro && ` · ${f.motivoRetiro}`}
            </p>
          )}
          {activa && f.debeCambiarPassword && <p className="text-xs text-muted">Aún no ha ingresado (clave temporal)</p>}
        </td>
        <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">
          <span className="text-xs text-muted">{f.tipoDocumento}</span> {f.documento}
        </td>
        <td className="px-2 py-1.5">
          {f.acudiente ?? <span className="text-xs text-warn">Sin acudiente</span>}
          {f.telefonoAcudiente && <span className="block text-xs text-muted tabular-nums">{f.telefonoAcudiente}</span>}
        </td>
        <td className="px-4 py-1.5 text-right whitespace-nowrap">
          {activa && (
            <span className="inline-flex flex-wrap items-center justify-end gap-1">
              <button type="button" onClick={() => setPanel(panel === "grupo" ? null : "grupo")} aria-expanded={panel === "grupo"} className={btnTexto}>
                Cambiar de grupo
              </button>
              <button type="button" onClick={() => setPanel(panel === "retiro" ? null : "retiro")} aria-expanded={panel === "retiro"} className={`${btnTexto} hover:text-bad`}>
                Retirar
              </button>
              <BotonConfirmado
                accion={restablecerClave}
                campos={{ id: f.studentId }}
                texto="Nueva clave"
                pregunta="¿Generar una clave temporal nueva?"
                confirmar="Generar"
                peligro
              />
            </span>
          )}
        </td>
      </tr>
      {panel === "grupo" && (
        <tr className="bg-canvas">
          <td colSpan={4} className="px-4 py-3">
            {destinos.length === 0 ? (
              <p className="text-xs text-muted">No hay otro grupo del mismo grado este año.</p>
            ) : (
              <FormFila accion={cambiarGrupo} boton="Cambiar de grupo" onResultado={onResultado}>
                <input type="hidden" name="enrollmentId" value={f.enrollmentId} />
                <label className={`${etiqueta} max-w-xs`}>
                  Grupo destino
                  <select name="groupId" className={campo}>
                    {destinos.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.codigo} · {g.matriculados} estudiantes
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-muted">
                  Sus calificaciones (también las de periodos cerrados) pasan a las mismas asignaturas del grupo destino; los valores no cambian.
                </p>
              </FormFila>
            )}
          </td>
        </tr>
      )}
      {panel === "retiro" && (
        <tr className="bg-canvas">
          <td colSpan={4} className="px-4 py-3">
            <FormFila accion={retirar} boton="Registrar retiro" onResultado={onResultado}>
              <input type="hidden" name="enrollmentId" value={f.enrollmentId} />
              <div className="grid gap-3 sm:grid-cols-[14rem_10rem_1fr]">
                <label className={etiqueta}>
                  Tipo
                  <select name="estado" className={campo}>
                    <option value="RETIRADA">Retiro / deserción</option>
                    <option value="TRASLADADA">Traslado a otra institución</option>
                  </select>
                </label>
                <label className={etiqueta}>
                  Fecha
                  <input type="date" name="fechaRetiro" defaultValue={hoyISO()} required className={campo} />
                </label>
                <label className={etiqueta}>
                  Motivo
                  <input name="motivo" required minLength={5} maxLength={300} placeholder="Ej.: cambio de domicilio a Soledad" className={campo} />
                </label>
              </div>
              <p className="text-xs text-muted">Sus calificaciones se conservan; deja de aparecer en las planillas y en el avance de digitación.</p>
            </FormFila>
          </td>
        </tr>
      )}
    </>
  );
}

export { Desplegable };
