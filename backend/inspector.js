/**
 * ============================================================================
 * SCRIPT DE INSPECCIÓN DE BASE DE DATOS SQLITE - PATRIMONIO UNP
 * ============================================================================
 * Inspecciona tablas, recuenta registros y detecta dependencias existentes.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Ruta absoluta a la base de datos
const dbPath = path.join(__dirname, 'patrimonio.sqlite');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('❌ Error al abrir la base de datos SQLite:', err.message);
    process.exit(1);
  }
  console.log('🔍 Conectado exitosamente a:', dbPath);
  analizarBaseDeDatos();
});

function analizarBaseDeDatos() {
  // 1. Obtener todas las tablas existentes en el archivo SQLite
  db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
    if (err) {
      console.error('❌ Error al consultar las tablas:', err.message);
      return;
    }

    console.log('\n==================================================');
    console.log(`📋 TABLAS ENCONTRADAS EN LA BASE DE DATOS (${tables.length})`);
    console.log('==================================================');

    if (tables.length === 0) {
      console.log('⚠️ La base de datos está completamente vacía.');
      return;
    }

    let procesadas = 0;

    tables.forEach((t) => {
      const tableName = t.name;

      // 2. Contar registros por tabla
      db.get(`SELECT COUNT(*) as total FROM "${tableName}"`, [], (errCount, rowCount) => {
        const total = rowCount ? rowCount.total : 0;
        console.log(`\n🔹 TABLA: [${tableName}] ➔ Total registros: ${total}`);

        if (total > 0) {
          // 3. Mostrar muestra de los primeros 2 registros
          db.all(`SELECT * FROM "${tableName}" LIMIT 2`, [], (errSample, samples) => {
            console.log(`   📄 Muestra de datos en [${tableName}]:`);
            console.log(JSON.stringify(samples, null, 2));

            // Si es una tabla de bienes, mostrar dependencias únicas
            if (tableName === 'bens' || tableName === 'bienes') {
              db.all(`SELECT DISTINCT dependencia FROM "${tableName}"`, [], (errDep, deps) => {
                if (!errDep && deps) {
                  const listaDeps = deps.map(d => d.dependencia).filter(Boolean);
                  console.log(`   🏛️ Dependencias detectadas en [${tableName}]:`, listaDeps);
                }
                comprobarFin();
              });
            } else {
              comprobarFin();
            }
          });
        } else {
          comprobarFin();
        }
      });
    });

    function comprobarFin() {
      procesadas++;
      if (procesadas === tables.length) {
        setTimeout(() => {
          console.log('\n==================================================');
          console.log('✅ INSPECCIÓN FINALIZADA CON ÉXITO');
          console.log('==================================================\n');
          db.close();
        }, 500);
      }
    }
  });
}