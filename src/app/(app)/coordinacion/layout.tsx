import type { ReactNode } from "react";
import { SubNav } from "@/components/sub-nav";

const SECCIONES = [
  { href: "/coordinacion", texto: "Resumen", exacta: true },
  { href: "/coordinacion/periodos", texto: "Periodos" },
  { href: "/coordinacion/seguimiento", texto: "Seguimiento de notas" },
  { href: "/coordinacion/corte", texto: "Corte preventivo" },
  { href: "/coordinacion/carga", texto: "Carga académica" },
  { href: "/coordinacion/notas", texto: "Consolidado de notas" },
  { href: "/coordinacion/avisos", texto: "Avisos" },
];

/** Encabezado estático de coordinación; cada página autoriza y carga sus datos detrás de <Suspense>. */
export default function CoordinacionLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="border-b border-line bg-surface px-4 pt-4 lg:px-6">
        <p className="text-xs text-muted">Coordinación académica</p>
        <div className="mt-2">
          <SubNav items={SECCIONES} label="Coordinación" />
        </div>
      </div>
      {children}
    </>
  );
}
