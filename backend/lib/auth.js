/**
 * ============================================================================
 * AUTENTICACIÓN DEL BACKEND - lógica pura y testeable
 * ============================================================================
 * Se separa de `server.js` para poder probar el flujo de login sin levantar
 * Express ni conectar a Postgres: `autenticarUsuario` recibe el pool como
 * parámetro, así que en los tests se le pasa un objeto falso.
 *
 * Reglas:
 *   - El nombre de usuario se normaliza (trim, minúsculas, sin espacios de más)
 *     y se acota en longitud para no mandar basura a la consulta.
 *   - La contraseña se exige como string y se acota en longitud.
 *   - Solo se aceptan hashes bcrypt reales: si un usuario tiene la contraseña en
 *     texto plano (migración incompleta) se rechaza en vez de comparar en claro.
 *   - Los errores al cliente son siempre genéricos ("Credenciales incorrectas")
 *     para no revelar si el usuario existe.
 * ========================================================================== */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { esHashBcrypt } = require('./helpers');

const LIMITE_USUARIO = 64;
const LIMITE_PASSWORD = 200;
const VENCIMIENTO_TOKEN = '24h';

/** Normaliza un nombre de usuario para la comparación y la consulta. */
function normalizarNombreUsuario(valor) {
  if (typeof valor !== 'string') return '';
  return valor.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, LIMITE_USUARIO);
}

/**
 * Valida y normaliza el cuerpo de /api/login.
 * @returns {{ok: boolean, username?: string, password?: string, error?: string}}
 */
function validarEntradaLogin(cuerpo) {
  const username = normalizarNombreUsuario(cuerpo?.username);
  const password = typeof cuerpo?.password === 'string' ? cuerpo.password : '';
  if (!username) return { ok: false, error: 'Usuario requerido' };
  if (!password) return { ok: false, error: 'Contraseña requerida' };
  if (password.length > LIMITE_PASSWORD) return { ok: false, error: 'Contraseña demasiado larga' };
  return { ok: true, username, password };
}

/**
 * Comprueba las credenciales contra la tabla `usuarios` y firma un JWT.
 *
 * @param {object} pool  cliente de pg (se usa pool.query)
 * @param {{username: string, password: string}} credenciales ya validadas
 * @param {string} secretKey
 * @returns {Promise<{ok: boolean, token?: string, user?: object, error?: string}>}
 */
async function autenticarUsuario(pool, credenciales, secretKey) {
  const { username, password } = credenciales;
  const result = await pool.query(
    'SELECT username, nombre, password, cargo FROM usuarios WHERE username = $1',
    [username]
  );
  if (result.rows.length === 0) {
    return { ok: false, error: 'Credenciales incorrectas' };
  }

  const user = result.rows[0];
  // Contraseña no hasheada (migración incompleta): nunca se compara en claro.
  if (!esHashBcrypt(user.password)) {
    return { ok: false, error: 'Credenciales incorrectas' };
  }

  const coincide = await bcrypt.compare(password, user.password);
  if (!coincide) {
    return { ok: false, error: 'Credenciales incorrectas' };
  }

  const token = jwt.sign(
    { username: user.username, role: user.cargo },
    secretKey,
    { expiresIn: VENCIMIENTO_TOKEN }
  );

  return {
    ok: true,
    token,
    user: { username: user.username, nombre: user.nombre, role: user.cargo }
  };
}

module.exports = {
  normalizarNombreUsuario,
  validarEntradaLogin,
  autenticarUsuario,
  LIMITE_USUARIO,
  LIMITE_PASSWORD,
  VENCIMIENTO_TOKEN
};
