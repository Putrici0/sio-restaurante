@echo off
rem Arranca el backend de SIGO-RSH en http://localhost:7070 (datos en data\sio-restaurante.json)
cd /d "%~dp0..\.."
if "%MVN%"=="" set "MVN=mvn"
where %MVN% >nul 2>nul || set "MVN=C:\Program Files\JetBrains\IntelliJ IDEA 2026.3\plugins\maven-plugin\lib\maven3\bin\mvn.cmd"
rem Primero sin red; si faltan dependencias se descargan usando los certificados de Windows
call "%MVN%" -o -q compile dependency:build-classpath -Dmdep.outputFile=target\classpath.txt
if errorlevel 1 (
  set "MAVEN_OPTS=-Djavax.net.ssl.trustStoreType=Windows-ROOT"
  call "%MVN%" -q compile dependency:build-classpath -Dmdep.outputFile=target\classpath.txt || exit /b 1
)
for /f "usebackq delims=" %%i in ("target\classpath.txt") do set "CP=%%i"
java -cp "target\classes;%CP%" Main
