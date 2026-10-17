@echo off
REM ============================================================================
REM Arranca el frontend en modo desarrollo.
REM Usa %~dp0 para ubicarse en la carpeta del script, asi funciona desde
REM cualquier ruta del disco. Antes tenia la ruta absoluta de una sola
REM maquina y fallaba en cualquier otra.
REM ============================================================================
cd /d "%~dp0frontend"
npm run dev