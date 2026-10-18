/**
 * backend/lib/authz.js
 * ============================================================================
 * MIDDLEWARE DE AUTORIZACIÓN POR ROL
 * ============================================================================
 *
 * Protege endpoints sensibles para que solo roles autorizados puedan
 * ejecutar acciones críticas (cambiar estado de firmas FC-10, respaldos,
 * mantenimiento, usuarios, etc.).
 *
 * Roles válidos (según backend/lib/helpers.js: esPrivilegiado):
 *   - 'admin'   : Administrador general
 *   - 'dev' / 'desarrollador' : Desarrollador del sistema
 *   - 'funcionario' : Usuario de operación (solo lectura en la mayoría)
 * ============================================================================ */

const { esPrivilegiado } = require('./helpers');

// Roles que pueden modificar el estado de firmas de FC-10 manualmente.
// Según requerimiento: SOLO el usuario administrador (rol 'admin' o 'dev').
const ROLES_ADMIN = new Set(['admin', 'dev', 'desarrollador']);

/**
 * Middleware: requiere rol privilegiado (admin / dev).
 * Uso: app.use('/api/algo', autenticar, exigirPrivilegio);
 */
function exigirPrivilegio(req, res, next) {
  if (!esPrivilegiado(req.user?.role)) {
    return res.status(403).json({ error: 'Permiso denegado: se requiere rol de administrador o desarrollador.' });
  }
  next();
}

/**
 * Middleware: requiere rol específicamente ADMIN (no incluye 'funcionario').
 * Para el cambio manual de estado de firmas FC-10.
 */
function exigirAdmin(req, res, next) {
  const role = req.user?.role;
  if (!ROLES_ADMIN.has(role)) {
    return res.status(403).json({ error: 'Permiso denegado: solo el administrador puede cambiar el estado de firmas.' });
  }
  next();
}

/**
 * Middleware genérico: permite una lista de roles.
 * @param {string[]} rolesPermitidos
 */
function permitirRoles(rolesPermitidos) {
  const set = new Set(rolesPermitidos);
  return (req, res, next) => {
    if (!set.has(req.user?.role)) {
      return res.status(403).json({ error: 'Permiso denegado: rol insuficiente.' });
    }
    next();
  };
}

module.exports = { exigirPrivilegio, exigirAdmin, permitirRoles, ROLES_ADMIN };
