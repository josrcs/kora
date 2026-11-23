-- =====================================================================
--  0006 · Actividades, recuperación, corte preventivo y permisos de notas
--
--  1. ACTIVIDADES: cada docente crea en SU planilla (asignación + periodo)
--     actividades con nombre y porcentaje ("Quiz temático 30 %") y las
--     califica. La definitiva del periodo se calcula a partir de ellas.
--     (Los logros quedan como descripción curricular del boletín.)
--  2. RECUPERACIÓN: cerrado un periodo, nadie lo modifica. Cuando empieza el
--     siguiente (y mientras siga abierto), el docente registra la nota de
--     recuperación SOLO de quienes perdieron, con tope institucional (3.0).
--     La nota que vale es nota_final = coalesce(recuperación, nota).
--  3. CORTE PREVENTIVO: a mitad de periodo coordinación toma una foto de
--     las notas parciales (fn_generar_corte_preventivo).
--  4. PERMISOS: solo docentes y coordinación escriben notas, y un docente
--     solo en las asignaciones que coordinación le asignó.
-- =====================================================================

BEGIN;

ALTER TABLE institutions ADD COLUMN nota_max_recuperacion numeric(3,2) NOT NULL DEFAULT 3.00
  CONSTRAINT institutions_recuperacion_chk CHECK (nota_max_recuperacion > escala_min AND nota_max_recuperacion <= escala_max);
ALTER TABLE periods ADD COLUMN fecha_corte date
  CONSTRAINT periods_fecha_corte_chk CHECK (fecha_corte IS NULL OR fecha_corte BETWEEN fecha_inicio AND fecha_fin);
UPDATE periods SET fecha_corte = fecha_inicio + (fecha_fin - fecha_inicio) / 2;

-- ---------------------------------------------------------------------
--  Quién puede escribir notas: coordinación, o el docente DUEÑO de la asignación.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_assert_editor_asignacion(p_user uuid, p_assignment uuid) RETURNS void
  LANGUAGE plpgsql STABLE AS
$$
DECLARE v_rol rol_usuario; v_docente uuid;
BEGIN
  SELECT rol INTO v_rol FROM users WHERE id = p_user;
  IF v_rol = 'COORDINATOR' THEN RETURN; END IF;
  SELECT teacher_id INTO v_docente FROM teacher_assignments WHERE id = p_assignment;
  IF v_rol = 'TEACHER' AND v_docente = p_user THEN RETURN; END IF;
  RAISE EXCEPTION 'Solo el docente asignado o coordinación pueden calificar esta asignatura'
    USING ERRCODE = 'check_violation', HINT = 'SIN_PERMISO';
END
$$;

CREATE OR REPLACE FUNCTION fn_assert_editor_academico() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.updated_by IS NOT DISTINCT FROM OLD.updated_by THEN
    RETURN NEW;  -- p. ej. el traslado de grupo re-apunta la asignación sin cambiar el autor
  END IF;
  IF TG_TABLE_NAME = 'grades' THEN
    PERFORM fn_assert_editor_asignacion(NEW.updated_by, NEW.teacher_assignment_id);
  ELSE
    PERFORM fn_assert_rol(NEW.updated_by, ARRAY['TEACHER', 'COORDINATOR']::rol_usuario[], 'updated_by');
  END IF;
  RETURN NEW;
END
$$;

