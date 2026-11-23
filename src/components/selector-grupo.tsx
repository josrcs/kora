import Link from "next/link";
import type { ReactNode } from "react";

export type GrupoSeleccionable = { id: string; codigo: string; gradoCodigo: number; grado: string; detalle?: ReactNode; alerta?: boolean };

/**
 * Selector en dos niveles para colegios grandes (11 grados × 4 salones):
 * primero el grado, luego el salón. Componente de servidor: solo enlaces.
 */
export function SelectorGrupo({
  grupos,
  actualId,
  href,
  etiquetaTodos,
}: {
  grupos: GrupoSeleccionable[];
  actualId: string | null;
  href: (groupId: string | null) => string;
  /** Si se da, agrega una opción para ver todos los grupos (sin salón elegido). */
  etiquetaTodos?: string;
}) {
  const actual = grupos.find((g) => g.id === actualId) ?? null;
  const grados = [...new Map(grupos.map((g) => [g.gradoCodigo, g.grado])).entries()];
  const gradoActual = actual?.gradoCodigo ?? null;
  const salones = gradoActual === null ? [] : grupos.filter((g) => g.gradoCodigo === gradoActual);
  const alertaGrado = (codigo: number) => grupos.some((g) => g.gradoCodigo === codigo && g.alerta);

  return (
    <div className="space-y-2.5 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="w-16 shrink-0 text-xs font-semibold tracking-wide text-muted uppercase">Grado</span>
        {etiquetaTodos && (
          <Chip href={href(null)} activo={actual === null}>
            {etiquetaTodos}
          </Chip>
        )}
        {grados.map(([codigo, nombre]) => {
          const primero = grupos.find((g) => g.gradoCodigo === codigo)!;
          return (
            <Chip key={codigo} href={href(primero.id)} activo={codigo === gradoActual} alerta={alertaGrado(codigo)}>
              {nombre}
            </Chip>
          );
        })}
      </div>
      {salones.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="w-16 shrink-0 text-xs font-semibold tracking-wide text-muted uppercase">Salón</span>
          {salones.map((s) => (
            <Chip key={s.id} href={href(s.id)} activo={s.id === actualId} alerta={s.alerta}>
              {s.codigo}
              {s.detalle && <span className="ml-1 font-normal opacity-75">{s.detalle}</span>}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ href, activo, alerta, children }: { href: string; activo: boolean; alerta?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={`relative rounded-xl border px-3 py-1 text-sm font-semibold tabular-nums transition-colors ${
        activo ? "border-petroleo bg-petroleo text-white" : "border-line bg-surface text-ink-soft hover:border-line-strong"
      }`}
    >
      {children}
      {alerta && !activo && <span aria-hidden className="absolute -top-1 -right-1 size-2 rounded-full bg-warn" />}
    </Link>
  );
}
