import { Suspense } from "react";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { IconMegafono } from "@/components/icons";
import { avisosParaUsuario, marcarLeidos } from "@/features/avisos/server";
import { AvisoTarjeta } from "@/features/avisos/components/aviso-tarjeta";
import { Cargando } from "@/features/periodos/components/estados";

export const metadata: Metadata = { title: "Avisos del colegio" };

export default function AvisosPortalPage() {
  return (
    <>
      <div className="border-b border-line bg-surface px-4 py-4 lg:px-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-brand-soft text-brand">
            <IconMegafono className="size-5" />
          </span>
          <div>
            <p className="text-xs text-muted">Portal académico</p>
            <h1 className="text-xl font-bold">Avisos y comunicados</h1>
          </div>
        </div>
      </div>
      <Suspense fallback={<Cargando />}>
        <Lista />
      </Suspense>
    </>
  );
}

async function Lista() {
  const session = await requireSession(["STUDENT", "GUARDIAN"]);
  const avisos = await avisosParaUsuario(session);
  // Acuse de lectura: al abrir esta página quedan leídos (la marca "Nuevo" se muestra esta vez).
  await marcarLeidos(session, avisos.filter((a) => !a.leido).map((a) => a.id));

  if (avisos.length === 0) {
    return <p className="m-6 max-w-xl rounded-2xl border border-dashed border-line-strong bg-surface px-5 py-8 text-center text-muted">No hay avisos por ahora.</p>;
  }
  return (
    <section className="anim-escalonado mx-auto max-w-3xl space-y-3 px-4 py-5 lg:px-6">
      {avisos.map((a) => (
        <AvisoTarjeta key={a.id} aviso={a} nuevo={!a.leido} />
      ))}
    </section>
  );
}
