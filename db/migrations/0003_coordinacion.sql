-- =====================================================================
--  0003 · Coordinación académica
--  - Historial de cierres y reaperturas de periodos (quién, cuándo, por qué
--    y cuántas calificaciones faltaban al cerrar).
--  - Los periodos se cierran en orden: no se puede cerrar el periodo 3 con
--    el 2 abierto (el acumulado del boletín quedaría con huecos).
-- =====================================================================

BEGIN;

CREATE TYPE accion_periodo AS ENUM ('CIERRE', 'REAPERTURA');

CREATE TABLE period_events (
  id              bigint          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  institution_id  uuid            NOT NULL,
  period_id       uuid            NOT NULL,
  accion          accion_periodo  NOT NULL,
  motivo          varchar(500),
  pendientes      integer         NOT NULL DEFAULT 0 CHECK (pendientes >= 0),  -- calificaciones sin digitar en ese momento
  actor_id        uuid            NOT NULL,
  created_at      timestamptz     NOT NULL DEFAULT now(),
  -- Reabrir un periodo publicado es excepcional: exige justificación.
  CONSTRAINT period_events_motivo_reapertura CHECK (accion = 'CIERRE' OR length(trim(motivo)) >= 10),
  FOREIGN KEY (institution_id, period_id) REFERENCES periods (institution_id, id) ON DELETE CASCADE,
  FOREIGN KEY (institution_id, actor_id)  REFERENCES users (institution_id, id)
);
CREATE INDEX period_events_period_idx ON period_events (period_id, created_at DESC);

ALTER TABLE period_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON period_events
  USING (institution_id = app_institution_id())
  WITH CHECK (institution_id = app_institution_id());

-- Cierre en orden: al pasar a cerrado, los periodos anteriores del año deben estar cerrados.
CREATE FUNCTION fn_periods_cierre_en_orden() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE v_abierto text;
BEGIN
  IF NEW.cerrado AND NOT OLD.cerrado THEN
    SELECT nombre INTO v_abierto
      FROM periods
     WHERE academic_year_id = NEW.academic_year_id AND numero < NEW.numero AND NOT cerrado
     ORDER BY numero LIMIT 1;
    IF v_abierto IS NOT NULL THEN
      RAISE EXCEPTION 'Primero debe cerrar "%"', v_abierto
        USING ERRCODE = 'P0001', HINT = 'CIERRE_FUERA_DE_ORDEN';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_periods_cierre_en_orden
  BEFORE UPDATE OF cerrado ON periods
  FOR EACH ROW EXECUTE FUNCTION fn_periods_cierre_en_orden();

COMMIT;

-- Permisos del rol de la aplicación:
-- GRANT SELECT, INSERT ON period_events TO kora_app;
-- GRANT USAGE ON SEQUENCE period_events_id_seq TO kora_app;
