import { Suspense } from "react";
import type { Metadata } from "next";
import { requireSession, ROLES_ADMINISTRACION } from "@/lib/auth/session";
import { getEstructura } from "@/features/admin/server/estructura";
import { Areas, Grados } from "@/features/admin/components/estructura-admin";
import { Cargando } from "@/features/periodos/components/estados";

export const metadata: Metadata = { title: "Grados y asignaturas" };

export default function EstructuraPage() {
  return (
    <Suspense fallback={<Cargando />}>
      <Estructura />
    </Suspense>
  );
}

async function Estructura() {
  const session = await requireSession(ROLES_ADMINISTRACION);
  const { grados, areas } = await getEstructura(session);
  return (
    <div className="max-w-5xl space-y-5 px-4 py-5 lg:px-6">
      <Grados grados={grados} />
      <Areas areas={areas} />
    </div>
  );
}
