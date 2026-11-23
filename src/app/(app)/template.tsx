import type { ReactNode } from "react";

/** A diferencia del layout, la plantilla se vuelve a montar en cada navegación: cada página entra con una animación suave. */
export default function Plantilla({ children }: { children: ReactNode }) {
  return <div className="anim-entrar">{children}</div>;
}
