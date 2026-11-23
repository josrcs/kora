-- =====================================================================
--  Kora · Plataforma de gestión académica multi-institución
--  0001 · Esquema inicial (PostgreSQL 15+)
--
--  Principios de diseño
--  ---------------------------------------------------------------------
--  1. Multi-institución: toda tabla de negocio lleva `institution_id`.
--     Las FKs entre tablas de negocio son COMPUESTAS (institution_id, x_id),
--     así es imposible, a nivel de motor, que una nota de un colegio apunte
--     a una matrícula de otro. RLS es una segunda barrera (ver final).
--  2. La base de datos es la última línea de defensa: el bloqueo de
--     periodos cerrados, la escala de notas de cada colegio, la coherencia
--     grupo/año/grado y la auditoría se validan aquí, además de en la API.
--  3. Identificadores UUID (no enumerables desde la URL).
--  4. Las notas se guardan como NUMERIC(3,2): sin errores de coma flotante.
--
--  Variables de sesión que la aplicación fija en cada transacción:
--    SET LOCAL app.institution_id = '<uuid>';   -- tenant actual (RLS)
--    SET LOCAL app.user_id        = '<uuid>';   -- actor (auditoría)
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;  -- EXCLUDE con igualdad + rangos
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- búsqueda difusa de colegios y personas

-- ---------------------------------------------------------------------
--  Tipos enumerados
-- ---------------------------------------------------------------------
CREATE TYPE rol_usuario       AS ENUM ('ADMIN', 'COORDINATOR', 'TEACHER', 'STUDENT', 'GUARDIAN');
CREATE TYPE tipo_documento    AS ENUM ('RC', 'TI', 'CC', 'CE', 'NUIP', 'PPT', 'PA');
CREATE TYPE nivel_educativo   AS ENUM ('PREESCOLAR', 'BASICA_PRIMARIA', 'BASICA_SECUNDARIA', 'MEDIA');
CREATE TYPE jornada           AS ENUM ('MANANA', 'TARDE', 'NOCHE', 'UNICA', 'FIN_DE_SEMANA');
CREATE TYPE estado_matricula  AS ENUM ('ACTIVA', 'RETIRADA', 'TRASLADADA');
CREATE TYPE desempeno         AS ENUM ('SUPERIOR', 'ALTO', 'BASICO', 'BAJO');          -- Decreto 1290/2009, art. 5
CREATE TYPE dimension_logro   AS ENUM ('COGNITIVA', 'PROCEDIMENTAL', 'ACTITUDINAL');
CREATE TYPE tipo_anotacion    AS ENUM ('ACADEMICA', 'DISCIPLINARIA', 'CONVIVENCIA', 'FELICITACION', 'COMPROMISO');
CREATE TYPE situacion_ley1620 AS ENUM ('TIPO_I', 'TIPO_II', 'TIPO_III');               -- Ley 1620/2013

-- ---------------------------------------------------------------------
--  Funciones utilitarias
-- ---------------------------------------------------------------------
CREATE FUNCTION app_institution_id() RETURNS uuid
  LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.institution_id', true), '')::uuid $$;

CREATE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE FUNCTION fn_touch_updated_at() RETURNS trigger
  LANGUAGE plpgsql AS
