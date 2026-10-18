@echo off
REM ============================================================================
REM LANZADOR PORTABLE DEL FRONTEND
REM ============================================================================
REM Usa %~dp0 (directorio del propio script) para resolver la ruta del frontend
REM sin hardcodear rutas absolutas. Funciona en cualquier máquina y en CI.
REM ============================================================================
cd /d "%~dp0frontend"
npm run dev