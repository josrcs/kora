"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { iniciarSesion, type EstadoFormulario } from "../actions";
import { CLAVES_DEMO, PERFILES, type CuentaDemo, type PerfilId } from "../demo";
import type { InstitucionPublica } from "../server/instituciones";

const inicial: EstadoFormulario = { error: null };

const ICONO_PERFIL: Record<PerfilId, React.ReactNode> = {
  ESTUDIANTE: <path d="M1.5 6 8 3l6.5 3L8 9 1.5 6Zm2.5 1.2v3.3C5 11.7 6.4 12.5 8 12.5s3-.8 4-2V7.2" />,
  ACUDIENTE: <path d="M5.5 6.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm5.5 1a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2ZM1.5 13.5c0-2.2 1.8-4 4-4s4 1.8 4 4m1-4.5c1.9 0 3.5 1.5 3.5 3.5" />,
  DOCENTE: <path d="M6 6.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.5 14c0-2.5 2-4.5 4.5-4.5 1 0 2 .3 2.7.9M10 11l1.5 1.5L14.5 9.5" />,
  COORDINADOR: <path d="M8 1.5 13.5 3.5v4c0 3.2-2.3 5.8-5.5 7-3.2-1.2-5.5-3.8-5.5-7v-4L8 1.5Zm-2.2 6.7L7.4 9.8l3-3" />,
  RECTOR: <path d="M2 12.5h12M2.5 12.5 1.5 4.5l3.5 3L8 2.5l3 5 3.5-3-1 8" />,
  SECRETARIA: <path d="M3 2.5h7l3 3v8H3Zm7 0v3h3M5.5 8.5h5M5.5 11h3" />,
};

function Icono({ children, className = "size-4" }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {children}
    </svg>
  );
}