$$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- =====================================================================
--  1. INSTITUTIONS · el tenant
-- =====================================================================
CREATE TABLE institutions (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre            varchar(160) NOT NULL,
  slug              varchar(60)  NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  codigo_dane       char(12)     NOT NULL UNIQUE CHECK (codigo_dane ~ '^[0-9]{12}$'),
  nit               varchar(15),
  municipio         varchar(80)  NOT NULL,
  departamento      varchar(80)  NOT NULL,
  direccion         varchar(160),
  telefono          varchar(30),
  resolucion        varchar(200),                -- "Aprobado por Resolución N.° ..." (membrete del boletín)
  logo_url          text,
  escala_min        numeric(3,2) NOT NULL DEFAULT 1.00,
  escala_max        numeric(3,2) NOT NULL DEFAULT 5.00,
  nota_aprobatoria  numeric(3,2) NOT NULL DEFAULT 3.00,
  decimales_nota    smallint     NOT NULL DEFAULT 1 CHECK (decimales_nota IN (1, 2)),
  activo            boolean      NOT NULL DEFAULT true,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT institutions_escala_chk CHECK (
    escala_min >= 0
    AND escala_min < escala_max
    AND nota_aprobatoria > escala_min
    AND nota_aprobatoria <= escala_max
  )
);
CREATE INDEX institutions_busqueda_trgm ON institutions USING gin (lower(nombre || ' ' || municipio) gin_trgm_ops);
CREATE TRIGGER trg_institutions_touch BEFORE UPDATE ON institutions
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- =====================================================================
--  2. USERS · documento único por colegio
-- =====================================================================
CREATE TABLE users (
  id                     uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id         uuid           NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  tipo_documento         tipo_documento NOT NULL DEFAULT 'CC',
  documento_identidad    varchar(20)    NOT NULL CHECK (documento_identidad ~ '^[0-9A-Za-z-]{4,20}$'),
  nombres                varchar(80)    NOT NULL,
  apellidos              varchar(80)    NOT NULL,
  nombre_completo        varchar(161)   GENERATED ALWAYS AS (apellidos || ' ' || nombres) STORED,
  email                  varchar(160)   CHECK (email IS NULL OR email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefono               varchar(20),
  password_hash          text           NOT NULL,
  rol                    rol_usuario    NOT NULL,
  activo                 boolean        NOT NULL DEFAULT true,
  debe_cambiar_password  boolean        NOT NULL DEFAULT true,
  ultimo_acceso_at       timestamptz,
  created_at             timestamptz    NOT NULL DEFAULT now(),
  updated_at             timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT users_documento_uq UNIQUE (institution_id, documento_identidad),
  CONSTRAINT users_tenant_uq    UNIQUE (institution_id, id)
);
CREATE UNIQUE INDEX users_email_uq      ON users (institution_id, lower(email)) WHERE email IS NOT NULL;
CREATE INDEX        users_rol_idx       ON users (institution_id, rol) WHERE activo;
CREATE INDEX        users_nombre_trgm   ON users USING gin (lower(nombre_completo) gin_trgm_ops);
CREATE TRIGGER trg_users_touch BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- Verifica que un usuario referenciado tenga uno de los roles esperados.
CREATE FUNCTION fn_assert_rol(p_user uuid, p_roles rol_usuario[], p_campo text) RETURNS void
  LANGUAGE plpgsql STABLE AS
$$
BEGIN
  IF p_user IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user AND rol = ANY (p_roles)) THEN
    RAISE EXCEPTION '% debe ser un usuario con rol %', p_campo, p_roles
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;

-- =====================================================================
--  3. PERFORMANCE_LEVELS · escala de desempeños del SIEE de cada colegio
--     Los rangos no pueden solaparse. La nota se redondea a
--     `institutions.decimales_nota` antes de ubicarla (3.55 → 3.6).
-- =====================================================================
CREATE TABLE performance_levels (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid         NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  desempeno       desempeno    NOT NULL,
  nota_desde      numeric(3,2) NOT NULL,
  nota_hasta      numeric(3,2) NOT NULL,
  CHECK (nota_desde <= nota_hasta),
  CONSTRAINT performance_levels_uq UNIQUE (institution_id, desempeno),
  CONSTRAINT performance_levels_sin_solape EXCLUDE USING gist (
    institution_id WITH =,
    numrange(nota_desde, nota_hasta, '[]') WITH &&
  )
);

CREATE FUNCTION fn_desempeno(p_institution uuid, p_nota numeric) RETURNS desempeno
  LANGUAGE sql STABLE AS
$$
  SELECT pl.desempeno
    FROM performance_levels pl
    JOIN institutions i ON i.id = pl.institution_id
   WHERE pl.institution_id = p_institution
     AND round(p_nota, i.decimales_nota) BETWEEN pl.nota_desde AND pl.nota_hasta
$$;

-- =====================================================================
--  4. ACADEMIC_YEARS · un solo año activo por colegio
-- =====================================================================
CREATE TABLE academic_years (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid        NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  anio            smallint    NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
  fecha_inicio    date,
  fecha_fin       date,
  activo          boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (fecha_inicio IS NULL OR fecha_fin IS NULL OR fecha_fin > fecha_inicio),
  CONSTRAINT academic_years_anio_uq   UNIQUE (institution_id, anio),
  CONSTRAINT academic_years_tenant_uq UNIQUE (institution_id, id)
);
CREATE UNIQUE INDEX academic_years_un_activo ON academic_years (institution_id) WHERE activo;

