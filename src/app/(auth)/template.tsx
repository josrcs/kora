import type { ReactNode } from "react";

export default function Plantilla({ children }: { children: ReactNode }) {
  return <div className="anim-entrar flex w-full justify-center">{children}</div>;
}
