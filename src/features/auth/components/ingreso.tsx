"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Logotipo, Orbitas } from "@/components/marca";
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
  avisoPolitica = null,
}: {
  instituciones: InstitucionPublica[];
  inicialSlug: string | null;
  /** Solo llegan fuera de producción. */
  cuentasDemo: CuentaDemo[];
  /** Tras no aceptar o revocar la política de datos. */
  avisoPolitica?: "rechazada" | "revocada" | null;
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
    <div className="grid w-full max-w-6xl overflow-hidden rounded-3xl bg-surface shadow-elevada ring-1 ring-navy/5 lg:grid-cols-[2fr_3fr]">
      {/* ------------ Panel de marca ------------ */}
      <aside className="panel-kora relative flex flex-col overflow-hidden px-6 py-6 text-white sm:px-10 lg:py-10">
        <Orbitas className="absolute -top-24 -right-24 size-[26rem] opacity-70 max-lg:hidden" />
        <Orbitas className="absolute -bottom-40 -left-32 size-[22rem] rotate-180 opacity-40 max-lg:hidden" />

        <p className="anim-entrar relative inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase backdrop-blur-sm max-lg:hidden">
          <span className="relative grid size-2 place-items-center rounded-full bg-cielo text-cielo anim-pulso" />
          Decreto 1290 · Ley 1581 · Multi-colegio
        </p>

        <div className="relative flex items-center gap-4 lg:mt-10 lg:flex-col lg:items-start">
          <Image src="/kora-emblema-claro.png" alt="" width={160} height={160} priority className="anim-flotar size-14 drop-shadow-[0_12px_30px_rgb(47_127_234/0.45)] lg:size-36" />
          <div className="anim-entrar">
            <Logotipo claro className="text-3xl lg:text-5xl" />
            <p className="mt-1.5 text-sm font-medium tracking-wide text-blue-200/90 lg:text-base">Plataforma de Gestión Académica</p>
          </div>
        </div>

        <h1 className="relative mt-10 text-2xl leading-tight font-bold text-balance max-lg:hidden">
          Notas, convivencia y comunicados, <span className="bg-gradient-to-r from-cielo to-blue-300 bg-clip-text text-transparent">en un solo lugar</span>.
        </h1>
        <p className="relative mt-3 text-sm leading-6 text-blue-100/80 max-lg:hidden">
          Cada colegio opera en un espacio aislado. Estudiantes y acudientes ven únicamente su propio boletín, asistencia, convivencia y
          avisos del colegio.
        </p>

        <ul className="anim-escalonado relative mt-auto space-y-3 pt-8 text-sm leading-5 text-blue-50/90 max-lg:hidden">
          {[
            ["Coordinación", "calificaciones, cierre de periodos, avisos y comunicados."],
            ["Estudiantes y acudientes", "boletín, nota de convivencia y avisos, con acceso 100 % individual."],
            ["Datos protegidos", "tratamiento conforme a la Ley 1581 de 2012 y al Código de Infancia y Adolescencia."],
          ].map(([t, d]) => (
            <li key={t} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 backdrop-blur-sm">
              <Icono className="mt-0.5 size-4 shrink-0 text-cielo">
                <path d="m3.5 8.5 3 3 6-7" />
              </Icono>
              <span>
                <strong className="font-semibold text-white">{t}:</strong> {d}
              </span>
            </li>
          ))}
        </ul>
      </aside>

      {/* ------------ Formulario ------------ */}
      <form action={accion} className="space-y-7 px-6 py-8 sm:px-10 sm:py-10" noValidate>
        <input type="hidden" name="slug" value={seleccion?.slug ?? ""} />
        <input type="hidden" name="perfil" value={perfil} />

        <div className="anim-entrar">
          <p className="text-xs font-semibold tracking-[0.14em] text-cielo uppercase">Bienvenido</p>
          <p className="mt-1 font-display text-2xl font-bold text-ink">Ingresa a tu cuenta Kora</p>
        </div>

        {avisoPolitica && (
          <p role="status" className="anim-pop rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm leading-5 text-warn">
            {avisoPolitica === "revocada"
              ? "Revocó su autorización de tratamiento de datos y se cerró su sesión. Para volver a usar Kora deberá aceptarla de nuevo."
              : "No aceptó la política de tratamiento de datos: su cuenta no se activó. Si cambia de opinión, ingrese de nuevo y acéptela, o comuníquese con la secretaría del colegio."}
          </p>
        )}

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
          <div role="radiogroup" aria-label="Institución" className="anim-escalonado grid gap-3 sm:grid-cols-3">
            {visibles.map((i) => {
              const activa = i.slug === seleccion?.slug;
              return (
                <button
                  key={i.slug}
                  type="button"
                  role="radio"
                  aria-checked={activa}
                  onClick={() => setSeleccion(i)}
                  className={`tarjeta-viva relative flex min-h-28 flex-col justify-end rounded-xl border p-4 text-left ${
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
                  {activa && <span className="anim-pop absolute top-3 right-3 rounded-full bg-petroleo px-2 py-0.5 text-[11px] font-semibold text-white">Seleccionada</span>}
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
                  className={`btn-kora flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors ${
                    activo ? "border-petroleo bg-petroleo text-white shadow-[0_6px_16px_-8px_rgb(18_58_156/0.7)]" : "border-line text-ink-soft hover:border-cielo/50 hover:bg-cielo-soft"
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
            className="btn-kora group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-petroleo to-brand text-base font-semibold text-white shadow-[0_10px_24px_-12px_rgb(26_79_208/0.8)] hover:from-petroleo-hover hover:to-brand-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
          >
            {pendiente ? "Verificando…" : seleccion ? `Iniciar sesión como ${perfilActual.texto}` : "Seleccione su institución"}
            {!pendiente && seleccion && (
              <Icono className="size-4 transition-transform group-hover:translate-x-1">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </Icono>
            )}
          </button>
          <p className="text-center text-xs text-muted">
            ¿Olvidó su contraseña? La secretaría del colegio le asigna una clave temporal; al ingresar deberá cambiarla.
          </p>
          <p className="rounded-xl border border-line bg-canvas px-4 py-3 text-center text-xs leading-5 text-ink-soft">
            Para usar Kora debe aceptar la{" "}
            <Link href="/politica-de-datos" target="_blank" className="font-semibold text-brand underline-offset-2 hover:underline">
              Política de Tratamiento de Datos Personales
            </Link>{" "}
            (Ley 1581 de 2012). Los datos de menores de edad se tratan con autorización de su representante legal.
          </p>
        </section>
      </form>
    </div>
  );
}
