-- =====================================================================
--  0007 · Nota de convivencia, avisos y comunicados, autorización de datos
--
--  1. convivencia_grades: nota de convivencia (comportamiento) por
--     estudiante y periodo. La pone coordinación o el director de grupo;
--     el estudiante y su acudiente la ven en el portal y en el boletín.
--  2. announcements / announcement_reads: avisos y comunicados que
--     coordinación publica para estudiantes y acudientes, con acuse de
--     lectura.
--  3. data_consents: evidencia de la autorización de tratamiento de datos
--     personales (Ley 1581 de 2012, Decreto 1377 de 2013 compilado en el
--     Decreto 1074 de 2015). Es un registro inmutable: aceptar, rechazar o
--     revocar agrega una fila; nunca se edita ni se borra.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
--  1. Nota de convivencia
-- ---------------------------------------------------------------------
CREATE TABLE convivencia_grades (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid          NOT NULL,
  enrollment_id   uuid          NOT NULL,
  period_id       uuid          NOT NULL,
  nota            numeric(3,2)  NOT NULL CHECK (nota >= 0),
  observacion     varchar(1000),
  updated_by      uuid          NOT NULL,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT convivencia_grades_uq        UNIQUE (enrollment_id, period_id),
  CONSTRAINT convivencia_grades_tenant_uq UNIQUE (institution_id, id),
  FOREIGN KEY (institution_id, enrollment_id) REFERENCES enrollments (institution_id, id) ON DELETE CASCADE,
  FOREIGN KEY (institution_id, period_id)     REFERENCES periods (institution_id, id)     ON DELETE RESTRICT,
  FOREIGN KEY (institution_id, updated_by)    REFERENCES users (institution_id, id)
);
CREATE INDEX convivencia_grades_periodo_idx ON convivencia_grades (period_id);
CREATE TRIGGER trg_convivencia_grades_touch BEFORE UPDATE ON convivencia_grades
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Periodo abierto, nota en la escala del colegio, matrícula activa del mismo
-- año y autor válido: coordinación, o el docente director de ese grupo.
CREATE FUNCTION fn_convivencia_grades_validar() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE
  v_grupo uuid; v_anio uuid; v_estado estado_matricula; v_per_anio uuid; v_director uuid; v_rol rol_usuario;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM fn_assert_periodo_abierto(OLD.period_id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.period_id <> NEW.period_id THEN
    PERFORM fn_assert_periodo_abierto(OLD.period_id);
  END IF;
  PERFORM fn_assert_periodo_abierto(NEW.period_id);
  PERFORM fn_assert_nota_en_escala(NEW.institution_id, NEW.nota);

  SELECT group_id, academic_year_id, estado INTO v_grupo, v_anio, v_estado FROM enrollments WHERE id = NEW.enrollment_id;
  SELECT academic_year_id INTO v_per_anio FROM periods WHERE id = NEW.period_id;
  IF v_anio IS DISTINCT FROM v_per_anio THEN
    RAISE EXCEPTION 'El periodo no corresponde al año de la matrícula' USING ERRCODE = 'check_violation';
  END IF;
  IF v_estado <> 'ACTIVA' THEN
    RAISE EXCEPTION 'La matrícula no está activa' USING ERRCODE = 'check_violation';
  END IF;

  SELECT rol INTO v_rol FROM users WHERE id = NEW.updated_by;
  IF v_rol = 'COORDINATOR' THEN
    RETURN NEW;
  END IF;
  SELECT director_id INTO v_director FROM groups WHERE id = v_grupo;
  IF v_rol = 'TEACHER' AND v_director = NEW.updated_by THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Solo coordinación o el director de grupo registran la nota de convivencia'
    USING ERRCODE = 'insufficient_privilege';
END
$$;
CREATE TRIGGER trg_convivencia_grades_validar
  BEFORE INSERT OR UPDATE OR DELETE ON convivencia_grades
  FOR EACH ROW EXECUTE FUNCTION fn_convivencia_grades_validar();
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON convivencia_grades
  FOR EACH ROW EXECUTE FUNCTION fn_audit();

-- ---------------------------------------------------------------------
--  2. Avisos y comunicados
-- ---------------------------------------------------------------------
CREATE TYPE audiencia_aviso AS ENUM ('TODOS', 'ESTUDIANTES', 'ACUDIENTES');
CREATE TYPE tipo_aviso AS ENUM ('AVISO', 'COMUNICADO', 'URGENTE');

CREATE TABLE announcements (
  id              uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid             NOT NULL,
  autor_id        uuid             NOT NULL,
  tipo            tipo_aviso       NOT NULL DEFAULT 'AVISO',
  audiencia       audiencia_aviso  NOT NULL DEFAULT 'TODOS',
  titulo          varchar(140)     NOT NULL CHECK (length(trim(titulo)) >= 3),
  cuerpo          varchar(5000)    NOT NULL CHECK (length(trim(cuerpo)) >= 10),
  fijado          boolean          NOT NULL DEFAULT false,
  archivado_at    timestamptz,
  created_at      timestamptz      NOT NULL DEFAULT now(),
  updated_at      timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT announcements_tenant_uq UNIQUE (institution_id, id),
  FOREIGN KEY (institution_id, autor_id) REFERENCES users (institution_id, id) ON DELETE RESTRICT
);
CREATE INDEX announcements_vigentes_idx ON announcements (institution_id, created_at DESC) WHERE archivado_at IS NULL;
CREATE TRIGGER trg_announcements_touch BEFORE UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE FUNCTION fn_announcements_autoria() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  PERFORM fn_assert_rol(NEW.autor_id, ARRAY['COORDINATOR']::rol_usuario[], 'autor_id (avisos)');
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_announcements_autoria BEFORE INSERT OR UPDATE OF autor_id ON announcements
  FOR EACH ROW EXECUTE FUNCTION fn_announcements_autoria();
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON announcements
  FOR EACH ROW EXECUTE FUNCTION fn_audit();

CREATE TABLE announcement_reads (
  institution_id   uuid         NOT NULL,
  announcement_id  uuid         NOT NULL,
  user_id          uuid         NOT NULL,
  leido_at         timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id),
  FOREIGN KEY (institution_id, announcement_id) REFERENCES announcements (institution_id, id) ON DELETE CASCADE,
  FOREIGN KEY (institution_id, user_id)         REFERENCES users (institution_id, id)         ON DELETE CASCADE
);
CREATE INDEX announcement_reads_usuario_idx ON announcement_reads (user_id);