-- ---------------------------------------------------------------------
--  Actividades
-- ---------------------------------------------------------------------
CREATE TABLE activities (
  id                     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id         uuid          NOT NULL,
  teacher_assignment_id  uuid          NOT NULL,
  period_id              uuid          NOT NULL,
  nombre                 varchar(60)   NOT NULL CHECK (length(trim(nombre)) >= 2),
  porcentaje             numeric(5,2)  NOT NULL CHECK (porcentaje > 0 AND porcentaje <= 100),
  orden                  smallint      NOT NULL DEFAULT 1,
  created_by             uuid          NOT NULL,
  created_at             timestamptz   NOT NULL DEFAULT now(),
  updated_at             timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT activities_nombre_uq UNIQUE (teacher_assignment_id, period_id, nombre),
  CONSTRAINT activities_tenant_uq UNIQUE (institution_id, id),
  FOREIGN KEY (institution_id, teacher_assignment_id) REFERENCES teacher_assignments (institution_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (institution_id, period_id)             REFERENCES periods (institution_id, id)             ON DELETE RESTRICT,
  FOREIGN KEY (institution_id, created_by)            REFERENCES users (institution_id, id)
);
CREATE INDEX activities_planilla_idx ON activities (teacher_assignment_id, period_id, orden);
CREATE TRIGGER trg_activities_touch BEFORE UPDATE ON activities FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE FUNCTION fn_activities_validar() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE v_ta_grupo_anio uuid; v_per_anio uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM fn_assert_periodo_abierto(OLD.period_id);
    RETURN OLD;
  END IF;
  PERFORM fn_assert_periodo_abierto(NEW.period_id);
  IF TG_OP = 'INSERT' THEN
    PERFORM fn_assert_editor_asignacion(NEW.created_by, NEW.teacher_assignment_id);
  END IF;
  SELECT g.academic_year_id INTO v_ta_grupo_anio FROM teacher_assignments ta JOIN groups g ON g.id = ta.group_id WHERE ta.id = NEW.teacher_assignment_id;
  SELECT academic_year_id INTO v_per_anio FROM periods WHERE id = NEW.period_id;
  IF v_ta_grupo_anio IS DISTINCT FROM v_per_anio THEN
    RAISE EXCEPTION 'El periodo no corresponde al año de la asignación' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_activities_validar BEFORE INSERT OR UPDATE OR DELETE ON activities
  FOR EACH ROW EXECUTE FUNCTION fn_activities_validar();

CREATE FUNCTION fn_activities_porcentaje() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE v_total numeric;
BEGIN
  SELECT coalesce(sum(porcentaje), 0) INTO v_total
    FROM activities WHERE teacher_assignment_id = NEW.teacher_assignment_id AND period_id = NEW.period_id;
  IF v_total > 100 THEN
    RAISE EXCEPTION 'Las actividades suman % %% (máximo 100 %%)', v_total USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END
$$;
CREATE CONSTRAINT TRIGGER trg_activities_porcentaje AFTER INSERT OR UPDATE OF porcentaje ON activities
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_activities_porcentaje();

CREATE TABLE activity_scores (
  institution_id  uuid          NOT NULL,
  activity_id     uuid          NOT NULL,
  enrollment_id   uuid          NOT NULL,
  nota            numeric(3,2)  NOT NULL,
  updated_by      uuid          NOT NULL,
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, enrollment_id),
  FOREIGN KEY (institution_id, activity_id)   REFERENCES activities (institution_id, id)  ON DELETE CASCADE,
  FOREIGN KEY (institution_id, enrollment_id) REFERENCES enrollments (institution_id, id) ON DELETE CASCADE,
  FOREIGN KEY (institution_id, updated_by)    REFERENCES users (institution_id, id)
);
CREATE INDEX activity_scores_matricula_idx ON activity_scores (enrollment_id);
CREATE TRIGGER trg_activity_scores_touch BEFORE UPDATE ON activity_scores FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE FUNCTION fn_activity_scores_validar() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE v_periodo uuid; v_asignacion uuid; v_grupo uuid; v_mat_grupo uuid; v_estado estado_matricula;
BEGIN
  SELECT period_id, teacher_assignment_id INTO v_periodo, v_asignacion
    FROM activities WHERE id = coalesce(NEW.activity_id, OLD.activity_id);
  PERFORM fn_assert_periodo_abierto(v_periodo);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  PERFORM fn_assert_nota_en_escala(NEW.institution_id, NEW.nota);
  IF TG_OP = 'INSERT' OR NEW.updated_by IS DISTINCT FROM OLD.updated_by OR NEW.nota IS DISTINCT FROM OLD.nota THEN
    PERFORM fn_assert_editor_asignacion(NEW.updated_by, v_asignacion);
  END IF;
  SELECT group_id INTO v_grupo FROM teacher_assignments WHERE id = v_asignacion;
  SELECT group_id, estado INTO v_mat_grupo, v_estado FROM enrollments WHERE id = NEW.enrollment_id;
  IF v_mat_grupo IS DISTINCT FROM v_grupo OR v_estado <> 'ACTIVA' THEN
    RAISE EXCEPTION 'El estudiante no tiene matrícula activa en el grupo de la actividad' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_activity_scores_validar BEFORE INSERT OR UPDATE OR DELETE ON activity_scores
  FOR EACH ROW EXECUTE FUNCTION fn_activity_scores_validar();

CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON activities FOR EACH ROW EXECUTE FUNCTION fn_audit();

-- ---------------------------------------------------------------------
--  Recuperación
-- ---------------------------------------------------------------------
ALTER TABLE grades
  ADD COLUMN nota_recuperacion numeric(3,2),
  ADD COLUMN recuperada_at     timestamptz,
  ADD COLUMN recuperada_por    uuid,
  ADD COLUMN nota_final        numeric(3,2) GENERATED ALWAYS AS (coalesce(nota_recuperacion, nota)) STORED,
  ADD CONSTRAINT grades_recuperacion_chk CHECK ((nota_recuperacion IS NULL) = (recuperada_at IS NULL AND recuperada_por IS NULL)),
  ADD CONSTRAINT grades_recuperada_por_fk FOREIGN KEY (institution_id, recuperada_por) REFERENCES users (institution_id, id);

/** ¿Está abierta la ventana de recuperación del periodo? (cerrado, y el siguiente ya empezó y sigue abierto) */
CREATE FUNCTION fn_ventana_recuperacion(p_period uuid) RETURNS boolean
  LANGUAGE sql STABLE AS
$$
  SELECT p.cerrado AND EXISTS (
           SELECT 1 FROM periods s
            WHERE s.academic_year_id = p.academic_year_id AND s.numero = p.numero + 1
              AND NOT s.cerrado AND s.fecha_inicio <= current_date)
    FROM periods p WHERE p.id = p_period
$$;

