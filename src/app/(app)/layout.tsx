import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getEncabezado } from "@/lib/auth/encabezado";
import { NavLink } from "@/components/nav-link";
import { MenuMovil } from "@/components/menu-movil";
import {
  IconAlert,
  IconBook,
  IconCalendar,
  IconChart,
  IconChecklist,
  IconDocument,
  IconGrid,
  IconTable,
  IconUserPlus,
  IconUsers,
} from "@/components/icons";
import type { Rol } from "@/db/schema";

const ROL_LABEL: Record<Rol, string> = {
  ADMIN: "Secretaría",
  RECTOR: "Rectoría",
  COORDINATOR: "Coordinación",
  TEACHER: "Docente",
  STUDENT: "Estudiante",
  GUARDIAN: "Acudiente",
};

type Seccion = { seccion: string; roles: Rol[]; items: { href: string; texto: string; icono: ReactNode; exacta?: boolean }[] };

/** Menú por rol. La autorización real está en cada página y acción (ver la matriz en lib/auth/session.ts). */
const MENU: Seccion[] = [
  {
    seccion: "Rectoría",
    roles: ["RECTOR", "COORDINATOR"],
    items: [{ href: "/rectoria", texto: "Resultados por curso", icono: <IconChart /> }],
  },
  {
    seccion: "Coordinación",
    roles: ["COORDINATOR"],
    items: [
      { href: "/coordinacion", texto: "Resumen", icono: <IconChart />, exacta: true },
      { href: "/coordinacion/periodos", texto: "Periodos", icono: <IconCalendar /> },
      { href: "/coordinacion/seguimiento", texto: "Seguimiento de notas", icono: <IconChecklist /> },
      { href: "/coordinacion/corte", texto: "Corte preventivo", icono: <IconAlert /> },
      { href: "/coordinacion/carga", texto: "Carga académica", icono: <IconUsers /> },
    ],
  },
  {
    seccion: "Convivencia",
    roles: ["RECTOR", "COORDINATOR"],
    items: [{ href: "/convivencia", texto: "Observador y procesos", icono: <IconAlert /> }],
  },
  {
    seccion: "Administración",
    roles: ["COORDINATOR", "ADMIN"],
    items: [
      { href: "/admin/matriculas", texto: "Matrículas", icono: <IconUserPlus /> },
      { href: "/admin/grupos", texto: "Grupos", icono: <IconGrid /> },
      { href: "/admin/estructura", texto: "Grados y asignaturas", icono: <IconBook /> },
      { href: "/admin/anios", texto: "Años y periodos", icono: <IconCalendar /> },
    ],
  },
  {
    seccion: "Calificaciones",
    roles: ["TEACHER", "COORDINATOR"],
    items: [{ href: "/docente/planilla", texto: "Planilla de notas", icono: <IconTable /> }],
  },
  {
    seccion: "Estudiante",
    roles: ["STUDENT", "GUARDIAN"],
    items: [{ href: "/portal", texto: "Portal académico", icono: <IconDocument /> }],
  },
];

function Marca() {
  return (
    <>
      <span className="grid size-6 place-items-center rounded-sm bg-white text-[11px] font-semibold text-navy">K</span>
      <span className="font-semibold tracking-tight text-white">Kora</span>
      <span className="text-[11px] text-slate-400">Gestión académica</span>
    </>
  );
}

/**
 * Marco de la aplicación. El marco es estático (se prerenderiza); lo que
 * depende de la sesión va detrás de <Suspense> y llega en streaming.
 * En pantallas angostas el menú lateral se reemplaza por un menú desplegable.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col bg-navy text-slate-300 lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4">
          <Marca />
        </div>
        <Suspense fallback={<div className="flex-1" />}>
          <MenuLateral />
        </Suspense>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4">
          <Suspense fallback={<span className="h-4 w-64 rounded-sm bg-slate-100" />}>
            <BarraUsuario />
          </Suspense>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function Secciones({ secciones }: { secciones: Seccion[] }) {
  return (
    <nav className="flex-1 space-y-4 px-2 py-3" aria-label="Principal">
      {secciones.map((s) => (
        <div key={s.seccion}>
          <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">{s.seccion}</p>
          {s.items.map((i) => (
            <NavLink key={i.href} href={i.href} icon={i.icono} exacta={i.exacta}>
              {i.texto}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

async function MenuLateral() {
  const session = await getSession();
  const secciones = session ? MENU.filter((m) => m.roles.includes(session.rol)) : [];
  return (
    <>
      <Secciones secciones={secciones} />
      {session && (
        <div className="border-t border-white/10 px-4 py-3 text-[11px] leading-4 text-slate-400">
          <p className="truncate text-slate-300">{session.institucion.nombre}</p>
          <p>{ROL_LABEL[session.rol]}</p>
        </div>
      )}
    </>
  );
}

async function BarraUsuario() {
  const session = await getSession();
  if (!session) return null;
  const secciones = MENU.filter((m) => m.roles.includes(session.rol));
  const e = await getEncabezado(session);
  return (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <MenuMovil>
          <div className="flex h-12 items-center gap-2 border-b border-white/10 px-4">
            <Marca />
          </div>
          <Secciones secciones={secciones} />
          <p className="border-t border-white/10 px-4 py-3 text-[11px] text-slate-400">{session.institucion.nombre}</p>
        </MenuMovil>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-ink">{session.institucion.nombre}</span>
            {e.periodo && (
              <span
                className={`hidden shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium sm:inline ${
                  e.periodo.cerrado ? "border-line-strong bg-slate-50 text-ink-soft" : "border-ok-line bg-ok-soft text-ok"
                }`}
              >
                {e.periodo.nombre} ({e.periodo.cerrado ? "cerrado" : "abierto"}) · {e.periodo.anio}
              </span>
            )}
          </div>
          <p className="hidden truncate text-[11px] text-muted md:block">
            {e.municipio}, {e.departamento} · DANE <span className="font-mono">{e.dane}</span> · {e.estudiantes.toLocaleString("es-CO")} estudiantes
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-muted">
        <div className="hidden text-right leading-4 sm:block">
          <p className="text-[13px] font-semibold text-ink">{session.nombre}</p>
          <p className="text-[11px]">{e.carga ?? ROL_LABEL[session.rol]}</p>
        </div>
        <span className="hidden rounded-full border border-petroleo/30 bg-petroleo-soft px-2.5 py-0.5 text-xs font-semibold text-petroleo lg:inline">
          {ROL_LABEL[session.rol]}
        </span>
        <Link href="/cambiar-clave" className="hidden text-xs hover:text-ink hover:underline md:inline">
          Contraseña
        </Link>
        {/* POST nativo a /salir (no Server Action): recarga completa, no deja páginas del usuario en memoria. */}
        <form action="/salir" method="post">
          <button type="submit" className="rounded-lg border border-bad-line bg-bad-soft px-2.5 py-1 text-xs font-semibold text-bad hover:border-bad">
            Salir
          </button>
        </form>
      </div>
    </>
  );
}
