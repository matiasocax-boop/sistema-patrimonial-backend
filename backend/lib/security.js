/**
 * ============================================================================
 * SEGURIDAD DEL BACKEND - middlewares y validaciones reutilizables
 * ============================================================================
 * Se implementa sin dependencias externas (la API auxiliar debe arrancar en
 * cualquier entorno) pero con los controles mínimos que un login expuesto a
 * internet necesita:
 *
 *   1. Limitación de intentos de login por IP (fuerza bruta).
 *   2. Cabeceras de seguridad HTTP (anti-sniffing, anti-clickjacking, HSTS).
 *   3. Lista blanca de tablas para las escrituras JSONB: evita que un nombre de
 *      tabla interpolado en SQL se salga del conjunto conocido.
 *
 * Todo es puro y sin estado externo, así que se puede probar sin levantar el
 * servidor ni tocar la base de datos.
 * ========================================================================== */

// Tablas que guardan el registro completo en la columna JSONB `data`.
// `usuarios` y `auditoria` NO entran: se escriben por endpoints dedicados.
const TABLAS_JSONB = new Set(['bens', 'fc10', 'fc11', 'fc04', 'estructuras']);

/** ¿La tabla puede escribirse por el helper genérico de JSONB? */
function tablaEnBlanco(tabla) {
  return typeof tabla === 'string' && TABLAS_JSONB.has(tabla);
}

/**
 * Middleware de cabeceras de seguridad.
 *
 * Se aplica antes de cualquier ruta. No reemplaza a un WAF ni a las políticas
 * RLS de Supabase, pero cierra los vectores triviales (MIME sniffing, framing,
 * fuga por Referer).
 */
function cabecerasSeguras(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // HSTS solo tiene sentido servido por HTTPS; en local el navegador lo ignora.
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // Las respuestas de la API nunca deben quedar en caché compartida.
  res.setHeader('Cache-Control', 'no-store');
  next();
}

/**
 * Crea un limitador de intentos por IP (ventana deslizante + bloqueo).
 *
 * Es en memoria a propósito: el backend auxiliar corre en una sola instancia.
 * Si algún día se escala horizontal, hay que moverlo a un almacén compartido
 * (Redis) o usar un middleware de plataforma; el código lo deja documentado.
 *
 * @param {{ventanaMs?: number, maxIntentos?: number, bloqueoMs?: number}} [opciones]
 * @returns {(req: object, res: object, next: Function) => void}
 */
function crearLimitadorLogin({
  ventanaMs = 15 * 60 * 1000,
  maxIntentos = 5,
  bloqueoMs = 15 * 60 * 1000
} = {}) {
  const intentos = new Map(); // ip -> { count, first, blockedUntil }

  // Limpieza periódica: sin esto, la memoria crecería con cada IP nueva.
  const timer = setInterval(() => {
    const ahora = Date.now();
    for (const [ip, estado] of intentos) {
      const vencida = ahora - estado.first > ventanaMs;
      const bloqueoVencido = estado.blockedUntil && ahora >= estado.blockedUntil;
      if (vencida && !estado.blockedUntil) intentos.delete(ip);
      else if (bloqueoVencido && ahora - estado.first > ventanaMs) intentos.delete(ip);
    }
  }, ventanaMs);
  // No impedir que el proceso termine en tests o en CI.
  if (typeof timer.unref === 'function') timer.unref();

  return function limitadorLogin(req, res, next) {
    const clave = String(
      req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'desconocido'
    );
    const ahora = Date.now();
    let estado = intentos.get(clave);
    if (!estado) {
      estado = { count: 0, first: ahora, blockedUntil: 0 };
      intentos.set(clave, estado);
    }

    // Si está bloqueado, se rechaza sin contar el intento.
    if (estado.blockedUntil && ahora < estado.blockedUntil) {
      const retryAfter = Math.ceil((estado.blockedUntil - ahora) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Demasiados intentos. Intentá de nuevo en unos minutos.',
        retryAfter
      });
    }

    // Ventana vencida: se reinicia el contador.
    if (ahora - estado.first > ventanaMs) {
      estado.count = 0;
      estado.first = ahora;
      estado.blockedUntil = 0;
    }

    estado.count += 1;
    if (estado.count > maxIntentos) {
      estado.blockedUntil = ahora + bloqueoMs;
      estado.count = 0;
      estado.first = ahora;
      const retryAfter = Math.ceil(bloqueoMs / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Demasiados intentos. Intentá de nuevo en unos minutos.',
        retryAfter
      });
    }

    next();
  };
}

