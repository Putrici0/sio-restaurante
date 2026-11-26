#!/usr/bin/env python3
"""
Compila y arranca el backend de SIGO-RSH en http://localhost:7070 (en primer plano).

    python backend/scripts/backend.py

Funciona en cualquier ordenador (Windows, macOS, Linux) sin depender de un IDE:
- Java: usa JAVA_HOME o el 'java' del PATH (hace falta JDK 21 o superior).
- Maven: usa el 'mvn' del PATH, MAVEN_HOME/M2_HOME, el que trae IntelliJ si está
  instalado o, si no encuentra ninguno, descarga Maven automáticamente en .herramientas/.
iniciar.py lo lanza en segundo plano; detener.py lo para.
"""
import glob
import os
import re
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
HERRAMIENTAS = RAIZ / ".herramientas"
ES_WINDOWS = os.name == "nt"
JAVA_MINIMO = 21
MAVEN_VERSION = "3.9.9"
MAVEN_URL = (f"https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/"
             f"{MAVEN_VERSION}/apache-maven-{MAVEN_VERSION}-bin.zip")
MVN_EJECUTABLE = "mvn.cmd" if ES_WINDOWS else "mvn"


# ---------------------------------------------------------------- Java

def buscar_java() -> tuple[str, str]:
    """Devuelve (ejecutable java, JAVA_HOME real) de un JDK 21+."""
    candidatos = []
    if os.environ.get("JAVA_HOME"):
        candidatos.append(Path(os.environ["JAVA_HOME"]) / "bin" / ("java.exe" if ES_WINDOWS else "java"))
    en_path = shutil.which("java")
    if en_path:
        candidatos.append(Path(en_path))
    for java in candidatos:
        if java.exists():
            version, home = info_java(java)
            if version >= JAVA_MINIMO:
                return str(java), home
            print(f"Aviso: {java} es Java {version}; hace falta Java {JAVA_MINIMO} o superior.")
    sys.exit(f"No se encuentra Java {JAVA_MINIMO}+. Instala un JDK (https://adoptium.net) "
             "y añádelo al PATH o define JAVA_HOME.")


def info_java(java: Path) -> tuple[int, str]:
    """Versión principal y java.home (el 'java' del PATH puede ser un atajo, p. ej. Oracle javapath)."""
    try:
        salida = subprocess.run([str(java), "-XshowSettings:properties", "-version"],
                                capture_output=True, text=True).stderr
    except OSError:
        return 0, ""
    version = re.search(r"java\.specification\.version = (?:1\.)?(\d+)", salida)
    home = re.search(r"java\.home = (.+)", salida)
    return (int(version.group(1)) if version else 0,
            home.group(1).strip() if home else str(java.resolve().parents[1]))


# ---------------------------------------------------------------- Maven

def buscar_maven() -> str:
    # 1. PATH
    ruta = shutil.which(MVN_EJECUTABLE) or shutil.which("mvn")
    if ruta:
        return ruta
    # 2. Variables de entorno habituales
    for variable in ("MAVEN_HOME", "M2_HOME"):
        if os.environ.get(variable):
            mvn = Path(os.environ[variable]) / "bin" / MVN_EJECUTABLE
            if mvn.exists():
                return str(mvn)
    # 3. Maven descargado antes por este script
    descargado = HERRAMIENTAS / f"apache-maven-{MAVEN_VERSION}" / "bin" / MVN_EJECUTABLE
    if descargado.exists():
        return str(descargado)
    # 4. Maven que trae IntelliJ IDEA (cualquier versión y ubicación típica)
    for mvn in maven_de_intellij():
        return mvn
    # 5. Descargarlo
    return descargar_maven()


