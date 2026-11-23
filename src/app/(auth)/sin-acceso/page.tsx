import type { Metadata } from "next";
import Link from "next/link";
import { Tarjeta } from "@/features/auth/components/tarjeta";

export const metadata: Metadata = { title: "Sin acceso" };

export default function SinAccesoPage() {
  return (
    <div className="w-full max-w-[26rem]">
      <Tarjeta titulo="Sin acceso a esta sección">
        <p className="text-muted">Su perfil no tiene permiso para ver esta sección.</p>
        <Link href="/" className="mt-4 inline-block font-medium text-brand hover:underline">
          Volver al inicio
        </Link>
      </Tarjeta>
    </div>
  );
}
