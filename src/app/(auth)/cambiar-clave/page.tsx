import { Suspense } from "react";
import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { CambiarClaveForm } from "@/features/auth/components/cambiar-clave-form";

export const metadata: Metadata = { title: "Cambiar contraseña" };

export default function CambiarClavePage() {
  return (
    <div className="w-full max-w-[26rem]">
      <Suspense fallback={<div className="h-96 rounded-sm border border-line bg-surface" />}>
        <Contenido />
      </Suspense>
    </div>
  );
}

async function Contenido() {
  const session = await requireSession(undefined, { permitirClavePendiente: true });
  return <CambiarClaveForm nombre={session.nombre} obligatorio={session.debeCambiarPassword} />;
}
