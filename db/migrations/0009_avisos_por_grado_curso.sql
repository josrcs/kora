-- =====================================================================
--  0009 · Avisos dirigidos a un grado o a un curso
--
--  Un aviso puede ir a todo el colegio (ambos NULL), a un grado
--  (grade_level_id) o a un curso concreto (group_id). La audiencia
--  (estudiantes / acudientes / ambos) se combina con ese alcance.
--  El curso debe ser del grado indicado y del año lectivo activo.
-- =====================================================================

BEGIN;

ALTER TABLE announcements
  ADD COLUMN grade_level_id uuid,
  ADD COLUMN group_id       uuid,
  ADD CONSTRAINT announcements_grado_fk FOREIGN KEY (institution_id, grade_level_id) REFERENCES grade_levels (institution_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT announcements_curso_fk FOREIGN KEY (institution_id, group_id)       REFERENCES groups (institution_id, id)       ON DELETE RESTRICT;
CREATE INDEX announcements_curso_idx ON announcements (group_id) WHERE group_id IS NOT NULL;

CREATE FUNCTION fn_announcements_alcance() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE v_grado uuid; v_activo boolean;
BEGIN
  IF NEW.group_id IS NULL THEN RETURN NEW; END IF;
  SELECT g.grade_level_id, y.activo INTO v_grado, v_activo
    FROM groups g JOIN academic_years y ON y.id = g.academic_year_id WHERE g.id = NEW.group_id;
  IF NOT v_activo THEN
    RAISE EXCEPTION 'El curso no es del año lectivo activo' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.grade_level_id IS NULL THEN
    NEW.grade_level_id := v_grado;  -- el curso implica su grado
  ELSIF NEW.grade_level_id <> v_grado THEN
    RAISE EXCEPTION 'El curso no pertenece al grado indicado' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_announcements_alcance BEFORE INSERT OR UPDATE OF grade_level_id, group_id ON announcements
  FOR EACH ROW EXECUTE FUNCTION fn_announcements_alcance();

COMMIT;
