import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { IconEscudo } from "@/components/icons";
import { historialPropio } from "@/features/privacidad/server";
import { revocarAutorizacion } from "@/features/privacidad/actions";
import { VERSION_POLITICA } from "@/features/privacidad/politica";

export const metadata: Metadata = { title: "Privacidad" };

const fecha = (d: Date) =>
  d.toLocaleString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });

export default function PrivacidadPage() {
  return (
    <Suspense fallback={<div className="m-6 h-64 max-w-3xl rounded-2xl bg-surface" />}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  const session = await requireSession();
  const historial = await historialPropio(session);
  const vigente = historial.find((h) => h.tipo === "ACEPTACION_USUARIO" && h.version === VERSION_POLITICA && h.aceptado);

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 lg:px-6">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-brand-soft text-brand">
          <IconEscudo className="size-6" />
        </span>
        <div>
          <p className="text-xs text-muted">Mi cuenta</p>
          <h1 className="text-xl font-bold">Privacidad y datos personales</h1>
        </div>
      </div>

      <section className="rounded-2xl border border-ok-line bg-ok-soft px-5 py-4">
        <p className="font-semibold text-ok">Autorización vigente (versión {VERSION_POLITICA})</p>
        {vigente && <p className="mt-1 text-sm text-ink-soft">Aceptada el {fecha(vigente.fecha)}.</p>}
        <p className="mt-2 text-sm text-ink-soft">
          Lea la{" "}
          <Link href="/politica-de-datos" target="_blank" className="font-semibold text-brand hover:underline">
            política completa
          </Link>
          . Para conocer, actualizar o rectificar sus datos, diríjase a la secretaría de {session.institucion.nombre}.
        </p>
      </section>

      <section className="rounded-2xl border border-line bg-surface px-5 py-4">
        <h2 className="font-bold">Historial de autorizaciones</h2>
        <ul className="mt-3 divide-y divide-line text-sm">
          {historial.map((h, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {h.tipo === "AUTORIZACION_REPRESENTANTE"
                  ? `Autorización del representante legal${h.representante ? `: ${h.representante}` : ""}${h.parentesco ? ` (${h.parentesco})` : ""}`
                  : h.aceptado
                    ? "Aceptó la política"
                    : "No aceptó o revocó la autorización"}
                <span className="ml-1 text-xs text-muted">· versión {h.version}</span>
              </span>
              <span className="text-xs text-muted">{fecha(h.fecha)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-bad-line bg-surface px-5 py-4">
        <h2 className="font-bold text-bad">Revocar mi autorización</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Si revoca la autorización, se cierra su sesión y no podrá usar Kora hasta aceptarla de nuevo. La institución conserva el registro
          académico que la ley le obliga a guardar.
        </p>
        <form action={revocarAutorizacion} className="mt-3">
          <button type="submit" className="btn-kora rounded-xl border border-bad-line bg-bad-soft px-4 py-2 text-sm font-semibold text-bad hover:bg-bad hover:text-white">
            Revocar autorización y salir
          </button>
        </form>
      </section>
    </div>
  );
}
