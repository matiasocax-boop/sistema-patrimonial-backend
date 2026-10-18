-- ============================================================================
-- MIGRACIÓN 001: Esquema inicial robusto para Sistema Patrimonial UNP
-- ============================================================================
-- Ejecutar en el SQL Editor de Supabase (PostgreSQL).
-- ============================================================================

-- Tabla de configuración global (modo mantenimiento, versión, etc.)
CREATE TABLE IF NOT EXISTS app_config (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para búsquedas frecuentes y rendimiento
CREATE INDEX IF NOT EXISTS idx_bens_dependencia ON bens ((data->>'dependencia'));
CREATE INDEX IF NOT EXISTS idx_bens_estado ON bens ((data->>'estadoConservacion'));
CREATE INDEX IF NOT EXISTS idx_bens_rotulo ON bens ((data->>'rotulo'));
CREATE INDEX IF NOT EXISTS idx_bens_funcionario ON bens ((data->>'funcionario'));
CREATE INDEX IF NOT EXISTS idx_bens_updated_at ON bens ((data->>'updated_at'));

CREATE INDEX IF NOT EXISTS idx_fc10_bienid ON fc10 ((data->>'bienId'));
CREATE INDEX IF NOT EXISTS idx_fc10_estadofirma ON fc10 ((data->>'estadoFirma'));
CREATE INDEX IF NOT EXISTS idx_fc10_fecha ON fc10 ((data->>'entregadoFecha'));

CREATE INDEX IF NOT EXISTS idx_fc11_bienid ON fc11 ((data->>'bienId'));
CREATE INDEX IF NOT EXISTS idx_fc11_fecha ON fc11 ((data->>'fecha'));

CREATE INDEX IF NOT EXISTS idx_fc04_bienid ON fc04 ((data->>'bienId'));

CREATE INDEX IF NOT EXISTS idx_usuarios_cargo ON usuarios (cargo);
CREATE INDEX IF NOT EXISTS idx_usuarios_dependencia ON usuarios (dependencia);

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario ON notificaciones ((data->>'usuarioDestino'));
CREATE INDEX IF NOT EXISTS idx_notificaciones_leido ON notificaciones ((data->>'leido'));
CREATE INDEX IF NOT EXISTS idx_notificaciones_fecha ON notificaciones ((data->>'fecha'));

CREATE INDEX IF NOT EXISTS idx_auditoria_accion ON auditoria (accion);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria (fecha);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria (usuarioDestino);

-- Comentarios para documentación del esquema
COMMENT ON TABLE app_config IS 'Configuración global del sistema (modo mantenimiento, versión, avisos).';
COMMENT ON COLUMN app_config.data IS 'Contenido JSON de la configuración.';

-- ============================================================================
-- SUGERENCIAS DE ENCRITACIÓN DE DATOS SENSIBLES
-- ============================================================================
-- 1. Contraseñas: ya se almacenan hasheadas con bcrypt (12 rondas) en `usuarios.password`.
--    Nunca almacenar contraseñas en texto plano.
-- 2. Datos sensibles (CI, nombres, cargos): considerar pgcrypto para cifrar a nivel
--    de columna si la normativa lo exige:
--      CREATE EXTENSION IF NOT EXISTS pgcrypto;
--      ALTER TABLE usuarios ADD COLUMN nombre_cifrado bytea;
--      UPDATE usuarios SET nombre_cifrado = encrypt(nombre::bytea, 'clave', 'aes');
--    Nota: el cifrado a nivel de aplicación (antes de enviar a Supabase) es preferible
--    para no exponer claves de cifrado en la base de datos.
-- 3. Columnas JSONB (`data`) no se cifran nativamente por Supabase en el plan free;
--    si se requiere cifrado de campos sensibles dentro de JSON, cifrar antes de serializar
--    en el frontend/backend con una clave gestionada por KMS o variable de entorno.
