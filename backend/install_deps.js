/**
 * ============================================================================
 * INSTALADOR DE DEPENDENCIAS DEL BACKEND
 * ============================================================================
 * Ejecuta `npm install` dentro de backend/ usando una ruta relativa a este
 * archivo. Antes tenía la ruta absoluta de la máquina donde se escribió
 * (C:\Users\mtsoc\...), que rompía en cualquier otra computadora y en CI.
 *
 * Uso:  node install_deps.js
 */
const { execSync } = require('child_process');
const path = require('path');

// __dirname resuelve la carpeta real del archivo: el repo puede vivir en
// cualquier ruta del disco sin editar nada.
const backendDir = path.join(__dirname, '.');

try {
  console.log(`Instalando dependencias en: ${backendDir}`);
  execSync('npm install', { cwd: backendDir, stdio: 'inherit' });
  console.log('\n✅ Dependencias instaladas correctamente.');
} catch (e) {
  console.error('\n❌ Error al instalar dependencias:', e.message);
  process.exit(1);
}