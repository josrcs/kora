-- =====================================================================
--  0004 · Cambio de grupo de un estudiante a mitad de año
--
--  Las calificaciones apuntan a la asignación (grupo + asignatura). Si el
--  estudiante pasa de 6-01 a 6-02, sus notas deben pasar a las asignaciones
--  equivalentes de 6-02, incluidas las de periodos ya cerrados: si no, el
--  boletín (que lee la carga del grupo actual) las perdería.
--
--  El cierre de periodos prohíbe cualquier UPDATE de notas. La única
--  excepción es esta función: re-apunta la asignación SIN tocar nota,
--  fallas ni observación, y solo para la matrícula que está trasladando
--  (marcada con app.traslado_enrollment durante la transacción).
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION fn_grades_validar() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE
  v_mat_grupo uuid; v_mat_anio uuid; v_mat_estado estado_matricula;
  v_asig_grupo uuid; v_per_anio uuid;
  v_traslado boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM fn_assert_periodo_abierto(OLD.period_id);
    RETURN OLD;
  END IF;

  -- Traslado de grupo: solo cambia la asignación; el valor queda intacto.
  v_traslado := TG_OP = 'UPDATE'
    AND current_setting('app.traslado_enrollment', true) = NEW.enrollment_id::text
    AND NEW.period_id = OLD.period_id
    AND NEW.nota IS NOT DISTINCT FROM OLD.nota
    AND NEW.fallas = OLD.fallas
    AND NEW.fallas_justificadas = OLD.fallas_justificadas
    AND NEW.observacion IS NOT DISTINCT FROM OLD.observacion;

  IF NOT v_traslado THEN
    IF TG_OP = 'UPDATE' AND OLD.period_id <> NEW.period_id THEN
      PERFORM fn_assert_periodo_abierto(OLD.period_id);
    END IF;
    PERFORM fn_assert_periodo_abierto(NEW.period_id);
    PERFORM fn_assert_nota_en_escala(NEW.institution_id, NEW.nota);
  END IF;

  SELECT group_id, academic_year_id, estado INTO v_mat_grupo, v_mat_anio, v_mat_estado
    FROM enrollments WHERE id = NEW.enrollment_id;
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

-- Cambia de grupo una matrícula activa (mismo año y mismo grado) y lleva sus
-- calificaciones a las asignaciones equivalentes. Devuelve cuántas movió.
CREATE FUNCTION fn_trasladar_matricula(p_enrollment uuid, p_group uuid) RETURNS integer
  LANGUAGE plpgsql AS
$$
DECLARE
  v_mat enrollments%ROWTYPE;
  v_grado_origen uuid; v_grado_destino uuid; v_anio_destino uuid;
  v_faltan text; v_movidas integer;
BEGIN
  SELECT * INTO v_mat FROM enrollments WHERE id = p_enrollment FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La matrícula no existe' USING ERRCODE = 'P0001', HINT = 'TRASLADO';
  END IF;
  IF v_mat.estado <> 'ACTIVA' THEN
    RAISE EXCEPTION 'Solo se puede cambiar de grupo una matrícula activa' USING ERRCODE = 'P0001', HINT = 'TRASLADO';
  END IF;
  IF v_mat.group_id = p_group THEN
    RAISE EXCEPTION 'El estudiante ya está en ese grupo' USING ERRCODE = 'P0001', HINT = 'TRASLADO';
  END IF;

  SELECT grade_level_id INTO v_grado_origen FROM groups WHERE id = v_mat.group_id;
  SELECT grade_level_id, academic_year_id INTO v_grado_destino, v_anio_destino
    FROM groups WHERE id = p_group AND institution_id = v_mat.institution_id;
  IF v_anio_destino IS DISTINCT FROM v_mat.academic_year_id OR v_grado_destino IS DISTINCT FROM v_grado_origen THEN
    RAISE EXCEPTION 'El grupo destino debe ser del mismo grado y año lectivo' USING ERRCODE = 'P0001', HINT = 'TRASLADO';
  END IF;

  -- Toda asignatura con notas debe existir en la carga del grupo destino.
  SELECT string_agg(DISTINCT s.nombre, ', ' ORDER BY s.nombre) INTO v_faltan
    FROM grades g
    JOIN teacher_assignments ta ON ta.id = g.teacher_assignment_id
    JOIN subjects s             ON s.id = ta.subject_id
   WHERE g.enrollment_id = p_enrollment
     AND NOT EXISTS (SELECT 1 FROM teacher_assignments t2 WHERE t2.group_id = p_group AND t2.subject_id = ta.subject_id);
  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION 'El grupo destino no tiene asignadas: %', v_faltan USING ERRCODE = 'P0001', HINT = 'TRASLADO';
  END IF;

  PERFORM set_config('app.traslado_enrollment', p_enrollment::text, true);
  UPDATE enrollments SET group_id = p_group WHERE id = p_enrollment;
  UPDATE grades g
     SET teacher_assignment_id = destino.id
    FROM teacher_assignments origen, teacher_assignments destino
   WHERE g.enrollment_id = p_enrollment
     AND origen.id = g.teacher_assignment_id
     AND destino.group_id = p_group
     AND destino.subject_id = origen.subject_id;
  GET DIAGNOSTICS v_movidas = ROW_COUNT;
  PERFORM set_config('app.traslado_enrollment', '', true);
  RETURN v_movidas;
END
$$;

COMMIT;