function iniciales(nombre: string) {
  return (
    nombre
      .replace(/\b(Institución|Educativa|Distrital|Departamental|Técnica|Industrial|Colegio|IED|IE|de|del|la|las|los|y)\b/gi, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join("") || "IE"
  );
}

export function Ingreso({
  instituciones,
  inicialSlug,
  cuentasDemo,
}: {
  instituciones: InstitucionPublica[];
  inicialSlug: string | null;
  /** Solo llegan fuera de producción. */
  cuentasDemo: CuentaDemo[];
}) {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, inicial);
  const [lista, setLista] = useState(instituciones);
  const [consulta, setConsulta] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [seleccion, setSeleccion] = useState<InstitucionPublica | null>(instituciones.find((i) => i.slug === inicialSlug) ?? null);
  const [perfil, setPerfil] = useState<PerfilId>("ESTUDIANTE");
  const [documento, setDocumento] = useState(estado.documento ?? "");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [mayusculas, setMayusculas] = useState(false);
  const claveRef = useRef<HTMLInputElement>(null);
  const documentoRef = useRef<HTMLInputElement>(null);

  // Búsqueda con retardo y cancelación (Route Handler público /api/instituciones).
  useEffect(() => {
    const q = consulta.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetch(`/api/instituciones?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (r.ok) setLista(await r.json());
      } catch {
        /* cancelada */
      } finally {
        setBuscando(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [consulta]);

  useEffect(() => {
    if (!estado.error) return;
    (estado.campo === "documento" ? documentoRef : claveRef).current?.focus();
  }, [estado]);

  const visibles = consulta.trim().length >= 2 ? lista : instituciones;
  const perfilActual = PERFILES.find((p) => p.id === perfil)!;
  const demoDelColegio = seleccion
    ? cuentasDemo.filter((c) => c.slug === seleccion.slug && (perfilActual.roles as readonly string[]).includes(c.rol))
    : [];
  const detectarMayusculas = (e: React.KeyboardEvent<HTMLInputElement>) => setMayusculas(e.getModifierState("CapsLock"));

  return (
    <div className="grid w-full max-w-6xl overflow-hidden rounded-2xl bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.12)] lg:grid-cols-[2fr_3fr]">
      {/* ------------ Panel institucional ------------ */}
      <aside className="flex flex-col bg-petroleo px-6 py-5 text-white sm:px-10 lg:py-10">
        <p className="inline-flex w-fit items-center gap-2 rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold tracking-wide uppercase max-lg:hidden">
          <Icono className="size-3.5">
            <path d="M2 3h4.5A1.5 1.5 0 0 1 8 4.5V13a1.5 1.5 0 0 0-1.5-1.5H2V3Zm12 0H9.5A1.5 1.5 0 0 0 8 4.5V13a1.5 1.5 0 0 1 1.5-1.5H14V3Z" />
          </Icono>
          Decreto 1290 · Multi-colegio
        </p>
        <div className="flex items-center gap-3 lg:mt-8">
          <span className="grid size-12 place-items-center rounded-xl bg-sol text-xl font-bold text-petroleo">K</span>
          <div>
            <p className="text-3xl leading-8 font-bold tracking-tight">Kora</p>
            <p className="text-sm text-teal-200">Gestión académica y convivencia</p>
          </div>
        </div>
        <h1 className="mt-10 text-2xl max-lg:hidden leading-tight font-bold tracking-tight text-balance">Control institucional con privacidad estricta por usuario.</h1>
        <p className="mt-4 text-sm leading-6 text-teal-100/90 max-lg:hidden">
          Cada colegio opera en un espacio aislado. Los estudiantes y acudientes acceden únicamente a su propio boletín, asistencia y
          observador, con su documento y contraseña.
        </p>
        <ul className="mt-auto space-y-4 border-t border-white/15 pt-6 text-sm leading-5 text-teal-50 max-lg:hidden">
          {[
            ["Rectoría", "promedios de la institución curso por curso y anotaciones disciplinarias, sin modificar notas."],
            ["Coordinación", "edición de calificaciones, cierre de periodos y procesos disciplinarios."],
            ["Estudiantes y acudientes", "acceso autenticado y 100 % individual."],
          ].map(([t, d]) => (
            <li key={t} className="flex gap-3">
              <Icono className="mt-0.5 size-4 shrink-0 text-sol">
                <path d="m3.5 8.5 3 3 6-7" />
              </Icono>
              <span>
                <strong className="font-semibold text-white">{t}:</strong> {d}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[11px] text-teal-200/70 max-lg:hidden">Datos personales tratados conforme a la Ley 1581 de 2012.</p>
      </aside>

      {/* ------------ Formulario ------------ */}
      <form action={accion} className="space-y-7 px-6 py-8 sm:px-10 sm:py-10" noValidate>
        <input type="hidden" name="slug" value={seleccion?.slug ?? ""} />
        <input type="hidden" name="perfil" value={perfil} />

        <section aria-labelledby="paso-1" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="paso-1" className="text-sm font-semibold tracking-wide text-ink-soft uppercase">
              1. Selecciona la institución educativa
            </h2>
            {seleccion && (
              <span className="rounded-md border border-ok-line bg-ok-soft px-2.5 py-0.5 text-xs font-medium text-ok">
                DANE {seleccion.codigoDane}
              </span>
            )}
          </div>
          <label className="relative block">
            <span className="sr-only">Buscar institución</span>
            <Icono className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted">
              <path d="M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10Zm7 2-3.5-3.5" />
            </Icono>
            <input
              type="search"
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              placeholder="Buscar por nombre de colegio, ciudad o código DANE…"
              autoComplete="off"
              className="h-11 w-full rounded-lg border border-line bg-canvas pr-3 pl-10 outline-none placeholder:text-muted focus-visible:border-petroleo focus-visible:ring-2 focus-visible:ring-petroleo/20"
            />
          </label>
          <div role="radiogroup" aria-label="Institución" className="grid gap-3 sm:grid-cols-3">
            {visibles.map((i) => {
              const activa = i.slug === seleccion?.slug;
              return (
                <button
                  key={i.slug}
                  type="button"
                  role="radio"
                  aria-checked={activa}
                  onClick={() => setSeleccion(i)}
                  className={`relative flex min-h-28 flex-col justify-end rounded-xl border p-4 text-left transition-colors ${
                    activa ? "border-petroleo bg-petroleo-soft ring-1 ring-petroleo" : "border-line hover:border-line-strong hover:bg-canvas"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`absolute top-3 left-4 grid size-8 place-items-center rounded-lg text-xs font-semibold ${
                      activa ? "bg-petroleo text-white" : "bg-canvas text-ink-soft"
                    }`}
                  >
                    {iniciales(i.nombre)}
                  </span>
                  {activa && <span className="absolute top-3 right-3 rounded-full bg-petroleo px-2 py-0.5 text-[11px] font-semibold text-white">Seleccionada</span>}
                  <span className="mt-10 line-clamp-2 font-semibold leading-5 text-ink">{i.nombre}</span>
                  <span className="mt-0.5 text-xs text-muted">
                    {i.municipio}, {i.departamento}
                  </span>
                </button>
              );
            })}
            {visibles.length === 0 && (
              <p className="text-muted sm:col-span-3">{buscando ? "Buscando…" : "No encontramos colegios con esa búsqueda."}</p>
            )}
          </div>
        </section>

        <section aria-labelledby="paso-2" className={`space-y-4 border-t border-line pt-6 ${seleccion ? "" : "opacity-50"}`}>
          <h2 id="paso-2" className="text-sm font-semibold tracking-wide text-ink-soft uppercase">
            2. Elige tu perfil{seleccion ? ` en ${seleccion.nombre}` : ""}
          </h2>
          <div role="radiogroup" aria-label="Perfil" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {PERFILES.map((p) => {
              const activo = p.id === perfil;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => setPerfil(p.id)}
                  className={`flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors ${
                    activo ? "border-petroleo bg-petroleo text-white" : "border-line text-ink-soft hover:bg-canvas"
                  } ${estado.campo === "perfil" && !activo ? "border-warn-line" : ""}`}
                >
                  <Icono>{ICONO_PERFIL[p.id]}</Icono>
                  {p.texto}
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-ink">Número de documento</span>
              <span className="relative mt-1.5 block">
                <Icono className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted">
                  <path d="M8 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" />
                </Icono>
                <input
                  ref={documentoRef}
                  name="documento"
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value)}
                  autoComplete="username"
                  inputMode="numeric"
                  spellCheck={false}
                  required
                  maxLength={30}
                  placeholder="Sin puntos ni espacios"
                  aria-invalid={estado.campo === "documento" || undefined}
                  className="h-11 w-full rounded-lg border border-line bg-canvas pr-3 pl-10 font-mono outline-none focus-visible:border-petroleo focus-visible:ring-2 focus-visible:ring-petroleo/20"
                />
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">Contraseña</span>
              <span className="relative mt-1.5 block">
                <Icono className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted">
                  <path d="M10 9.5a3.5 3.5 0 1 0-3.3-2.3L2 12v2h2v-1.5h1.5V11H7l1-1a3.5 3.5 0 0 0 2-.5Z" />
                </Icono>
                <input
                  ref={claveRef}
                  name="password"
                  type={verClave ? "text" : "password"}
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  onKeyDown={detectarMayusculas}
                  onKeyUp={detectarMayusculas}
                  autoComplete="current-password"
                  required
                  maxLength={200}
                  aria-invalid={estado.campo === "password" || undefined}
                  className="h-11 w-full rounded-lg border border-line bg-canvas pr-20 pl-10 outline-none focus-visible:border-petroleo focus-visible:ring-2 focus-visible:ring-petroleo/20"
                />
                <button
                  type="button"
                  onClick={() => setVerClave((v) => !v)}
                  aria-pressed={verClave}
                  className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-muted hover:text-ink"
                >
                  {verClave ? "Ocultar" : "Mostrar"}
                </button>
              </span>
              {mayusculas && <span className="mt-1 block text-xs text-warn">Bloq Mayús está activado.</span>}
            </label>
          </div>

          {cuentasDemo.length > 0 && seleccion && (
            <div className="rounded-xl border border-warn-line bg-warn-soft/60 px-4 py-3">
              <p className="text-sm font-medium text-warn">
                Cuentas de prueba · {perfilActual.texto.toLowerCase()} en {seleccion.nombre}{" "}
                <span className="font-normal">(clic para autocompletar)</span>
              </p>
              {demoDelColegio.length === 0 ? (
                <p className="mt-1 text-xs text-ink-soft">No hay cuenta de prueba para este perfil en este colegio.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {demoDelColegio.map((c) => (
                    <button
                      key={c.documento}
                      type="button"
                      title={c.detalle}
                      onClick={() => {
                        setDocumento(c.documento);
                        setClave(CLAVES_DEMO[c.rol]);
                      }}
                      className="rounded-lg border border-warn-line bg-surface px-3 py-1.5 text-left text-xs hover:border-warn"
                    >
                      <span className="font-semibold text-ink">
                        {c.nombres} {c.apellidos.split(" ")[0]}
                      </span>
                      <span className="ml-1.5 font-mono text-muted">
                        {c.documento} · {CLAVES_DEMO[c.rol]}
                      </span>
                      <span className="block text-[11px] text-muted">{c.detalle}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {estado.error && (
            <p role="alert" className="rounded-lg border border-bad-line bg-bad-soft px-3 py-2 text-sm text-bad">
              {estado.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pendiente || !seleccion}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-petroleo text-base font-semibold text-white hover:bg-petroleo-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pendiente ? "Verificando…" : seleccion ? `Iniciar sesión como ${perfilActual.texto}` : "Seleccione su institución"}
            {!pendiente && seleccion && (
              <Icono>
                <path d="M3 8h10M9 4l4 4-4 4" />
              </Icono>
            )}
          </button>
          <p className="text-center text-xs text-muted">
            ¿Olvidó su contraseña? La secretaría del colegio le asigna una clave temporal; al ingresar deberá cambiarla.
          </p>
        </section>
      </form>
    </div>
  );
}
