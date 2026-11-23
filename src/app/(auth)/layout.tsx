import type { ReactNode } from "react";

/** Marco de las pantallas sin sesión: ingreso, cambio de clave, sin acceso. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="fondo-kora flex min-h-screen items-start justify-center px-4 py-6 sm:items-center sm:px-6 sm:py-10">{children}</main>
  );
}
