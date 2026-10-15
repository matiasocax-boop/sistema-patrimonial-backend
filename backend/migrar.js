/**
 * Script de Migración: SQLite -> Supabase (PostgreSQL)
 * Lee el archivo 'patrimonio.sqlite' local y sube todos los datos a Supabase.
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

// Conexión a la base de datos SQLite local
const dbPath = path.join(__dirname, 'patrimonio.sqlite');
const sqliteDb = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('❌ Error al abrir SQLite local:', err.message);
    process.exit(1);
  }
  console.log('✅ SQLite local abierto correctamente.');
});

// Conexión a Supabase (PostgreSQL). La URL sale de la variable de entorno
// DATABASE_URL (ver .env.example). Nunca commitear credenciales en el código.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ Falta la variable de entorno DATABASE_URL. Copia .env.example a .env y completa la URL de conexión.');
  process.exit(1);
}
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

const tablas = ['bens', 'fc10', 'fc11', 'fc04', 'estructuras', 'usuarios', 'auditoria'];

async function migrarDatos() {
  try {
    console.log('🚀 Iniciando migración de datos a Supabase...\n');

    for (let tabla of tablas) {
      await migrarTabla(tabla);
    }

    console.log('\n🎉 ¡Migración completada con éxito!');
    sqliteDb.close();
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error durante la migración:', err);
    sqliteDb.close();
    await pool.end();
    process.exit(1);
  }
}

function migrarTabla(tabla) {
  return new Promise((resolve, reject) => {
    sqliteDb.all(`SELECT * FROM ${tabla}`, [], async (err, rows) => {
      if (err) {
        console.log(`⚠️ La tabla '${tabla}' no existe en SQLite o está vacía. Saltando...`);
        return resolve();
      }

      if (!rows || rows.length === 0) {
        console.log(`ℹ️ La tabla '${tabla}' no tiene registros.`);
        return resolve();
      }

      console.log(`📦 Migrando ${rows.length} registros de la tabla '${tabla}'...`);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        for (let row of rows) {
          if (tabla === 'usuarios') {
            // Estructura específica de usuarios
            await client.query(
              `INSERT INTO usuarios (username, nombre, password, cargo) 
               VALUES ($1, $2, $3, $4) 
               ON CONFLICT (username) DO NOTHING`,
              [row.username, row.nombre, row.password, row.cargo]
            );
          } else if (tabla === 'auditoria') {
            // Estructura específica de auditoría
            await client.query(
              `INSERT INTO auditoria (id, tipoRegistro, usuarioDestino, titulo, mensaje, leido, fecha, bienId, accion) 
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               ON CONFLICT (id) DO NOTHING`,
              [row.id, row.tipoRegistro, row.usuarioDestino, row.titulo, row.mensaje, row.leido, row.fecha, row.bienId, row.accion]
            );
          } else {
            // Tablas con columna 'id' y 'data' (bens, fc10, fc11, fc04, estructuras)
            await client.query(
              `INSERT INTO ${tabla} (id, data) 
               VALUES ($1, $2) 
               ON CONFLICT (id) DO UPDATE SET data = $2`,
              [row.id, typeof row.data === 'string' ? row.data : JSON.stringify(row.data)]
            );
          }
        }

        await client.query('COMMIT');
        console.log(`✅ Tabla '${tabla}' migrada correctamente.`);
        resolve();
      } catch (e) {
        await client.query('ROLLBACK');
        console.error(`❌ Error al migrar la tabla '${tabla}':`, e.message);
        reject(e);
      } finally {
        client.release();
      }
    });
  });
}

migrarDatos();