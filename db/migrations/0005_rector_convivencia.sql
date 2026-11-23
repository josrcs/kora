-- =====================================================================
--  0005 · Rectoría y convivencia
--  - Nuevo rol RECTOR: consulta resultados de todo el colegio y registra
--    anotaciones, pero NUNCA escribe calificaciones (lo impide la base).
--  - Procesos disciplinarios: una anotación disciplinaria o de convivencia
--    que coordinación abre como proceso y cierra con una conclusión.
-- =====================================================================

-- ADD VALUE no puede usarse en la misma transacción en que se crea: va antes del BEGIN.
ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'RECTOR' AFTER 'ADMIN';

BEGIN;

-- ---------------------------------------------------------------------
--  Solo docentes, coordinación y administración escriben notas.
--  (El rector y los estudiantes/acudientes quedan fuera aunque la app falle.)
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_assert_editor_academico() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.updated_by IS NOT DISTINCT FROM OLD.updated_by THEN
    RETURN NEW;  -- p. ej. el traslado de grupo re-apunta la asignación sin cambiar el autor
  END IF;
  PERFORM fn_assert_rol(NEW.updated_by, ARRAY['TEACHER', 'COORDINATOR', 'ADMIN']::rol_usuario[], 'updated_by');
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_grades_editor BEFORE INSERT OR UPDATE ON grades
  FOR EACH ROW EXECUTE FUNCTION fn_assert_editor_academico();
CREATE TRIGGER trg_achievement_scores_editor BEFORE INSERT OR UPDATE ON achievement_scores
  FOR EACH ROW EXECUTE FUNCTION fn_assert_editor_academico();

-- ---------------------------------------------------------------------
--  Procesos disciplinarios sobre el observador
-- ---------------------------------------------------------------------
CREATE TYPE estado_proceso AS ENUM ('ABIERTO', 'CERRADO');

ALTER TABLE student_observer
  ADD COLUMN proceso      estado_proceso,                 -- NULL = anotación simple
  ADD COLUMN conclusion   varchar(2000),
  ADD COLUMN cerrado_at   timestamptz,
  ADD COLUMN cerrado_por  uuid,
  ADD CONSTRAINT student_observer_proceso_tipo CHECK (proceso IS NULL OR tipo IN ('DISCIPLINARIA', 'CONVIVENCIA')),
  ADD CONSTRAINT student_observer_proceso_cierre CHECK (
    (proceso = 'CERRADO') = (cerrado_at IS NOT NULL AND cerrado_por IS NOT NULL AND length(trim(conclusion)) >= 10)
  ),
  ADD CONSTRAINT student_observer_cerrado_por_fk FOREIGN KEY (institution_id, cerrado_por) REFERENCES users (institution_id, id);
CREATE INDEX student_observer_procesos_abiertos_idx ON student_observer (institution_id) WHERE proceso = 'ABIERTO';

-- Quién escribe en el observador y quién abre o cierra procesos.
CREATE FUNCTION fn_student_observer_autoria() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM fn_assert_rol(NEW.autor_id, ARRAY['TEACHER', 'COORDINATOR', 'ADMIN', 'RECTOR']::rol_usuario[], 'autor_id');
    IF NEW.proceso IS NOT NULL THEN
      PERFORM fn_assert_rol(NEW.autor_id, ARRAY['COORDINATOR', 'ADMIN']::rol_usuario[], 'autor_id (proceso disciplinario)');
    END IF;
  END IF;
  IF NEW.cerrado_por IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.cerrado_por IS DISTINCT FROM NEW.cerrado_por) THEN
    PERFORM fn_assert_rol(NEW.cerrado_por, ARRAY['COORDINATOR', 'ADMIN']::rol_usuario[], 'cerrado_por');
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_student_observer_autoria
  BEFORE INSERT OR UPDATE OF autor_id, cerrado_por ON student_observer
  FOR EACH ROW EXECUTE FUNCTION fn_student_observer_autoria();

COMMIT;