-- =====================================================================
--  5. PERIODS · porcentajes ≤ 100 por año, fechas sin solape
-- =====================================================================
CREATE TABLE periods (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id      uuid         NOT NULL,
  academic_year_id    uuid         NOT NULL,
  numero              smallint     NOT NULL CHECK (numero BETWEEN 1 AND 6),
  nombre              varchar(40)  NOT NULL,
  porcentaje          numeric(5,2) NOT NULL CHECK (porcentaje > 0 AND porcentaje <= 100),
  fecha_inicio        date         NOT NULL,
  fecha_fin           date         NOT NULL,
  fecha_limite_notas  date,                         -- plazo para docentes (dashboard de pendientes)
  cerrado             boolean      NOT NULL DEFAULT false,
  cerrado_at          timestamptz,
  cerrado_por         uuid,
  CHECK (fecha_fin >= fecha_inicio),
  CHECK (cerrado = (cerrado_at IS NOT NULL)),
  CONSTRAINT periods_numero_uq UNIQUE (academic_year_id, numero),
  CONSTRAINT periods_tenant_uq UNIQUE (institution_id, id),
  FOREIGN KEY (institution_id, academic_year_id) REFERENCES academic_years (institution_id, id) ON DELETE CASCADE,
  FOREIGN KEY (institution_id, cerrado_por)      REFERENCES users (institution_id, id),
  CONSTRAINT periods_fechas_sin_solape EXCLUDE USING gist (
    academic_year_id WITH =,
    daterange(fecha_inicio, fecha_fin, '[]') WITH &&
  )
);

CREATE FUNCTION fn_periods_porcentaje() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE v_total numeric;
BEGIN
  SELECT coalesce(sum(porcentaje), 0) INTO v_total
    FROM periods WHERE academic_year_id = NEW.academic_year_id;
  IF v_total > 100 THEN
    RAISE EXCEPTION 'Los periodos del año suman % %% (máximo 100 %%)', v_total
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END
$$;
CREATE CONSTRAINT TRIGGER trg_periods_porcentaje
  AFTER INSERT OR UPDATE OF porcentaje, academic_year_id ON periods
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION fn_periods_porcentaje();

-- Lanza error si el periodo está cerrado. Se usa en todas las tablas de calificación.
CREATE FUNCTION fn_assert_periodo_abierto(p_period uuid) RETURNS void
  LANGUAGE plpgsql STABLE AS
$$
DECLARE v_nombre text; v_cerrado boolean;
BEGIN
  SELECT nombre, cerrado INTO v_nombre, v_cerrado FROM periods WHERE id = p_period;
  IF v_cerrado THEN
    RAISE EXCEPTION 'El periodo "%" está cerrado: no admite cambios', v_nombre
      USING ERRCODE = 'P0001', HINT = 'PERIODO_CERRADO';
  END IF;
END
$$;

-- =====================================================================
--  6. GRADE_LEVELS y GROUPS · grados (fijos) y grupos (por año lectivo)
-- =====================================================================
CREATE TABLE grade_levels (
  id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid            NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  codigo          smallint        NOT NULL CHECK (codigo BETWEEN -2 AND 13),  -- -2 prejardín … 11, 12-13 ciclos
  nombre          varchar(30)     NOT NULL,                                   -- "6°", "Transición"
  nivel           nivel_educativo NOT NULL,
  CONSTRAINT grade_levels_codigo_uq UNIQUE (institution_id, codigo),
  CONSTRAINT grade_levels_tenant_uq UNIQUE (institution_id, id)
);