CREATE OR REPLACE FUNCTION fn_grades_validar() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE
  v_mat_grupo uuid; v_mat_anio uuid; v_mat_estado estado_matricula;
  v_asig_grupo uuid; v_per_anio uuid;
  v_traslado boolean; v_recuperacion boolean;
  v_aprobatoria numeric; v_tope numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM fn_assert_periodo_abierto(OLD.period_id);
    RETURN OLD;
  END IF;

  -- (a) Traslado de grupo (0004): solo cambia la asignación; el valor queda intacto.
  v_traslado := TG_OP = 'UPDATE'
    AND current_setting('app.traslado_enrollment', true) = NEW.enrollment_id::text
    AND NEW.period_id = OLD.period_id
    AND NEW.nota IS NOT DISTINCT FROM OLD.nota
    AND NEW.nota_recuperacion IS NOT DISTINCT FROM OLD.nota_recuperacion
    AND NEW.fallas = OLD.fallas
    AND NEW.fallas_justificadas = OLD.fallas_justificadas
    AND NEW.observacion IS NOT DISTINCT FROM OLD.observacion;

  -- (b) Recuperación: solo cambian las columnas de recuperación.
  v_recuperacion := TG_OP = 'UPDATE' AND NOT v_traslado
    AND NEW.nota_recuperacion IS DISTINCT FROM OLD.nota_recuperacion
    AND NEW.period_id = OLD.period_id
    AND NEW.teacher_assignment_id = OLD.teacher_assignment_id
    AND NEW.enrollment_id = OLD.enrollment_id
    AND NEW.nota IS NOT DISTINCT FROM OLD.nota
    AND NEW.fallas = OLD.fallas
    AND NEW.observacion IS NOT DISTINCT FROM OLD.observacion;

  IF v_recuperacion THEN
    IF NOT fn_ventana_recuperacion(NEW.period_id) THEN
      RAISE EXCEPTION 'La recuperación solo se registra cuando el periodo está cerrado y ya empezó el siguiente'
        USING ERRCODE = 'P0001', HINT = 'FUERA_DE_VENTANA';
    END IF;
    SELECT nota_aprobatoria, nota_max_recuperacion INTO v_aprobatoria, v_tope FROM institutions WHERE id = NEW.institution_id;
    IF OLD.nota IS NULL OR OLD.nota >= v_aprobatoria THEN
      RAISE EXCEPTION 'Solo se recupera una asignatura perdida en el periodo' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.nota_recuperacion IS NOT NULL THEN
      PERFORM fn_assert_nota_en_escala(NEW.institution_id, NEW.nota_recuperacion);
      IF NEW.nota_recuperacion > v_tope THEN
        RAISE EXCEPTION 'La nota de recuperación no puede superar %', v_tope USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.nota_recuperacion < OLD.nota THEN
        RAISE EXCEPTION 'La recuperación no puede bajar la nota del periodo (%)', OLD.nota USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  ELSIF NOT v_traslado THEN
    IF TG_OP = 'UPDATE' AND OLD.period_id <> NEW.period_id THEN
      PERFORM fn_assert_periodo_abierto(OLD.period_id);
    END IF;
    PERFORM fn_assert_periodo_abierto(NEW.period_id);
    PERFORM fn_assert_nota_en_escala(NEW.institution_id, NEW.nota);
    IF NEW.nota_recuperacion IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.nota_recuperacion END) THEN
      RAISE EXCEPTION 'La recuperación solo se registra con el periodo cerrado' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT group_id, academic_year_id, estado INTO v_mat_grupo, v_mat_anio, v_mat_estado FROM enrollments WHERE id = NEW.enrollment_id;
  SELECT group_id INTO v_asig_grupo FROM teacher_assignments WHERE id = NEW.teacher_assignment_id;
  SELECT academic_year_id INTO v_per_anio FROM periods WHERE id = NEW.period_id;

  IF v_mat_grupo IS DISTINCT FROM v_asig_grupo THEN
    RAISE EXCEPTION 'La matrícula no pertenece al grupo de la asignación' USING ERRCODE = 'check_violation';
  END IF;
  IF v_mat_anio IS DISTINCT FROM v_per_anio THEN
    RAISE EXCEPTION 'El periodo no corresponde al año de la matrícula' USING ERRCODE = 'check_violation';
  END IF;
  IF v_mat_estado <> 'ACTIVA' THEN
    RAISE EXCEPTION 'La matrícula no está activa' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

-- La vista de detalle usa la nota que vale (con recuperación).
CREATE OR REPLACE VIEW v_grades_detail WITH (security_invoker = true) AS
SELECT
  g.id AS grade_id, g.institution_id, g.period_id, g.enrollment_id, e.student_id, ta.group_id, ta.subject_id, ta.teacher_id,
  g.nota_final AS nota,
  fn_desempeno(g.institution_id, g.nota_final) AS desempeno,
  (g.nota_final IS NOT NULL AND g.nota_final < i.nota_aprobatoria) AS reprobada,
  g.fallas, g.fallas_justificadas, g.observacion, g.updated_at
FROM grades g
JOIN enrollments e          ON e.id = g.enrollment_id
JOIN teacher_assignments ta ON ta.id = g.teacher_assignment_id
JOIN institutions i         ON i.id = g.institution_id;

-- ---------------------------------------------------------------------
--  Corte preventivo (foto de las notas parciales a mitad de periodo)
-- ---------------------------------------------------------------------
CREATE TABLE preventive_cuts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid        NOT NULL,
  period_id       uuid        NOT NULL,
  realizado_at    timestamptz NOT NULL DEFAULT now(),
  realizado_por   uuid        NOT NULL,
  CONSTRAINT preventive_cuts_periodo_uq UNIQUE (period_id),
  CONSTRAINT preventive_cuts_tenant_uq  UNIQUE (institution_id, id),
  FOREIGN KEY (institution_id, period_id)     REFERENCES periods (institution_id, id) ON DELETE CASCADE,
  FOREIGN KEY (institution_id, realizado_por) REFERENCES users (institution_id, id)
);

