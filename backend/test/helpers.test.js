const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseRowData, idValido, esHashBcrypt, esPrivilegiado } = require('../lib/helpers');

test('parseRowData desempaqueta JSON y conserva el id de fila', () => {
  const r = parseRowData({ id: 'b1', data: { descripcion: 'Silla', id: 'otro' } });
  assert.equal(r.id, 'b1');
  assert.equal(r.descripcion, 'Silla');
});

test('parseRowData acepta data como string JSON', () => {
  const r = parseRowData({ id: 'b2', data: '{"rotulo":"12"}' });
  assert.equal(r.rotulo, '12');
  assert.equal(r.id, 'b2');
});

test('parseRowData no explota con JSON inválido', () => {
  const row = { id: 'x', data: '{no' };
  assert.equal(parseRowData(row), row);
});

test('idValido rechaza vacío, no-string y exceso de largo', () => {
  assert.equal(idValido('ok'), true);
  assert.equal(idValido(''), false);
  assert.equal(idValido('   '), false);
  assert.equal(idValido(null), false);
  assert.equal(idValido('a'.repeat(129)), false);
});

test('esHashBcrypt solo admite hashes bcrypt', () => {
  assert.equal(esHashBcrypt('$2a$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUV'), true);
  assert.equal(esHashBcrypt('secreto'), false);
  assert.equal(esHashBcrypt(null), false);
});

test('esPrivilegiado cubre admin y desarrollador', () => {
  assert.equal(esPrivilegiado('admin'), true);
  assert.equal(esPrivilegiado('dev'), true);
  assert.equal(esPrivilegiado('desarrollador'), true);
  assert.equal(esPrivilegiado('funcionario'), false);
});