CREATE TABLE groups (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    uuid        NOT NULL,
  academic_year_id  uuid        NOT NULL,
  grade_level_id    uuid        NOT NULL,
  codigo            varchar(10) NOT NULL,                    -- "6-01"
  jornada           jornada     NOT NULL DEFAULT 'UNICA',
  director_id       uuid,
  capacidad         smallint    CHECK (capacidad BETWEEN 1 AND 60),
  CONSTRAINT groups_codigo_uq    UNIQUE (academic_year_id, codigo),
  CONSTRAINT groups_tenant_uq    UNIQUE (institution_id, id),
  CONSTRAINT groups_tenant_yr_uq UNIQUE (institution_id, academic_year_id, id),  -- destino de FK de matrículas
  FOREIGN KEY (institution_id, academic_year_id) REFERENCES academic_years (institution_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (institution_id, grade_level_id)   REFERENCES grade_levels (institution_id, id)   ON DELETE RESTRICT,
  FOREIGN KEY (institution_id, director_id)      REFERENCES users (institution_id, id)          ON DELETE SET NULL (director_id)
);
CREATE INDEX groups_grado_idx    ON groups (grade_level_id);
CREATE INDEX groups_director_idx ON groups (director_id) WHERE director_id IS NOT NULL;

-- =====================================================================
--  7. AREAS, SUBJECTS y TEACHER_ASSIGNMENTS · carga académica
-- =====================================================================
CREATE TABLE areas (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid         NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  nombre          varchar(120) NOT NULL,                     -- áreas obligatorias, Ley 115 art. 23
  orden           smallint     NOT NULL DEFAULT 0,
  CONSTRAINT areas_tenant_uq UNIQUE (institution_id, id)
);
CREATE UNIQUE INDEX areas_nombre_uq ON areas (institution_id, lower(nombre));

CREATE TABLE subjects (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid         NOT NULL,
  area_id         uuid         NOT NULL,
  nombre          varchar(100) NOT NULL,
  abreviatura     varchar(8)   NOT NULL,
  activo          boolean      NOT NULL DEFAULT true,
  CONSTRAINT subjects_tenant_uq UNIQUE (institution_id, id),
  FOREIGN KEY (institution_id, area_id) REFERENCES areas (institution_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX subjects_nombre_uq ON subjects (institution_id, lower(nombre));
CREATE INDEX        subjects_area_idx  ON subjects (area_id);

CREATE TABLE teacher_assignments (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id      uuid        NOT NULL,
  group_id            uuid        NOT NULL,
  subject_id          uuid        NOT NULL,
  teacher_id          uuid        NOT NULL,
  intensidad_horaria  smallint    NOT NULL CHECK (intensidad_horaria BETWEEN 1 AND 40),  -- horas/semana
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_assignments_uq        UNIQUE (group_id, subject_id),   -- un docente por materia y grupo
  CONSTRAINT teacher_assignments_tenant_uq UNIQUE (institution_id, id),
  FOREIGN KEY (institution_id, group_id)   REFERENCES groups (institution_id, id)   ON DELETE RESTRICT,
  FOREIGN KEY (institution_id, subject_id) REFERENCES subjects (institution_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (institution_id, teacher_id) REFERENCES users (institution_id, id)    ON DELETE RESTRICT
);
CREATE INDEX teacher_assignments_teacher_idx ON teacher_assignments (teacher_id);
CREATE INDEX teacher_assignments_subject_idx ON teacher_assignments (subject_id);

CREATE FUNCTION fn_teacher_assignments_validar() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  PERFORM fn_assert_rol(NEW.teacher_id, ARRAY['TEACHER', 'COORDINATOR']::rol_usuario[], 'teacher_id');
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_teacher_assignments_validar
  BEFORE INSERT OR UPDATE OF teacher_id ON teacher_assignments
  FOR EACH ROW EXECUTE FUNCTION fn_teacher_assignments_validar();

CREATE FUNCTION fn_groups_validar() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  PERFORM fn_assert_rol(NEW.director_id, ARRAY['TEACHER', 'COORDINATOR']::rol_usuario[], 'director_id');
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_groups_validar
  BEFORE INSERT OR UPDATE OF director_id ON groups
  FOR EACH ROW EXECUTE FUNCTION fn_groups_validar();

-- =====================================================================
--  8. ENROLLMENTS y STUDENT_GUARDIANS
--     Una matrícula por estudiante y año. La FK compuesta a groups
--     garantiza que el grupo pertenezca a ese mismo año lectivo.
--     Los acudientes se vinculan al ESTUDIANTE (no a la matrícula): la
--     relación sobrevive de un año a otro.
-- =====================================================================
CREATE TABLE enrollments (
  id                uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    uuid             NOT NULL,
  academic_year_id  uuid             NOT NULL,
  group_id          uuid             NOT NULL,
  student_id        uuid             NOT NULL,
  estado            estado_matricula NOT NULL DEFAULT 'ACTIVA',
  fecha_matricula   date             NOT NULL DEFAULT CURRENT_DATE,
  fecha_retiro      date,
  motivo_retiro     varchar(300),
  created_at        timestamptz      NOT NULL DEFAULT now(),
  updated_at        timestamptz      NOT NULL DEFAULT now(),
  CHECK ((estado = 'ACTIVA') = (fecha_retiro IS NULL)),
  CHECK (fecha_retiro IS NULL OR fecha_retiro >= fecha_matricula),
  CONSTRAINT enrollments_anio_uq       UNIQUE (student_id, academic_year_id),
  CONSTRAINT enrollments_tenant_uq     UNIQUE (institution_id, id),
  CONSTRAINT enrollments_student_uq    UNIQUE (institution_id, student_id, id),   -- destino de FK del observador
  FOREIGN KEY (institution_id, academic_year_id, group_id) REFERENCES groups (institution_id, academic_year_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (institution_id, student_id)                 REFERENCES users (institution_id, id)                    ON DELETE RESTRICT
);
CREATE INDEX enrollments_grupo_activas_idx ON enrollments (group_id) WHERE estado = 'ACTIVA';
CREATE INDEX enrollments_grupo_idx         ON enrollments (group_id);
CREATE TRIGGER trg_enrollments_touch BEFORE UPDATE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE FUNCTION fn_enrollments_validar() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  PERFORM fn_assert_rol(NEW.student_id, ARRAY['STUDENT']::rol_usuario[], 'student_id');
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_enrollments_validar
  BEFORE INSERT OR UPDATE OF student_id ON enrollments
  FOR EACH ROW EXECUTE FUNCTION fn_enrollments_validar();

CREATE TABLE student_guardians (
  institution_id   uuid        NOT NULL,
  student_id       uuid        NOT NULL,
  guardian_id      uuid        NOT NULL,
  parentesco       varchar(30) NOT NULL,                 -- Madre, Padre, Abuela, Tutor legal…
  es_principal     boolean     NOT NULL DEFAULT false,
  puede_ver_notas  boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, guardian_id),
  CHECK (student_id <> guardian_id),
  FOREIGN KEY (institution_id, student_id)  REFERENCES users (institution_id, id) ON DELETE CASCADE,
  FOREIGN KEY (institution_id, guardian_id) REFERENCES users (institution_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX student_guardians_principal_uq ON student_guardians (student_id) WHERE es_principal;
CREATE INDEX        student_guardians_guardian_idx ON student_guardians (guardian_id);

CREATE FUNCTION fn_student_guardians_validar() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  PERFORM fn_assert_rol(NEW.student_id,  ARRAY['STUDENT']::rol_usuario[],  'student_id');
  PERFORM fn_assert_rol(NEW.guardian_id, ARRAY['GUARDIAN']::rol_usuario[], 'guardian_id');
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_student_guardians_validar
  BEFORE INSERT OR UPDATE ON student_guardians
  FOR EACH ROW EXECUTE FUNCTION fn_student_guardians_validar();

-- =====================================================================
--  9. ACHIEVEMENTS · logros / indicadores de desempeño
--     Se configuran por periodo + asignatura + grado (todos los grupos de
--     6° comparten logros de Matemáticas). Cada logro pesa un porcentaje
--     de la nota del periodo; la suma por (periodo, asignatura, grado) ≤ 100.
-- =====================================================================
CREATE TABLE achievements (
  id              uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid            NOT NULL,
  period_id       uuid            NOT NULL,
  subject_id      uuid            NOT NULL,
  grade_level_id  uuid            NOT NULL,
  codigo          varchar(10)     NOT NULL,                 -- "L1", "L2"…
  descripcion     varchar(600)    NOT NULL CHECK (length(trim(descripcion)) >= 5),
  dimension       dimension_logro,
  porcentaje      numeric(5,2)    NOT NULL CHECK (porcentaje > 0 AND porcentaje <= 100),
  orden           smallint        NOT NULL DEFAULT 1,
  created_by      uuid,
  created_at      timestamptz     NOT NULL DEFAULT now(),
  updated_at      timestamptz     NOT NULL DEFAULT now(),
  CONSTRAINT achievements_codigo_uq UNIQUE (period_id, subject_id, grade_level_id, codigo),
  CONSTRAINT achievements_tenant_uq UNIQUE (institution_id, id),
  FOREIGN KEY (institution_id, period_id)      REFERENCES periods (institution_id, id)      ON DELETE RESTRICT,
  FOREIGN KEY (institution_id, subject_id)     REFERENCES subjects (institution_id, id)     ON DELETE RESTRICT,
  FOREIGN KEY (institution_id, grade_level_id) REFERENCES grade_levels (institution_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (institution_id, created_by)     REFERENCES users (institution_id, id)        ON DELETE SET NULL (created_by)
);
CREATE INDEX achievements_planilla_idx ON achievements (period_id, subject_id, grade_level_id, orden);
CREATE TRIGGER trg_achievements_touch BEFORE UPDATE ON achievements
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE FUNCTION fn_achievements_validar() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN PERFORM fn_assert_periodo_abierto(OLD.period_id); END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  PERFORM fn_assert_periodo_abierto(NEW.period_id);
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_achievements_validar
  BEFORE INSERT OR UPDATE OR DELETE ON achievements
  FOR EACH ROW EXECUTE FUNCTION fn_achievements_validar();

CREATE FUNCTION fn_achievements_porcentaje() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE v_total numeric;
BEGIN
  SELECT coalesce(sum(porcentaje), 0) INTO v_total
    FROM achievements
   WHERE period_id = NEW.period_id AND subject_id = NEW.subject_id AND grade_level_id = NEW.grade_level_id;
  IF v_total > 100 THEN
    RAISE EXCEPTION 'Los logros de la asignatura suman % %% en el periodo (máximo 100 %%)', v_total
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END
$$;
CREATE CONSTRAINT TRIGGER trg_achievements_porcentaje
  AFTER INSERT OR UPDATE OF porcentaje, period_id, subject_id, grade_level_id ON achievements
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION fn_achievements_porcentaje();

-- Valida que una nota esté dentro de la escala del colegio y con los decimales permitidos.
CREATE FUNCTION fn_assert_nota_en_escala(p_institution uuid, p_nota numeric) RETURNS void
  LANGUAGE plpgsql STABLE AS
$$
DECLARE i institutions%ROWTYPE;
BEGIN
  IF p_nota IS NULL THEN RETURN; END IF;
  SELECT * INTO i FROM institutions WHERE id = p_institution;
  IF p_nota < i.escala_min OR p_nota > i.escala_max THEN
    RAISE EXCEPTION 'La nota % está fuera de la escala (% – %)', p_nota, i.escala_min, i.escala_max
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_nota <> round(p_nota, i.decimales_nota) THEN
    RAISE EXCEPTION 'La nota % tiene más de % decimal(es)', p_nota, i.decimales_nota
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;

-- =====================================================================
--  10. ACHIEVEMENT_SCORES · nota parcial de un estudiante en un logro
-- =====================================================================
CREATE TABLE achievement_scores (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid         NOT NULL,
  enrollment_id   uuid         NOT NULL,
  achievement_id  uuid         NOT NULL,
  nota            numeric(3,2) NOT NULL CHECK (nota >= 0),
  updated_by      uuid         NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT achievement_scores_uq UNIQUE (enrollment_id, achievement_id),
  FOREIGN KEY (institution_id, enrollment_id)  REFERENCES enrollments (institution_id, id)  ON DELETE CASCADE,
  FOREIGN KEY (institution_id, achievement_id) REFERENCES achievements (institution_id, id) ON DELETE CASCADE,
  FOREIGN KEY (institution_id, updated_by)     REFERENCES users (institution_id, id)
);
CREATE INDEX achievement_scores_logro_idx ON achievement_scores (achievement_id);
CREATE TRIGGER trg_achievement_scores_touch BEFORE UPDATE ON achievement_scores
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE FUNCTION fn_achievement_scores_validar() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE
  v_period uuid; v_logro_grado uuid; v_logro_anio uuid;
  v_mat_grado uuid; v_mat_anio uuid; v_mat_estado estado_matricula;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT period_id INTO v_period FROM achievements WHERE id = OLD.achievement_id;
    PERFORM fn_assert_periodo_abierto(v_period);
    RETURN OLD;
  END IF;

  SELECT a.period_id, a.grade_level_id, p.academic_year_id
    INTO v_period, v_logro_grado, v_logro_anio
    FROM achievements a JOIN periods p ON p.id = a.period_id
   WHERE a.id = NEW.achievement_id;

  SELECT g.grade_level_id, e.academic_year_id, e.estado
    INTO v_mat_grado, v_mat_anio, v_mat_estado
    FROM enrollments e JOIN groups g ON g.id = e.group_id
   WHERE e.id = NEW.enrollment_id;

  PERFORM fn_assert_periodo_abierto(v_period);
  PERFORM fn_assert_nota_en_escala(NEW.institution_id, NEW.nota);

  IF v_mat_grado IS DISTINCT FROM v_logro_grado OR v_mat_anio IS DISTINCT FROM v_logro_anio THEN
    RAISE EXCEPTION 'El logro no corresponde al grado/año de la matrícula' USING ERRCODE = 'check_violation';
  END IF;
  IF v_mat_estado <> 'ACTIVA' THEN
    RAISE EXCEPTION 'La matrícula no está activa' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_achievement_scores_validar
  BEFORE INSERT OR UPDATE OR DELETE ON achievement_scores
  FOR EACH ROW EXECUTE FUNCTION fn_achievement_scores_validar();

-- =====================================================================
--  11. GRADES · calificación del periodo (definitiva), fallas y observación
--     `nota` es NULL mientras falten notas parciales; la calcula el
--     servidor a partir de achievement_scores (o la digita el docente si
--     la asignatura no tiene logros configurados en el periodo).
-- =====================================================================
CREATE TABLE grades (
  id                     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id         uuid          NOT NULL,
  enrollment_id          uuid          NOT NULL,
  teacher_assignment_id  uuid          NOT NULL,
  period_id              uuid          NOT NULL,
  nota                   numeric(3,2)  CHECK (nota >= 0),
  fallas                 smallint      NOT NULL DEFAULT 0 CHECK (fallas BETWEEN 0 AND 500),
  fallas_justificadas    smallint      NOT NULL DEFAULT 0,
  observacion            varchar(1000),
  updated_by             uuid          NOT NULL,
  created_at             timestamptz   NOT NULL DEFAULT now(),
  updated_at             timestamptz   NOT NULL DEFAULT now(),
  CHECK (fallas_justificadas BETWEEN 0 AND fallas),
  CONSTRAINT grades_uq        UNIQUE (enrollment_id, teacher_assignment_id, period_id),
  CONSTRAINT grades_tenant_uq UNIQUE (institution_id, id),
  FOREIGN KEY (institution_id, enrollment_id)         REFERENCES enrollments (institution_id, id)         ON DELETE CASCADE,
  FOREIGN KEY (institution_id, teacher_assignment_id) REFERENCES teacher_assignments (institution_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (institution_id, period_id)             REFERENCES periods (institution_id, id)             ON DELETE RESTRICT,
  FOREIGN KEY (institution_id, updated_by)            REFERENCES users (institution_id, id)
);
CREATE INDEX grades_planilla_idx ON grades (teacher_assignment_id, period_id);
CREATE INDEX grades_boletin_idx  ON grades (enrollment_id, period_id);
CREATE INDEX grades_periodo_idx  ON grades (period_id) INCLUDE (nota);
CREATE TRIGGER trg_grades_touch BEFORE UPDATE ON grades
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE FUNCTION fn_grades_validar() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE
  v_mat_grupo uuid; v_mat_anio uuid; v_mat_estado estado_matricula;
  v_asig_grupo uuid; v_per_anio uuid;
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
CREATE TRIGGER trg_grades_validar
  BEFORE INSERT OR UPDATE OR DELETE ON grades
  FOR EACH ROW EXECUTE FUNCTION fn_grades_validar();

-- =====================================================================
--  12. STUDENT_OBSERVER · observador del estudiante
--     La FK (institution_id, student_id, enrollment_id) garantiza que la
--     matrícula sea del mismo estudiante. La firma del acudiente es un
--     acto registrado (quién, cuándo, desde qué IP), no una imagen.
-- =====================================================================
CREATE TABLE student_observer (
  id                       uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id           uuid              NOT NULL,
  student_id               uuid              NOT NULL,
  enrollment_id            uuid              NOT NULL,
  autor_id                 uuid              NOT NULL,
  fecha                    date              NOT NULL DEFAULT CURRENT_DATE,
  tipo                     tipo_anotacion    NOT NULL,
  situacion                situacion_ley1620,
  descripcion              varchar(4000)     NOT NULL CHECK (length(trim(descripcion)) >= 10),
  accion_pedagogica        varchar(2000),
  descargos                varchar(4000),
  descargos_at             timestamptz,
  acudiente_id             uuid,
  acudiente_confirmado_at  timestamptz,
  acudiente_ip             inet,
  created_at               timestamptz       NOT NULL DEFAULT now(),
  updated_at               timestamptz       NOT NULL DEFAULT now(),
  CHECK ((descargos IS NULL) = (descargos_at IS NULL)),
  CHECK ((acudiente_id IS NULL) = (acudiente_confirmado_at IS NULL)),
  CHECK (situacion IS NULL OR tipo IN ('DISCIPLINARIA', 'CONVIVENCIA')),
  FOREIGN KEY (institution_id, student_id, enrollment_id) REFERENCES enrollments (institution_id, student_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (institution_id, autor_id)                  REFERENCES users (institution_id, id)                  ON DELETE RESTRICT,
  FOREIGN KEY (institution_id, acudiente_id)              REFERENCES users (institution_id, id)                  ON DELETE RESTRICT
);
CREATE INDEX student_observer_estudiante_idx ON student_observer (student_id, fecha DESC);
CREATE INDEX student_observer_matricula_idx  ON student_observer (enrollment_id);
CREATE INDEX student_observer_pendientes_idx ON student_observer (institution_id) WHERE acudiente_id IS NULL;
CREATE TRIGGER trg_student_observer_touch BEFORE UPDATE ON student_observer
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

CREATE FUNCTION fn_student_observer_validar() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  IF NEW.acudiente_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.acudiente_id IS DISTINCT FROM NEW.acudiente_id)
     AND NOT EXISTS (SELECT 1 FROM student_guardians
                      WHERE student_id = NEW.student_id AND guardian_id = NEW.acudiente_id) THEN
    RAISE EXCEPTION 'Solo un acudiente registrado del estudiante puede firmar la anotación'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_student_observer_validar
  BEFORE INSERT OR UPDATE OF acudiente_id ON student_observer
  FOR EACH ROW EXECUTE FUNCTION fn_student_observer_validar();

-- =====================================================================
--  13. AUDIT_LOG · historial inmutable de cambios
--     El actor sale de `app.user_id`. A la aplicación se le concede solo
--     INSERT/SELECT sobre esta tabla (ver permisos al final).
-- =====================================================================
CREATE TABLE audit_log (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  institution_id  uuid        NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  tabla           text        NOT NULL,
  registro_id     uuid        NOT NULL,
  accion          char(1)     NOT NULL CHECK (accion IN ('I', 'U', 'D')),
  actor_id        uuid,
  antes           jsonb,
  despues         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_registro_idx ON audit_log (institution_id, tabla, registro_id, created_at DESC);

CREATE FUNCTION fn_audit() RETURNS trigger
  LANGUAGE plpgsql AS
$$
DECLARE
  v_antes   jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_despues jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
BEGIN
  IF TG_OP = 'UPDATE' AND (v_antes - 'updated_at') = (v_despues - 'updated_at') THEN
    RETURN NULL;  -- guardado sin cambios reales: no ensuciar el historial
  END IF;
  INSERT INTO audit_log (institution_id, tabla, registro_id, accion, actor_id, antes, despues)
  VALUES (coalesce(NEW.institution_id, OLD.institution_id), TG_TABLE_NAME,
          coalesce(NEW.id, OLD.id), left(TG_OP, 1), app_user_id(), v_antes, v_despues);
  RETURN NULL;
END
$$;

CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON grades              FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON achievement_scores  FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON achievements        FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON periods             FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON teacher_assignments FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON enrollments         FOR EACH ROW EXECUTE FUNCTION fn_audit();
CREATE TRIGGER trg_audit AFTER INSERT OR UPDATE OR DELETE ON student_observer    FOR EACH ROW EXECUTE FUNCTION fn_audit();

-- =====================================================================
--  14. VISTAS de reporte (security_invoker: respetan RLS del que consulta)
-- =====================================================================

-- Calificación del periodo con su desempeño, lista para boletín y dashboard.
CREATE VIEW v_grades_detail WITH (security_invoker = true) AS
SELECT
  g.id                   AS grade_id,
  g.institution_id,
  g.period_id,
  g.enrollment_id,
  e.student_id,
  ta.group_id,
  ta.subject_id,
  ta.teacher_id,
  g.nota,
  fn_desempeno(g.institution_id, g.nota) AS desempeno,
  (g.nota IS NOT NULL AND g.nota < i.nota_aprobatoria) AS reprobada,
  g.fallas,
  g.fallas_justificadas,
  g.observacion,
  g.updated_at
FROM grades g
JOIN enrollments e          ON e.id = g.enrollment_id
JOIN teacher_assignments ta ON ta.id = g.teacher_assignment_id
JOIN institutions i         ON i.id = g.institution_id;

-- Avance de digitación por asignación y periodo (dashboard: docentes pendientes).
CREATE VIEW v_assignment_progress WITH (security_invoker = true) AS
SELECT
  ta.institution_id,
  ta.id                                  AS teacher_assignment_id,
  ta.teacher_id,
  ta.group_id,
  ta.subject_id,
  p.id                                   AS period_id,
  p.cerrado                              AS periodo_cerrado,
  count(e.id)                            AS estudiantes,
  count(gr.nota)                         AS con_nota,
  count(e.id) - count(gr.nota)           AS pendientes
FROM teacher_assignments ta
JOIN groups gp       ON gp.id = ta.group_id
JOIN periods p       ON p.academic_year_id = gp.academic_year_id
LEFT JOIN enrollments e ON e.group_id = ta.group_id AND e.estado = 'ACTIVA'
LEFT JOIN grades gr  ON gr.enrollment_id = e.id
                    AND gr.teacher_assignment_id = ta.id
                    AND gr.period_id = p.id
GROUP BY ta.institution_id, ta.id, ta.teacher_id, ta.group_id, ta.subject_id, p.id, p.cerrado;

-- =====================================================================
--  15. ROW LEVEL SECURITY · segunda barrera de aislamiento entre colegios
--     Aplica al rol de la aplicación (no dueño de las tablas). Si
--     `app.institution_id` no está fijado, no se ve ninguna fila.
--     `institutions` queda fuera: el selector de colegio la consulta antes
--     de que exista sesión.
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'performance_levels', 'academic_years', 'periods', 'grade_levels', 'groups',
    'areas', 'subjects', 'teacher_assignments', 'enrollments', 'student_guardians',
    'achievements', 'achievement_scores', 'grades', 'student_observer', 'audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (institution_id = app_institution_id())
         WITH CHECK (institution_id = app_institution_id())', t);
  END LOOP;
END
$$;

COMMIT;

-- =====================================================================
--  Permisos del rol de la aplicación (ejecutar como superusuario, una vez).
--  El rol dueño de las tablas (migraciones) NO debe ser el que usa la app,
--  porque el dueño se salta RLS.
-- =====================================================================
-- CREATE ROLE kora_app LOGIN PASSWORD '***';
-- GRANT USAGE ON SCHEMA public TO kora_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kora_app;
-- REVOKE UPDATE, DELETE ON audit_log FROM kora_app;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO kora_app;
