/**
 * backend/test/authz.test.js
 * Pruebas del middleware de autorización por rol.
 * Ejecutar con: node --test test/authz.test.js
 */

const assert = require('node:assert/strict');
const { exigirAdmin, exigirPrivilegio, ROLES_ADMIN } = require('../lib/authz.js');

function mockRes() {
  let estado = null;
  let cuerpo = null;
  const res = {
    status(code) { estado = code; return this; },
    json(body) { cuerpo = body; return this; }
  };
  return { res, get estado() { return estado; }, get cuerpo() { return cuerpo; } };
}

console.log('=== Pruebas de autorización ===');

// 1. ROLES_ADMIN contiene los roles esperados
{
  assert.ok(ROLES_ADMIN.has('admin'), 'admin es rol autorizado');
  assert.ok(ROLES_ADMIN.has('dev'), 'dev es rol autorizado');
  assert.ok(ROLES_ADMIN.has('desarrollador'), 'desarrollador es rol autorizado');
  assert.ok(!ROLES_ADMIN.has('funcionario'), 'funcionario NO es rol autorizado para admin');
  console.log('✅ ROLES_ADMIN correcto');
}

// 2. exigirAdmin permite admin
{
  let llamado = false;
  const req = { user: { role: 'admin', username: 'admin' } };
  const m = mockRes();
  exigirAdmin(req, m.res, () => { llamado = true; });
  assert.ok(llamado, 'admin debe pasar exigirAdmin');
  console.log('✅ admin pasa exigirAdmin');
}

// 3. exigirAdmin permite dev
{
  let llamado = false;
  const req = { user: { role: 'dev', username: 'dev' } };
  const m = mockRes();
  exigirAdmin(req, m.res, () => { llamado = true; });
  assert.ok(llamado, 'dev debe pasar exigirAdmin');
  console.log('✅ dev pasa exigirAdmin');
}

// 4. exigirAdmin rechaza funcionario
{
  const req = { user: { role: 'funcionario', username: 'func' } };
  const m = mockRes();
  exigirAdmin(req, m.res, () => {});
  assert.strictEqual(m.estado, 403, 'funcionario debe recibir 403');
  assert.ok(m.cuerpo.error, 'Debe incluir mensaje de error');
  console.log('✅ funcionario es rechazado por exigirAdmin');
}

// 5. exigirAdmin rechaza sin rol
{
  const req = { user: {} };
  const m = mockRes();
  exigirAdmin(req, m.res, () => {});
  assert.strictEqual(m.estado, 403, 'sin rol debe recibir 403');
  console.log('✅ sin rol es rechazado por exigirAdmin');
}

// 6. exigirPrivilegio permite admin y dev
{
  for (const role of ['admin', 'dev', 'desarrollador']) {
    let llamado = false;
    const req = { user: { role } };
    const m = mockRes();
    exigirPrivilegio(req, m.res, () => { llamado = true; });
    assert.ok(llamado, `${role} debe pasar exigirPrivilegio`);
  }
  console.log('✅ admin/dev/desarrollador pasan exigirPrivilegio');
}

// 7. exigirPrivilegio rechaza funcionario
{
  const req = { user: { role: 'funcionario' } };
  const m = mockRes();
  exigirPrivilegio(req, m.res, () => {});
  assert.strictEqual(m.estado, 403, 'funcionario debe recibir 403 en exigirPrivilegio');
  console.log('✅ funcionario es rechazado por exigirPrivilegio');
}

console.log('\n✅ Todas las pruebas de autorización pasaron.');
