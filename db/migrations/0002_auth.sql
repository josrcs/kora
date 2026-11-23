-- =====================================================================
--  0002 · Autenticación
--  - Versión de sesión por usuario: al cambiar la contraseña (o al
--    desactivar la cuenta) se invalidan todas las sesiones abiertas.
--  - Registro de intentos de ingreso para bloqueo por fuerza bruta.
--  - Búsqueda de colegios sin tildes ("bolivar" encuentra "Bolívar").
-- =====================================================================

BEGIN;

ALTER TABLE users ADD COLUMN sesion_version integer NOT NULL DEFAULT 1;

-- Texto normalizado para el selector de institución (minúsculas, sin tildes).
ALTER TABLE institutions ADD COLUMN busqueda text GENERATED ALWAYS AS (
  translate(lower(nombre || ' ' || municipio || ' ' || departamento), 'áéíóúüñ', 'aeiouun')
) STORED;
DROP INDEX institutions_busqueda_trgm;
CREATE INDEX institutions_busqueda_trgm ON institutions USING gin (busqueda gin_trgm_ops);

-- ---------------------------------------------------------------------
--  login_attempts: un registro por intento (exitoso o no).
--  Sin RLS a propósito: el límite por IP debe contar intentos contra
--  TODOS los colegios, o un atacante rotaría de colegio para evadirlo.
--  No contiene contraseñas; se puede purgar lo mayor a 90 días.
-- ---------------------------------------------------------------------
CREATE TABLE login_attempts (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  institution_id  uuid        NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  documento       varchar(20) NOT NULL,
  user_id         uuid        REFERENCES users(id) ON DELETE CASCADE,   -- NULL si el documento no existe
  ip              inet,
  exitoso         boolean     NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_documento_idx ON login_attempts (institution_id, documento, created_at DESC);
CREATE INDEX login_attempts_ip_idx        ON login_attempts (ip, created_at DESC) WHERE NOT exitoso;

COMMIT;

-- Permisos del rol de la aplicación:
-- GRANT SELECT, INSERT ON login_attempts TO kora_app;
