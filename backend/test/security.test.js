const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  tablaEnBlanco, cabecerasSeguras, crearLimitadorLogin
} = require('../lib/security');

test('tablaEnBlanco acepta solo las tablas JSONB conocidas', () => {
  for (const t of ['bens', 'fc10', 'fc11', 'fc04', 'estructuras']) {
    assert.equal(tablaEnBlanco(t), true, t);
  }
  // Nunca usuarios/auditoria ni valores inyectados.
  for (const t of ['usuarios', 'auditoria', 'bens; DROP TABLE bens', '', null, 42, {}]) {
    assert.equal(tablaEnBlanco(t), false, String(t));
  }
});

test('cabecerasSeguras fija las cabeceras mínimas y llama next', () => {
  const puestas = {};
  const res = { setHeader: (k, v) => { puestas[k] = v; } };
  let siguio = false;
  cabecerasSeguras({}, res, () => { siguio = true; });

  assert.equal(siguio, true);
  assert.equal(puestas['X-Content-Type-Options'], 'nosniff');
  assert.equal(puestas['X-Frame-Options'], 'DENY');
  assert.equal(puestas['Referrer-Policy'], 'no-referrer');
  assert.ok(puestas['Strict-Transport-Security'].includes('max-age='));
  assert.equal(puestas['Cache-Control'], 'no-store');
});

test('limitadorLogin deja pasar los primeros intentos y bloquea al exceder', () => {
  const limitador = crearLimitadorLogin({ ventanaMs: 60_000, maxIntentos: 3, bloqueoMs: 60_000 });
  const nuevaRes = () => {
    const headers = {};
    return {
      headers,
      setHeader: (k, v) => { headers[k] = v; },
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(b) { this.body = b; return this; }
    };
  };

  // 3 intentos permitidos desde la misma IP.
  for (let i = 0; i < 3; i++) {
    let llamado = false;
    limitador({ ip: '1.2.3.4' }, nuevaRes(), () => { llamado = true; });
    assert.equal(llamado, true, `intento ${i + 1} debe pasar`);
  }

  // El 4to se bloquea con 429.
  const bloqueada = nuevaRes();
  let noPaso = true;
  limitador({ ip: '1.2.3.4' }, bloqueada, () => { noPaso = false; });
  assert.equal(noPaso, true);
  assert.equal(bloqueada.statusCode, 429);
  assert.ok(bloqueada.body.error);
  assert.ok(Number(bloqueada.headers['Retry-After']) > 0);

  // Otra IP no se ve afectada por el bloqueo.
  let otraPaso = false;
  limitador({ ip: '9.9.9.9' }, nuevaRes(), () => { otraPaso = true; });
  assert.equal(otraPaso, true, 'otra IP no debe heredar el bloqueo');
});

test('limitadorLogin reinicia la ventana cuando expira', () => {
  const limitador = crearLimitadorLogin({ ventanaMs: 20, maxIntentos: 1, bloqueoMs: 10_000 });
  let siguiente = 0;
  const next = () => { siguiente += 1; };

  limitador({ ip: 'a' }, { setHeader() {}, status() { return this; }, json() { return this; } }, next);
  assert.equal(siguiente, 1);

  // Segundo intento inmediato: se bloquea.
  let bloqueado = false;
  limitador({ ip: 'a' }, {
    setHeader() {},
    status() { bloqueado = true; return this; },
    json() { return this; }
  }, next);
  assert.equal(bloqueado, true);
});