def maven_de_intellij():
    sufijos = [os.path.join("plugins", p, "lib", "maven3", "bin", MVN_EJECUTABLE)
               for p in ("maven", "maven-plugin")]
    bases = []
    if ES_WINDOWS:
        for var in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"):
            if os.environ.get(var):
                bases += [os.path.join(os.environ[var], "JetBrains", "*"),
                          os.path.join(os.environ[var], "Programs", "*IntelliJ*"),
                          os.path.join(os.environ[var], "JetBrains", "Toolbox", "apps", "*", "*", "*")]
    elif sys.platform == "darwin":
        bases += ["/Applications/IntelliJ IDEA*.app/Contents",
                  os.path.expanduser("~/Applications/IntelliJ IDEA*.app/Contents")]
    else:
        bases += ["/opt/*idea*", "/snap/intellij-idea-*/current", "/usr/share/*idea*",
                  os.path.expanduser("~/.local/share/JetBrains/Toolbox/apps/*"),
                  os.path.expanduser("~/.local/share/JetBrains/Toolbox/apps/*/*/*")]
    encontrados = sorted({m for b in bases for s in sufijos for m in glob.glob(os.path.join(b, s))}, reverse=True)
    for mvn in encontrados:
        if not ES_WINDOWS:
            os.chmod(mvn, os.stat(mvn).st_mode | 0o111)
        yield mvn


def descargar_maven() -> str:
    print(f"No se encuentra Maven: descargando Maven {MAVEN_VERSION} en {HERRAMIENTAS} (solo la primera vez)…",
          flush=True)
    HERRAMIENTAS.mkdir(exist_ok=True)
    zip_destino = HERRAMIENTAS / f"apache-maven-{MAVEN_VERSION}-bin.zip"
    try:
        urllib.request.urlretrieve(MAVEN_URL, zip_destino)
        with zipfile.ZipFile(zip_destino) as z:
            z.extractall(HERRAMIENTAS)
    except Exception as e:
        sys.exit(f"No se pudo descargar Maven ({e}). Instálalo a mano (https://maven.apache.org) "
                 "y añade 'mvn' al PATH.")
    finally:
        zip_destino.unlink(missing_ok=True)
    bin_dir = HERRAMIENTAS / f"apache-maven-{MAVEN_VERSION}" / "bin"
    if not ES_WINDOWS:  # zipfile no conserva los permisos de ejecución
        for f in bin_dir.iterdir():
            f.chmod(f.stat().st_mode | 0o111)
    return str(bin_dir / MVN_EJECUTABLE)


# ---------------------------------------------------------------- Arranque

def compilar(mvn: str, java_home: str) -> None:
    entorno = dict(os.environ, JAVA_HOME=java_home)
    objetivos = ["-q", "compile", "dependency:build-classpath", "-Dmdep.outputFile=target/classpath.txt"]
    # Primero sin red (rápido si las dependencias ya están en ~/.m2); si faltan, se descargan
    if subprocess.run([mvn, "-o", *objetivos], cwd=RAIZ, env=entorno).returncode == 0:
        return
    print("Descargando dependencias con Maven…", flush=True)
    if ES_WINDOWS:  # usar los certificados de Windows (redes con proxy/antivirus que inspeccionan HTTPS)
        entorno["MAVEN_OPTS"] = (entorno.get("MAVEN_OPTS", "") + " -Djavax.net.ssl.trustStoreType=Windows-ROOT").strip()
    if subprocess.run([mvn, *objetivos], cwd=RAIZ, env=entorno).returncode != 0:
        sys.exit("La compilación del backend con Maven ha fallado.")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    java, java_home = buscar_java()
    mvn = buscar_maven()
    print(f"Java:  {java_home}\nMaven: {mvn}", flush=True)
    compilar(mvn, java_home)
    dependencias = (RAIZ / "target" / "classpath.txt").read_text(encoding="utf-8").strip()
    classpath = os.pathsep.join([str(RAIZ / "target" / "classes"), dependencias])
    print("Arrancando backend en http://localhost:7070 …", flush=True)
    # En Windows no existe exec real: se lanza como hijo y se espera (detener.py mata el árbol completo)
    proceso = subprocess.Popen([java, "-cp", classpath, "Main"], cwd=RAIZ)
    try:
        sys.exit(proceso.wait())
    except KeyboardInterrupt:
        proceso.terminate()


if __name__ == "__main__":
    main()