-- ---------------------------------------------------------------------
--  3. Autorización de tratamiento de datos personales
--     ACEPTACION_USUARIO: el titular (o el acudiente, por su cuenta) acepta
--       o rechaza la política al ingresar. Sin una aceptación vigente de la
--       versión actual, la app no deja usar la cuenta.
--     AUTORIZACION_REPRESENTANTE: autorización previa, expresa e informada
--       del representante legal de un menor (art. 7 Decreto 1377 de 2013),
--       que la secretaría registra al matricular. Sin ella no se crea la
--       cuenta del estudiante.
-- ---------------------------------------------------------------------
CREATE TYPE tipo_consentimiento AS ENUM ('ACEPTACION_USUARIO', 'AUTORIZACION_REPRESENTANTE');

CREATE TABLE data_consents (
  id                        uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id            uuid                 NOT NULL,
  user_id                   uuid                 NOT NULL,          -- titular de los datos
  tipo                      tipo_consentimiento  NOT NULL,
  version                   varchar(20)          NOT NULL,          -- versión de la política
  aceptado                  boolean              NOT NULL,          -- false = rechazo o revocatoria
  representante_nombre      varchar(161),
  representante_documento   varchar(20),
  representante_parentesco  varchar(40),
  registrado_por            uuid                 NOT NULL,          -- quien hizo el registro en la app
  ip                        inet,
  user_agent                varchar(300),
  created_at                timestamptz          NOT NULL DEFAULT now(),
  CHECK (tipo <> 'AUTORIZACION_REPRESENTANTE' OR (representante_nombre IS NOT NULL AND representante_documento IS NOT NULL)),
  FOREIGN KEY (institution_id, user_id)        REFERENCES users (institution_id, id) ON DELETE CASCADE,
  FOREIGN KEY (institution_id, registrado_por) REFERENCES users (institution_id, id)
);
CREATE INDEX data_consents_usuario_idx ON data_consents (user_id, tipo, created_at DESC);

-- Evidencia inmutable: se agrega, nunca se modifica ni se borra (salvo en cascada al borrar el usuario).
CREATE FUNCTION fn_data_consents_inmutable() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  RAISE EXCEPTION 'El registro de autorizaciones de datos no se modifica: agregue una nueva fila'
    USING ERRCODE = 'insufficient_privilege';
END
$$;
CREATE TRIGGER trg_data_consents_inmutable BEFORE UPDATE ON data_consents
  FOR EACH ROW EXECUTE FUNCTION fn_data_consents_inmutable();

-- ---------------------------------------------------------------------
--  RLS (igual que las demás tablas de un colegio)
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['convivencia_grades', 'announcements', 'announcement_reads', 'data_consents'] LOOP
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
-- GRANT SELECT, INSERT, UPDATE, DELETE ON convivencia_grades, announcements, announcement_reads TO kora_app;
-- GRANT SELECT, INSERT ON data_consents TO kora_app;
