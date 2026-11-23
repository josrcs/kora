/** Iconos de trazo de 16px. Inline para no depender de una librería por 6 íconos. */
import type { SVGProps } from "react";

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...props,
});

export const IconLock = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3" y="7" width="10" height="7" rx="1" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </svg>
);

export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m3.5 8.5 3 3 6-7" />
  </svg>
);

export const IconAlert = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M8 2.5 14 13H2L8 2.5Z" />
    <path d="M8 6.5v3M8 11.25v.01" />
  </svg>
);

export const IconSpinner = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} className={`anim-spin ${p.className ?? ""}`}>
    <path d="M8 2a6 6 0 1 1-6 6" />
  </svg>
);

export const IconTable = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="2" y="2.5" width="12" height="11" rx="1" />
    <path d="M2 6h12M2 9.5h12M6 6v7.5" />
  </svg>
);

export const IconCalendar = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="2" y="3" width="12" height="11" rx="1" />
    <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
  </svg>
);

export const IconChart = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M2 14h12M4.5 11V8M8 11V4M11.5 11V6.5" />
  </svg>
);

export const IconUsers = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="6" cy="5" r="2.25" />
    <path d="M2 13.5c0-2.2 1.8-4 4-4s4 1.8 4 4M10.5 3a2.25 2.25 0 0 1 0 4.25M12 9.75c1.2.6 2 1.9 2 3.75" />
  </svg>
);

export const IconChecklist = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m2 4 1.25 1.25L5.5 3M2 9.5l1.25 1.25L5.5 8.5M8 4.25h6M8 9.75h6" />
  </svg>
);

export const IconDocument =(p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 1.75h5.5L12.5 5v9.25H4Z" />
    <path d="M9.5 1.75V5h3M6 8h4.5M6 10.5h4.5" />
  </svg>
);

export const IconChevron =(p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m6 4 4 4-4 4" />
  </svg>
);

export const IconUserPlus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="6.5" cy="5" r="2.5" />
    <path d="M2 14c0-2.5 2-4.5 4.5-4.5S11 11.5 11 14M13 5v4M11 7h4" />
  </svg>
);

export const IconGrid = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="2" y="2" width="5" height="5" rx="0.75" />
    <rect x="9" y="2" width="5" height="5" rx="0.75" />
    <rect x="2" y="9" width="5" height="5" rx="0.75" />
    <rect x="9" y="9" width="5" height="5" rx="0.75" />
  </svg>
);

export const IconBook = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M2.5 3c2-.75 3.75-.5 5.5.75 1.75-1.25 3.5-1.5 5.5-.75v10c-2-.75-3.75-.5-5.5.75-1.75-1.25-3.5-1.5-5.5-.75Z" />
    <path d="M8 3.75v10" />
  </svg>
);

export const IconMegafono = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M2.5 6.5v3h2l5 3v-9l-5 3h-2Z" />
    <path d="M12 5.5a3.5 3.5 0 0 1 0 5M4.5 9.5l.8 3.5h1.7l-.6-3" />
  </svg>
);

export const IconEscudo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M8 1.5 13.5 3.5v4c0 3.2-2.3 5.8-5.5 7-3.2-1.2-5.5-3.8-5.5-7v-4L8 1.5Z" />
    <path d="m5.8 8.2 1.6 1.6 3-3" />
  </svg>
);

export const IconEstrella = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m8 2 1.8 3.7 4 .6-2.9 2.8.7 4L8 11.2 4.4 13.1l.7-4L2.2 6.3l4-.6L8 2Z" />
  </svg>
);

export const IconConsolidado = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <path d="M2 6h12M6 6v7.5M10 6v7.5M2 9.75h12" />
  </svg>
);
