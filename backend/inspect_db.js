const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'patrimonio.sqlite');

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('❌ Error al abrir SQLite:', err.message);
    return;
  }
  console.log('✅ SQLite abierto correctamente');
  
  // List tables
  db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
    if (err) {
      console.error('❌ Error al consultar tablas:', err.message);
      return;
    }
    console.log('\n📋 TABLAS ENCONTRADAS (' + tables.length + '):');
    console.log('==================================================');
    tables.forEach(t => console.log(' -', t.name));
    
    // Count rows in each table
    let procesadas = 0;
    tables.forEach(t => {
      db.get(`SELECT COUNT(*) as total FROM "${t.name}"`, [], (errCount, rowCount) => {
        const total = rowCount ? rowCount.total : 0;
        console.log(`\n🔹 TABLA: [${t.name}] ➔ Total registros: ${total}`);
        if (total > 0) {
          db.all(`SELECT * FROM "${t.name}" LIMIT 2`, [], (errSample, samples) => {
            console.log('   Muestra de datos:');
            console.log(JSON.stringify(samples, null, 2));
            procesadas++;
            if (procesadas === tables.length) finish();
          });
        } else {
          procesadas++;
          if (procesadas === tables.length) finish();
        }
      });
    });
    
    function finish() {
      console.log('\n==================================================');
      console.log('✅ INSPECCIÓN FINALIZADA');
      console.log('==================================================\n');
      db.close();
    }
  });
});