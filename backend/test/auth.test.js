const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {
  normalizarNombreUsuario, validarEntradaLogin, autenticarUsuario
} = require('../lib/auth');

const SECRETO = 'secreto-de-prueba';

test('normalizarNombreUsuario recorta, pasa a minúsculas y acota', () => {
  assert.equal(normalizarNombreUsuario('  Admin  '), 'admin');
  assert.equal(normalizarNombreUsuario('A  B'), 'a b');
  assert.equal(normalizarNombreUsuario('a'.repeat(500)).length, 64);
  assert.equal(normalizarNombreUsuario(null), '');
  assert.equal(normalizarNombreUsuario(123), '');
});

test('validarEntradaLogin rechaza cuerpos vacíos o no-string', () => {
  assert.equal(validarEntradaLogin(null).ok, false);
  assert.equal(validarEntradaLogin({}).ok, false);
  assert.equal(validarEntradaLogin({ username: '   ', password: 'x' }).ok, false);
  assert.equal(validarEntradaLogin({ username: 'admin', password: '' }).ok, false);
  assert.equal(validarEntradaLogin({ username: 'admin', password: 12345 }).ok, false);
  assert.equal(validarEntradaLogin({ username: 'admin', password: 'x'.repeat(300) }).ok, false);

  const ok = validarEntradaLogin({ username: '  Admin ', password: 'secreto' });
  assert.equal(ok.ok, true);
  assert.equal(ok.username, 'admin');
  assert.equal(ok.password, 'secreto');
});

/** Pool falso: devuelve las filas que se le indiquen. */
const poolFalso = (rows) => ({ query: async () => ({ rows }) });

test('autenticarUsuario rechaza usuario inexistente con error genérico', async () => {
  const r = await autenticarUsuario(poolFalso([]), { username: 'nadie', password: 'x' }, SECRETO);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Credenciales incorrectas');
  assert.equal(r.token, undefined);
});

test('autenticarUsuario nunca acepta contraseña en texto plano', async () => {
  const r = await autenticarUsuario(
    poolFalso([{ username: 'admin', nombre: 'Admin', password: 'secreto-plano', cargo: 'admin' }]),
    { username: 'admin', password: 'secreto-plano' },
    SECRETO
  );
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Credenciales incorrectas');
});

test('autenticarUsuario rechaza una contraseña equivocada', async () => {
  const hash = bcrypt.hashSync('correcta', 4);
  const r = await autenticarUsuario(
    poolFalso([{ username: 'admin', nombre: 'Admin', password: hash, cargo: 'admin' }]),
    { username: 'admin', password: 'incorrecta' },
    SECRETO
  );
  assert.equal(r.ok, false);
});

test('autenticarUsuario firma un JWT válido con las credenciales correctas', async () => {
  const hash = bcrypt.hashSync('secreto', 4);
  const r = await autenticarUsuario(
    poolFalso([{ username: 'admin', nombre: 'Admin General', password: hash, cargo: 'admin' }]),
    { username: 'admin', password: 'secreto' },
    SECRETO
  );
  assert.equal(r.ok, true);
  assert.equal(r.user.username, 'admin');
  assert.equal(r.user.role, 'admin');
  assert.equal(typeof r.token, 'string');

  const decodificado = jwt.verify(r.token, SECRETO);
  assert.equal(decodificado.username, 'admin');
  assert.equal(decodificado.role, 'admin');
});
