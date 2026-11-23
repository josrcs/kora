import type { ReactNode } from "react";
import { SubNav } from "@/components/sub-nav";

const SECCIONES = [
  { href: "/admin/matriculas", texto: "Matrículas" },
  { href: "/admin/grupos", texto: "Grupos" },
  { href: "/admin/estructura", texto: "Grados y asignaturas" },
  { href: "/admin/anios", texto: "Años y periodos" },
];

/** Encabezado estático de administración académica; cada página autoriza y carga detrás de <Suspense>. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="border-b border-line bg-surface px-4 pt-4 lg:px-6">
        <p className="text-xs text-muted">Administración académica</p>
        <div className="mt-2">
          <SubNav items={SECCIONES} label="Administración" />
        </div>
      </div>
      {children}
    </>
  );
}
