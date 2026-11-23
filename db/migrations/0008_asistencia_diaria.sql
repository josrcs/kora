-- =====================================================================
--  0008 · Asistencia diaria por clase
--
--  El docente pasa lista en cada clase: una sesión (asignación + fecha,
--  con su duración en horas) y un registro por estudiante (presente,
--  ausente, tarde o con excusa).
--
--  Las fallas de la planilla (grades.fallas / fallas_justificadas) dejan de
--  digitarse a mano para esa asignatura y periodo: la base las recalcula
--  con cada cambio de asistencia.
--    fallas               = horas de clase con AUSENTE o EXCUSA
--    fallas_justificadas  = horas con EXCUSA
--  (TARDE queda registrado pero no suma fallas.)
-- =====================================================================

BEGIN;

CREATE TYPE estado_asistencia AS ENUM ('PRESENTE', 'AUSENTE', 'TARDE', 'EXCUSA');

-- ---------------------------------------------------------------------
--  Sesiones de clase
-- ---------------------------------------------------------------------
CREATE TABLE attendance_sessions (
  id                     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id         uuid          NOT NULL,
  teacher_assignment_id  uuid          NOT NULL,
  period_id              uuid          NOT NULL,
  fecha                  date          NOT NULL,
  horas                  smallint      NOT NULL DEFAULT 1 CHECK (horas BETWEEN 1 AND 6),
  tema                   varchar(200),
  registrado_por         uuid          NOT NULL,
  created_at             timestamptz   NOT NULL DEFAULT now(),
  updated_at             timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT attendance_sessions_dia_uq    UNIQUE (teacher_assignment_id, fecha),
  CONSTRAINT attendance_sessions_tenant_uq UNIQUE (institution_id, id),
  FOREIGN KEY (institution_id, teacher_assignment_id) REFERENCES teacher_assignments (institution_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (institution_id, period_id)             REFERENCES periods (institution_id, id)             ON DELETE RESTRICT,
  FOREIGN KEY (institution_id, registrado_por)        REFERENCES users (institution_id, id)
);
CREATE INDEX attendance_sessions_periodo_idx ON attendance_sessions (teacher_assignment_id, period_id, fecha DESC);
CREATE INDEX attendance_sessions_fecha_idx   ON attendance_sessions (institution_id, fecha);
CREATE TRIGGER trg_attendance_sessions_touch BEFORE UPDATE ON attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Periodo abierto, fecha dentro del periodo y no futura, periodo del año del
-- grupo, y quien registra es el docente de la asignación o coordinación.
CREATE FUNCTION fn_attendance_sessions_validar() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE v_ini date; v_fin date; v_per_anio uuid; v_grupo_anio uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM fn_assert_periodo_abierto(OLD.period_id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.period_id <> NEW.period_id THEN
    PERFORM fn_assert_periodo_abierto(OLD.period_id);
  END IF;
  PERFORM fn_assert_periodo_abierto(NEW.period_id);
  PERFORM fn_assert_editor_asignacion(NEW.registrado_por, NEW.teacher_assignment_id);

  SELECT fecha_inicio, fecha_fin, academic_year_id INTO v_ini, v_fin, v_per_anio FROM periods WHERE id = NEW.period_id;
  SELECT g.academic_year_id INTO v_grupo_anio
    FROM teacher_assignments ta JOIN groups g ON g.id = ta.group_id WHERE ta.id = NEW.teacher_assignment_id;
  IF v_per_anio IS DISTINCT FROM v_grupo_anio THEN
    RAISE EXCEPTION 'El periodo no corresponde al año de la asignación' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.fecha < v_ini OR NEW.fecha > v_fin THEN
    RAISE EXCEPTION 'La fecha % no está dentro del periodo (% a %)', NEW.fecha, v_ini, v_fin USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.fecha > (now() AT TIME ZONE 'America/Bogota')::date THEN
    RAISE EXCEPTION 'No se puede pasar lista en una fecha futura' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_attendance_sessions_validar
  BEFORE INSERT OR UPDATE OR DELETE ON attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION fn_attendance_sessions_validar();
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION fn_audit();

-- ---------------------------------------------------------------------
--  Registro por estudiante
-- ---------------------------------------------------------------------
CREATE TABLE attendance_records (
  institution_id  uuid               NOT NULL,
  session_id      uuid               NOT NULL,
  enrollment_id   uuid               NOT NULL,
  estado          estado_asistencia  NOT NULL DEFAULT 'PRESENTE',
  observacion     varchar(300),
  updated_at      timestamptz        NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, enrollment_id),
  FOREIGN KEY (institution_id, session_id)    REFERENCES attendance_sessions (institution_id, id) ON DELETE CASCADE,
  FOREIGN KEY (institution_id, enrollment_id) REFERENCES enrollments (institution_id, id)         ON DELETE CASCADE
);
CREATE INDEX attendance_records_matricula_idx ON attendance_records (enrollment_id) WHERE estado <> 'PRESENTE';
CREATE TRIGGER trg_attendance_records_touch BEFORE UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- La matrícula debe ser del grupo de la asignación y estar activa.
CREATE FUNCTION fn_attendance_records_validar() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE v_periodo uuid; v_grupo_asig uuid; v_grupo_mat uuid; v_estado estado_matricula;
BEGIN
  SELECT s.period_id, ta.group_id INTO v_periodo, v_grupo_asig
    FROM attendance_sessions s JOIN teacher_assignments ta ON ta.id = s.teacher_assignment_id
   WHERE s.id = coalesce(NEW.session_id, OLD.session_id);
  IF v_periodo IS NULL THEN
    RETURN coalesce(NEW, OLD);  -- la sesión se está borrando (cascada)
  END IF;
  PERFORM fn_assert_periodo_abierto(v_periodo);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  SELECT group_id, estado INTO v_grupo_mat, v_estado FROM enrollments WHERE id = NEW.enrollment_id;
  IF v_grupo_mat IS DISTINCT FROM v_grupo_asig THEN
    RAISE EXCEPTION 'El estudiante no pertenece al grupo de esta clase' USING ERRCODE = 'check_violation';
  END IF;
  IF v_estado <> 'ACTIVA' THEN
    RAISE EXCEPTION 'La matrícula no está activa' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_attendance_records_validar
  BEFORE INSERT OR UPDATE OR DELETE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION fn_attendance_records_validar();

-- ---------------------------------------------------------------------
--  Fallas de la planilla calculadas desde la asistencia
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_recalcular_fallas(p_enrollment uuid, p_assignment uuid, p_period uuid, p_autor uuid) RETURNS void
  LANGUAGE plpgsql AS
$$
DECLARE v_inst uuid; v_fallas int; v_justificadas int;
BEGIN
  SELECT s.institution_id,
         coalesce(sum(s.horas) FILTER (WHERE r.estado IN ('AUSENTE', 'EXCUSA')), 0),
         coalesce(sum(s.horas) FILTER (WHERE r.estado = 'EXCUSA'), 0)
    INTO v_inst, v_fallas, v_justificadas
    FROM attendance_sessions s
    JOIN attendance_records r ON r.session_id = s.id AND r.enrollment_id = p_enrollment
   WHERE s.teacher_assignment_id = p_assignment AND s.period_id = p_period
   GROUP BY s.institution_id;

  IF v_inst IS NULL THEN
    -- Ya no quedan registros: las fallas vuelven a cero (si existe la fila).
    UPDATE grades SET fallas = 0, fallas_justificadas = 0
     WHERE enrollment_id = p_enrollment AND teacher_assignment_id = p_assignment AND period_id = p_period
       AND (fallas <> 0 OR fallas_justificadas <> 0);
    RETURN;
  END IF;

  INSERT INTO grades (institution_id, enrollment_id, teacher_assignment_id, period_id, fallas, fallas_justificadas, updated_by)
  VALUES (v_inst, p_enrollment, p_assignment, p_period, v_fallas, v_justificadas, p_autor)
  ON CONFLICT (enrollment_id, teacher_assignment_id, period_id) DO UPDATE
     SET fallas = EXCLUDED.fallas, fallas_justificadas = EXCLUDED.fallas_justificadas
   WHERE grades.fallas IS DISTINCT FROM EXCLUDED.fallas
      OR grades.fallas_justificadas IS DISTINCT FROM EXCLUDED.fallas_justificadas;
END
$$;

CREATE FUNCTION fn_attendance_records_fallas() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE v_asig uuid; v_periodo uuid; v_autor uuid; v_mat uuid := coalesce(NEW.enrollment_id, OLD.enrollment_id);
BEGIN
  SELECT teacher_assignment_id, period_id, registrado_por INTO v_asig, v_periodo, v_autor
    FROM attendance_sessions WHERE id = coalesce(NEW.session_id, OLD.session_id);
  IF v_asig IS NOT NULL THEN
    PERFORM fn_recalcular_fallas(v_mat, v_asig, v_periodo, v_autor);
  END IF;
  RETURN NULL;
END
$$;
CREATE TRIGGER trg_attendance_records_fallas
  AFTER INSERT OR UPDATE OR DELETE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION fn_attendance_records_fallas();

-- Cambiar la duración de una clase recalcula a todo el grupo.
CREATE FUNCTION fn_attendance_sessions_fallas() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE r record;
BEGIN
  IF NEW.horas IS DISTINCT FROM OLD.horas THEN
    FOR r IN SELECT enrollment_id FROM attendance_records WHERE session_id = NEW.id LOOP
      PERFORM fn_recalcular_fallas(r.enrollment_id, NEW.teacher_assignment_id, NEW.period_id, NEW.registrado_por);
    END LOOP;
  END IF;
  RETURN NULL;
END
$$;
CREATE TRIGGER trg_attendance_sessions_fallas
  AFTER UPDATE OF horas ON attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION fn_attendance_sessions_fallas();

-- ---------------------------------------------------------------------
--  RLS
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance_sessions', 'attendance_records'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (institution_id = app_institution_id())
         WITH CHECK (institution_id = app_institution_id())', t);
  END LOOP;
END
$$;

COMMIT;

-- Permisos del rol de la aplicación (ejecutar como superusuario):
-- GRANT SELECT, INSERT, UPDATE, DELETE ON attendance_sessions, attendance_records TO kora_app;