CREATE TABLE preventive_cut_grades (
  institution_id         uuid          NOT NULL,
  cut_id                 uuid          NOT NULL,
  enrollment_id          uuid          NOT NULL,
  teacher_assignment_id  uuid          NOT NULL,
  nota                   numeric(3,2),                  -- NULL: sin ninguna nota al momento del corte
  PRIMARY KEY (cut_id, enrollment_id, teacher_assignment_id),
  FOREIGN KEY (institution_id, cut_id)                REFERENCES preventive_cuts (institution_id, id)     ON DELETE CASCADE,
  FOREIGN KEY (institution_id, enrollment_id)         REFERENCES enrollments (institution_id, id)         ON DELETE CASCADE,
  FOREIGN KEY (institution_id, teacher_assignment_id) REFERENCES teacher_assignments (institution_id, id) ON DELETE CASCADE
);
CREATE INDEX preventive_cut_grades_matricula_idx ON preventive_cut_grades (enrollment_id);

/**
 * Genera (o rehace) el corte del periodo: para cada estudiante activo y cada
 * asignatura de su grupo, el promedio ponderado de las actividades calificadas
 * hasta hoy (redondeado a los decimales del colegio); si la asignatura no tiene
 * actividades, la definitiva digitada. Devuelve cuántas notas quedaron en el corte.
 */
CREATE FUNCTION fn_generar_corte_preventivo(p_period uuid, p_actor uuid) RETURNS integer
  LANGUAGE plpgsql AS
$$
DECLARE v_inst uuid; v_anio uuid; v_cerrado boolean; v_dec smallint; v_corte uuid; v_n integer;
BEGIN
  SELECT p.institution_id, p.academic_year_id, p.cerrado, i.decimales_nota INTO v_inst, v_anio, v_cerrado, v_dec
    FROM periods p JOIN institutions i ON i.id = p.institution_id WHERE p.id = p_period;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'El periodo no existe' USING ERRCODE = 'P0001', HINT = 'CORTE'; END IF;
  IF v_cerrado THEN RAISE EXCEPTION 'El periodo está cerrado: el corte preventivo se hace con el periodo en curso' USING ERRCODE = 'P0001', HINT = 'CORTE'; END IF;
  PERFORM fn_assert_rol(p_actor, ARRAY['COORDINATOR']::rol_usuario[], 'realizado_por');

  DELETE FROM preventive_cuts WHERE period_id = p_period;
  INSERT INTO preventive_cuts (institution_id, period_id, realizado_por) VALUES (v_inst, p_period, p_actor) RETURNING id INTO v_corte;

  INSERT INTO preventive_cut_grades (institution_id, cut_id, enrollment_id, teacher_assignment_id, nota)
  SELECT v_inst, v_corte, e.id, ta.id,
         CASE WHEN EXISTS (SELECT 1 FROM activities a WHERE a.teacher_assignment_id = ta.id AND a.period_id = p_period)
              THEN (SELECT round(sum(s.nota * a.porcentaje) / nullif(sum(a.porcentaje), 0), v_dec)
                      FROM activities a JOIN activity_scores s ON s.activity_id = a.id AND s.enrollment_id = e.id
                     WHERE a.teacher_assignment_id = ta.id AND a.period_id = p_period)
              ELSE (SELECT g.nota FROM grades g WHERE g.enrollment_id = e.id AND g.teacher_assignment_id = ta.id AND g.period_id = p_period)
         END
    FROM enrollments e
    JOIN teacher_assignments ta ON ta.group_id = e.group_id
   WHERE e.academic_year_id = v_anio AND e.estado = 'ACTIVA' AND e.institution_id = v_inst;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$$;

-- ---------------------------------------------------------------------
--  RLS de las tablas nuevas
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['activities', 'activity_scores', 'preventive_cuts', 'preventive_cut_grades'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (institution_id = app_institution_id()) WITH CHECK (institution_id = app_institution_id())', t);
  END LOOP;
END
$$;

COMMIT;
