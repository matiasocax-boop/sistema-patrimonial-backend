/**
 * backend/api/index.js
 * Handler de Vercel para el backend Express.
 * Exporta la app de Express como función serverless de Vercel.
 *
 * Despliegue en Vercel:
 *   1. Conectá este repositorio a Vercel.
 *   2. Configurá el Root Directory como `backend`.
 *   3. Agregá las variables de entorno en Vercel:
 *      DATABASE_URL, SECRET_KEY, ADMIN_INITIAL_PASSWORD, CORS_ORIGIN
 *   4. Vercel detectará vercel.json y desplegará server.js como función serverless.
 */

const { app } = require('../server.js');

// Vercel espera una función handler exportada por defecto.
module.exports = app;