/**
 * Sanitiza un objeto de entrada recursivamente para prevenir ataques por
 * contaminación de prototipos (prototype pollution) y claves peligrosas.
 * Elimina claves '__proto__', 'constructor', 'prototype' y valores nulos vacíos.
 */
const CLAVES_PELIGROSAS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizarObjeto(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizarObjeto);
  if (typeof obj !== 'object') return obj;

  const limpio = {};
  for (const [key, valor] of Object.entries(obj)) {
    if (CLAVES_PELIGROSAS.has(key)) continue; // bloquear inyección de prototipo
    limpio[key] = sanitizarObjeto(valor);
  }
  return limpio;
}

/**
 * Crea un limitador general de peticiones por IP (ventana deslizante + bloqueo).
 * Se aplica a todos los endpoints /api para mitigar DoS ligero y fuerza bruta.
 * @param {{ventanaMs?: number, maxIntentos?: number, bloqueoMs?: number}} [opciones]
 */
function crearLimitadorGeneral({
  ventanaMs = 60 * 1000,
  maxIntentos = 120,
  bloqueoMs = 60 * 1000
} = {}) {
  const intentos = new Map(); // ip -> { count, first, blockedUntil }

  const timer = setInterval(() => {
    const ahora = Date.now();
    for (const [ip, estado] of intentos) {
      const vencida = ahora - estado.first > ventanaMs;
      const bloqueoVencido = estado.blockedUntil && ahora >= estado.blockedUntil;
      if (vencida && !estado.blockedUntil) intentos.delete(ip);
      else if (bloqueoVencido && ahora - estado.first > ventanaMs) intentos.delete(ip);
    }
  }, ventanaMs);
  if (typeof timer.unref === 'function') timer.unref();

  return function limitadorGeneral(req, res, next) {
    const clave = String(
      req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'desconocido'
    );
    const ahora = Date.now();
    let estado = intentos.get(clave);
    if (!estado) {
      estado = { count: 0, first: ahora, blockedUntil: 0 };
      intentos.set(clave, estado);
    }

    if (estado.blockedUntil && ahora < estado.blockedUntil) {
      const retryAfter = Math.ceil((estado.blockedUntil - ahora) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Demasiadas peticiones. Intentá de nuevo en unos minutos.',
        retryAfter
      });
    }

    if (ahora - estado.first > ventanaMs) {
      estado.count = 0;
      estado.first = ahora;
      estado.blockedUntil = 0;
    }

    estado.count += 1;
    if (estado.count > maxIntentos) {
      estado.blockedUntil = ahora + bloqueoMs;
      estado.count = 0;
      estado.first = ahora;
      const retryAfter = Math.ceil(bloqueoMs / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Demasiadas peticiones. Intentá de nuevo en unos minutos.',
        retryAfter
      });
    }

    next();
  };
}

/**
 * Cabeceras de seguridad adicionales (CSP básica para prevenir XSS reflejado).
 * Se combina con cabecerasSeguras existente.
 */
function cabecerasCSP(_req, res, next) {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://kit.fontawesome.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; connect-src 'self'; frame-ancestors 'none';"
  );
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  next();
}

module.exports = {
  tablaEnBlanco,
  cabecerasSeguras,
  crearLimitadorLogin,
  crearLimitadorGeneral,
  sanitizarObjeto,
  cabecerasCSP
};
