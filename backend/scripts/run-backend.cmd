@echo off
rem Arranca el backend de SIGO-RSH en http://localhost:7070 (en primer plano).
rem Toda la logica (buscar Java/Maven o descargar Maven) esta en backend.py.
cd /d "%~dp0..\.."
where py >nul 2>nul
if %errorlevel%==0 (py -3 -u backend\scripts\backend.py) else (python -u backend\scripts\backend.py)
