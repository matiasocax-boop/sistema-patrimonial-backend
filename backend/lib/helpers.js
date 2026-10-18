/**
 * Utilidades puras del backend (sin Express ni Postgres) para poder probarlas
 * sin levantar el servidor.
 */

function parseRowData(row) {
  if (!row) return null;
  if (row.data) {
    try {
      const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      return { ...parsed, id: row.id || parsed.id };
    } catch (e) {
      return row;
    }
  }
  return row;
}

function idValido(id) {
  return typeof id === 'string' && id.trim().length > 0 && id.length <= 128;
}

function esHashBcrypt(valor) {
  return typeof valor === 'string' && /^\$2[aby]\$\d{2}\$/.test(valor);
}

function esPrivilegiado(role) {
  return role === 'admin' || role === 'desarrollador' || role === 'dev';
}

module.exports = { parseRowData, idValido, esHashBcrypt, esPrivilegiado };
