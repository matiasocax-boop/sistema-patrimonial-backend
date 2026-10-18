/**
 * backend/lib/respaldo.js
 * ============================================================================
 * SISTEMA DE RESPALDO Y RESTAURACIÓN JSON ROBUSTO
 * ============================================================================
 *
 * Propósito:
 *   - Exportar una copia de seguridad completa (JSON) de TODAS las tablas del
 *     sistema: bens, fc10, fc11, fc04, estructuras, usuarios, dependencias,
 *     ubicaciones, funcionarios, notificaciones, auditoria, app_config.
 *   - Importar/restaurar ese JSON validando un esquema estricto ANTES de
 *     escribir en la base de datos, previniendo corrupción de datos.
 *
 * Diseño:
 *   - Formato versionado con metadatos (fecha, versión, usuario, totalFilas,
 *     checksum SHA-256).
 *   - Validación de esquema sin dependencias externas (puro Node.js) para que
 *     el servidor arranque en cualquier entorno.
 *   - Orden de restauración por dependencias (usuarios/funcionarios antes que
 *     bienes que los referencian).
 *   - Escritura por lotes con transacción por tabla y rollback parcial.
 *   - Cada fila escrita recibe `updated_at` = ahora (nunca el sello del
 *     archivo) para que la sincronización delta de los clientes funcione.
 * ============================================================================ */

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// 1. ESQUEMA DE VALIDACIÓN (JSON Schema simplificado, validado a mano)
// ---------------------------------------------------------------------------

// Tablas conocidas y su clave primaria.
const TABLAS_CONOCIDAS = {
  usuarios: 'username',
  dependencias: 'id',
  funcionarios: 'id',
  ubicaciones: 'id',
  estructuras: 'id',
  bens: 'id',
  fc10: 'id',
  fc11: 'id',
  fc04: 'id',
  notificaciones: 'id',
  auditoria: 'id',
  app_config: 'id'
};

// Orden de restauración (dependencias primero).
const ORDEN_RESTAURACION = [
  'usuarios', 'dependencias', 'funcionarios', 'ubicaciones',
  'estructuras', 'bens', 'fc10', 'fc11', 'fc04',
  'notificaciones', 'auditoria', 'app_config'
];

// Esquema JSON válido (para documentación y validación estructural).
const RESPALDO_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['metadata', 'tablas', 'version', 'checksum'],
  properties: {
    version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    metadata: {
      type: 'object',
      required: ['sistema', 'fechaGeneracion', 'usuario', 'totalFilas'],
      properties: {
        sistema: { const: 'Sistema de Gestión Patrimonial UNP' },
        fechaGeneracion: { type: 'string', format: 'date-time' },
        usuario: { type: 'string' },
        totalFilas: { type: 'integer', minimum: 0 }
      }
    },
    tablas: {
      type: 'object',
      properties: {
        usuarios: { type: 'array', items: { type: 'object', required: ['username'] } },
        dependencias: { type: 'array', items: { type: 'object', required: ['id', 'nombre'] } },
        funcionarios: { type: 'array', items: { type: 'object', required: ['id'] } },
        ubicaciones: { type: 'array', items: { type: 'object', required: ['id', 'nombre', 'dependencia'] } },
        estructuras: { type: 'array', items: { type: 'object', required: ['id'] } },
        bens: { type: 'array', items: { type: 'object', required: ['id', 'data'] } },
        fc10: { type: 'array', items: { type: 'object', required: ['id', 'data'] } },
        fc11: { type: 'array', items: { type: 'object', required: ['id', 'data'] } },
        fc04: { type: 'array', items: { type: 'object', required: ['id', 'data'] } },
        notificaciones: { type: 'array', items: { type: 'object', required: ['id'] } },
        auditoria: { type: 'array', items: { type: 'object', required: ['id'] } },
        app_config: { type: 'array', items: { type: 'object', required: ['id'] } }
      }
    },
    checksum: { type: 'string' }
  },
  additionalProperties: false
};

const VERSION_RESPALDO = '2.1.0';
const SISTEMA_NOMBRE = 'Sistema de Gestión Patrimonial UNP';

/**
 * Genera checksum SHA-256 del contenido.
 */
function generarChecksum(contenido) {
  return crypto.createHash('sha256').update(JSON.stringify(contenido)).digest('hex');
}

/**
 * Valida un objeto de respaldo parseado contra el esquema y reglas de negocio.
 *
 * @param {object} crudo
 * @returns {{ok: boolean, errores: string[], avisos: string[], tablas?: object, metadata?: object, totalFilas?: number}}
 */
