/**
 * backend/test/respaldo.test.js
 * Pruebas del sistema de respaldo y restauración JSON.
 * Ejecutar con: node --test test/respaldo.test.js
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  validarEsquemaRespaldo,
  armarRespaldo,
  ORDEN_RESTAURACION,
  TABLAS_CONOCIDAS,
  VERSION_RESPALDO
} = require('../lib/respaldo.js');

function hacerChecksum(metadata, tablas, version) {
  return crypto.createHash('sha256')
    .update(JSON.stringify({ metadata, tablas, version }))
    .digest('hex');
}

const respaldoValido = {
  version: VERSION_RESPALDO,
  metadata: {
    sistema: 'Sistema de Gestión Patrimonial UNP',
    fechaGeneracion: new Date().toISOString(),
    usuario: 'admin',
    totalFilas: 4
  },
  tablas: {
    usuarios: [
      { username: 'admin', nombre: 'Administrador', cargo: 'admin', dependencia: 'Rectorado' },
      { username: 'func1', nombre: 'Funcionario Uno', cargo: 'funcionario', dependencia: 'Rectorado' }
    ],
    bens: [
      { id: 'b1', data: { id: 'b1', rotulo: 'BIEN-001', descripcion: 'Mesa', dependencia: 'Rectorado' } },
      { id: 'b2', data: { id: 'b2', rotulo: 'BIEN-002', descripcion: 'Silla', dependencia: 'Rectorado' } }
    ]
  }
};
respaldoValido.checksum = hacerChecksum(respaldoValido.metadata, respaldoValido.tablas, respaldoValido.version);

console.log('=== Pruebas de respaldo ===');

// 1. Respaldo válido pasa validación
{
  const r = validarEsquemaRespaldo(respaldoValido);
  assert.ok(r.ok, 'El respaldo válido debe pasar validación');
  assert.strictEqual(r.totalFilas, 4);
  console.log('✅ Respaldo válido pasa validación');
}

// 2. Falta metadata
{
  const crudo = { version: VERSION_RESPALDO, tablas: {}, checksum: 'x' };
  const r = validarEsquemaRespaldo(crudo);
  assert.ok(!r.ok, 'Debe fallar sin metadata');
  assert.ok(r.errores.some(e => e.includes('metadata')), 'Debe reportar falta de metadata');
  console.log('✅ Rechaza respaldo sin metadata');
}

// 3. Tabla desconocida
{
  const crudo = JSON.parse(JSON.stringify(respaldoValido));
  crudo.tablas.tabla_inexistente = [];
  const r = validarEsquemaRespaldo(crudo);
  assert.ok(!r.ok, 'Debe rechazar tabla desconocida');
  console.log('✅ Rechaza tabla desconocida');
}

// 4. Fila sin clave primaria
{
  const crudo = JSON.parse(JSON.stringify(respaldoValido));
  crudo.tablas.usuarios.push({ nombre: 'Sin username' });
  const r = validarEsquemaRespaldo(crudo);
  assert.ok(!r.ok, 'Debe rechazar fila sin pk');
  console.log('✅ Rechaza fila sin clave primaria');
}

// 5. Checksum incorrecto
{
  const crudo = JSON.parse(JSON.stringify(respaldoValido));
  crudo.checksum = 'checksum_falso';
  const r = validarEsquemaRespaldo(crudo);
  assert.ok(!r.ok, 'Debe rechazar checksum incorrecto');
  console.log('✅ Rechaza checksum incorrecto (errores=' + JSON.stringify(r.errores) + ')');
}

// 6. armarRespaldo genera estructura correcta
{
  const filasPorTabla = {
    usuarios: [{ username: 'a', nombre: 'A', cargo: 'admin' }],
    bens: [{ id: 'b1', data: { id: 'b1', rotulo: 'X' } }]
  };
  const respaldo = armarRespaldo(filasPorTabla, 'admin');
  assert.strictEqual(respaldo.version, VERSION_RESPALDO);
  assert.strictEqual(respaldo.metadata.sistema, 'Sistema de Gestión Patrimonial UNP');
  assert.strictEqual(respaldo.metadata.totalFilas, 2);
  assert.ok(respaldo.checksum, 'Debe generar checksum');
  assert.ok(Array.isArray(respaldo.tablas.usuarios));
  assert.ok(Array.isArray(respaldo.tablas.bens));
  console.log('✅ armarRespaldo genera estructura correcta');
}

// 7. ORDEN_RESTAURACION respeta dependencias
{
  const idxUsuarios = ORDEN_RESTAURACION.indexOf('usuarios');
  const idxBiens = ORDEN_RESTAURACION.indexOf('bens');
  assert.ok(idxUsuarios < idxBiens, 'usuarios debe restaurarse antes que bens');
  console.log('✅ Orden de restauración respeta dependencias');
}

// 8. TABLAS_CONOCIDAS tiene claves primarias correctas
{
  assert.strictEqual(TABLAS_CONOCIDAS.usuarios, 'username');
  assert.strictEqual(TABLAS_CONOCIDAS.bens, 'id');
  assert.strictEqual(TABLAS_CONOCIDAS.fc10, 'id');
  console.log('✅ Claves primarias correctas');
}

console.log('\n✅ Todas las pruebas de respaldo pasaron.');
