/** Estados compartidos por las páginas de coordinación. */

export function Cargando() {
  return (
    <div className="max-w-5xl animate-pulse space-y-3 px-4 py-5 lg:px-6" aria-label="Cargando">
      <div className="h-5 w-72 rounded-sm bg-slate-200/70" />
      <div className="h-28 rounded-sm border border-line bg-surface" />
      <div className="h-28 rounded-sm border border-line bg-surface" />
      <div className="h-28 rounded-sm border border-line bg-surface" />
    </div>
  );
}

export function SinAnioActivo() {
  return (
    <div className="m-6 max-w-xl rounded-sm border border-line bg-surface p-4">
      <p className="font-medium">No hay un año lectivo activo.</p>
      <p className="mt-1 text-muted">Administración debe crear el año lectivo y marcarlo como activo.</p>
    </div>
  );
}