function validarEsquemaRespaldo(crudo) {
  const errores = [];
  const avisos = [];

  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) {
    return { ok: false, errores: ['El archivo no es un objeto JSON válido.'], avisos };
  }

  // --- Campos de nivel raíz ---
  for (const campo of ['metadata', 'tablas', 'version', 'checksum']) {
    if (!(campo in crudo)) errores.push(`Falta campo obligatorio: ${campo}`);
  }
  if (errores.length > 0) return { ok: false, errores, avisos };

  // --- Metadata ---
  const md = crudo.metadata;
  if (!md || typeof md !== 'object') {
    errores.push('metadata es obligatorio y debe ser un objeto');
  } else {
    for (const c of ['sistema', 'fechaGeneracion', 'usuario', 'totalFilas']) {
      if (!(c in md)) errores.push(`metadata.${c} es obligatorio`);
    }
    if (md.sistema !== SISTEMA_NOMBRE) {
      avisos.push(`metadata.sistema dice "${md.sistema}", no es exactamente este sistema.`);
    }
    if (isNaN(Date.parse(md.fechaGeneracion))) {
      errores.push('metadata.fechaGeneracion debe ser una fecha ISO 8601 válida.');
    }
    if (typeof md.totalFilas !== 'number' || md.totalFilas < 0) {
      errores.push('metadata.totalFilas debe ser un entero >= 0.');
    }
  }

  if (crudo.version !== VERSION_RESPALDO) {
    avisos.push(`La versión del respaldo es ${crudo.version}, se esperaba ${VERSION_RESPALDO}.`);
  }

  // --- Tablas ---
  const tablas = crudo.tablas;
  if (!tablas || typeof tablas !== 'object' || Array.isArray(tablas)) {
    errores.push('tablas debe ser un objeto con los arreglos de cada tabla.');
    return { ok: false, errores, avisos };
  }

  // Solo tablas conocidas
  for (const clave of Object.keys(tablas)) {
    if (!(clave in TABLAS_CONOCIDAS)) {
      errores.push(`Tabla desconocida en respaldo: ${clave}`);
    }
  }

  // Cada fila debe tener su clave primaria (en envoltura 'data' o plana).
  let totalFilas = 0;
  const tablasLimpias = {};

  for (const [clave, filas] of Object.entries(tablas)) {
    if (!Array.isArray(filas)) {
      errores.push(`La tabla "${clave}" debe ser un arreglo.`);
      continue;
    }
    const pk = TABLAS_CONOCIDAS[clave];
    const limpias = [];

    filas.forEach((fila, i) => {
      if (!fila || typeof fila !== 'object' || Array.isArray(fila)) {
        errores.push(`${clave}[${i}] no es un objeto válido`);
        return;
      }

      // Soportar envoltura { id, data: {...} } o objeto plano.
      let cuerpo = fila;
      if (fila.data && typeof fila.data === 'object' && !Array.isArray(fila.data)) {
        cuerpo = { ...fila.data, id: fila.id !== undefined ? fila.id : fila.data.id };
      }

      const valorPk = cuerpo[pk];
      if (valorPk === undefined || valorPk === null || String(valorPk).trim() === '') {
        errores.push(`${clave}[${i}] carece de clave primaria "${pk}"`);
        return;
      }

      limpias.push({ ...cuerpo, [pk]: String(valorPk) });
    });

    tablasLimpias[clave] = limpias;
    totalFilas += limpias.length;
  }

  if (errores.length > 0) return { ok: false, errores, avisos };

  // --- Checksum ---
  // Se valida sobre los datos crudos tal como llegan (no sobre tablasLimpias),
  // para que un respaldo generado por armarRespaldo() coincida exactamente.
  const esperado = generarChecksum({ metadata: crudo.metadata, tablas: crudo.tablas, version: crudo.version });
  if (crudo.checksum && crudo.checksum !== esperado) {
    errores.push('El checksum del archivo no coincide con su contenido (posible corrupción).');
  }

  return {
    ok: errores.length === 0,
    errores,
    avisos,
    tablas: tablasLimpias,
    metadata: crudo.metadata,
    totalFilas
  };
}

/**
 * Arma el objeto de respaldo completo a partir de las filas de cada tabla.
 * @param {object} filasPorTabla  { tabla: [{id, data, ...}], ... }
 * @param {string} usuario
 * @returns {object} objeto listo para serializar a JSON
 */
function armarRespaldo(filasPorTabla, usuario = 'sistema') {
  const tablas = {};
  let totalFilas = 0;

  for (const clave of ORDEN_RESTAURACION) {
    const filas = Array.isArray(filasPorTabla[clave]) ? filasPorTabla[clave] : [];
    tablas[clave] = filas;
    totalFilas += filas.length;
  }

  const metadata = {
    sistema: SISTEMA_NOMBRE,
    fechaGeneracion: new Date().toISOString(),
    usuario,
    totalFilas
  };

  const checksum = generarChecksum({ metadata, tablas, version: VERSION_RESPALDO });

  return {
    version: VERSION_RESPALDO,
    metadata,
    tablas,
    checksum
  };
}

/**
 * Normaliza una fila de Supabase (envuelta en {id, data}) a objeto plano para escritura.
 * @param {object} fila
 * @param {string} pk
 * @returns {object}
 */
function normalizarFilaParaEscribir(fila, pk) {
  if (fila.data && typeof fila.data === 'object' && !Array.isArray(fila.data)) {
    return { ...fila.data, [pk]: fila.id !== undefined ? fila.id : fila.data[pk] };
  }
  return { ...fila };
}

module.exports = {
  validarEsquemaRespaldo,
  armarRespaldo,
  ORDEN_RESTAURACION,
  TABLAS_CONOCIDAS,
  RESPALDO_SCHEMA,
  VERSION_RESPALDO,
  SISTEMA_NOMBRE,
  normalizarFilaParaEscribir
};
