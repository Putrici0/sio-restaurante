#!/usr/bin/env python3
"""
Arranca toda la demo de SIGO-RSH (Restaurante Sakura Hanami) con un solo comando:

    python iniciar.py            # backend + frontend
    python iniciar.py --reset    # igual, pero regenerando los datos de demo con la hora actual

- Backend (Java/Javalin) en http://localhost:7070, datos en data/sio-restaurante.json
- Frontend (Angular) en http://localhost:4200
Los procesos quedan en segundo plano; sus registros están en la carpeta logs/.
Para pararlo todo:  python detener.py
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
LOGS = RAIZ / "logs"
PIDS = RAIZ / ".sio-procesos.json"
DATOS = RAIZ / "data"
ES_WINDOWS = os.name == "nt"

BACKEND_URL = "http://localhost:7070/health"
FRONTEND_URL = "http://localhost:4200"
MAVEN_INTELLIJ = Path(r"C:\Program Files\JetBrains\IntelliJ IDEA 2026.3\plugins\maven-plugin\lib\maven3\bin\mvn.cmd")


def responde(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=2) as r:
            return r.status < 500
    except Exception:
        return False


def esperar(url: str, nombre: str, segundos: int) -> bool:
    print(f"  Esperando a que {nombre} responda", end="", flush=True)
    limite = time.time() + segundos
    while time.time() < limite:
        if responde(url):
            print(" ✓")
            return True
        print(".", end="", flush=True)
        time.sleep(2)
    print(" ✗")
    return False


def lanzar(comando, log: Path, cwd: Path) -> int:
    """Lanza un proceso en segundo plano, desligado de esta consola."""
    salida = open(log, "w", encoding="utf-8", errors="replace")
    opciones = {"cwd": str(cwd), "stdout": salida, "stderr": subprocess.STDOUT, "stdin": subprocess.DEVNULL}
    if ES_WINDOWS:
        opciones["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
    else:
        opciones["start_new_session"] = True
    return subprocess.Popen(comando, **opciones).pid


def comando_maven() -> str:
    for candidato in ("mvn.cmd", "mvn") if ES_WINDOWS else ("mvn",):
        ruta = shutil.which(candidato)
        if ruta:
            return ruta
    if MAVEN_INTELLIJ.exists():
        return str(MAVEN_INTELLIJ)
    sys.exit("No se encuentra Maven. Instálalo o añade 'mvn' al PATH.")


def comando_backend():
    if ES_WINDOWS:
        return ["cmd", "/c", str(RAIZ / "backend" / "scripts" / "run-backend.cmd")]
    mvn = comando_maven()
    return ["sh", "-c",
            f'"{mvn}" -q compile dependency:build-classpath -Dmdep.outputFile=target/classpath.txt '
            '&& java -cp "target/classes:$(cat target/classpath.txt)" Main']


def comando_frontend():
    npm = shutil.which("npm.cmd" if ES_WINDOWS else "npm") or shutil.which("npm")
    if not npm:
        sys.exit("No se encuentra npm. Instala Node.js (https://nodejs.org).")
    return [npm, "run", "start"]


def main() -> None:
    # Consola de Windows: permitir emojis y tildes
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Arranca la demo de SIGO-RSH (Sakura Hanami).")
    parser.add_argument("--reset", action="store_true", help="borra los datos y empieza con la demo original")
    parser.add_argument("--sin-navegador", action="store_true", help="no abrir el navegador al terminar")
    args = parser.parse_args()

    print("🌸 SIGO-RSH · Restaurante Sakura Hanami")
    LOGS.mkdir(exist_ok=True)
    procesos = json.loads(PIDS.read_text()) if PIDS.exists() else {}

    if args.reset:
        if responde(BACKEND_URL):
            sys.exit("Para usar --reset primero detén la demo: python detener.py")
        shutil.rmtree(DATOS, ignore_errors=True)
        # Datos de demo generados ahora mismo: histórico de 3 semanas y un servicio en curso con horas reales
        subprocess.run([sys.executable, str(RAIZ / "backend" / "scripts" / "generar_datos_demo.py"),
                        "--salida", str(DATOS / "sio-restaurante.json")], check=True)
        print("  Datos de demo regenerados con la fecha y hora actuales.")

    # --- Backend
    if responde(BACKEND_URL):
        print("• Backend ya estaba en marcha (7070).")
    else:
        print("• Arrancando backend (compila con Maven la primera vez, puede tardar)…")
        procesos["backend"] = lanzar(comando_backend(), LOGS / "backend.log", RAIZ)
        if not esperar(BACKEND_URL, "el backend", 180):
            sys.exit(f"El backend no arrancó. Revisa {LOGS / 'backend.log'}")

    # --- Frontend
    if responde(FRONTEND_URL):
        print("• Frontend ya estaba en marcha (4200).")
    else:
        frontend = RAIZ / "frontend"
        if not (frontend / "node_modules").exists():
            print("• Instalando dependencias del frontend (solo la primera vez)…")
            subprocess.run([comando_frontend()[0], "install", "--no-audit", "--no-fund"], cwd=frontend, check=True)
        print("• Arrancando frontend…")
        procesos["frontend"] = lanzar(comando_frontend(), LOGS / "frontend.log", frontend)
        if not esperar(FRONTEND_URL, "el frontend", 240):
            sys.exit(f"El frontend no arrancó. Revisa {LOGS / 'frontend.log'}")

    PIDS.write_text(json.dumps(procesos, indent=2))

    print("\nTodo listo:")
    print("  Web pública ........ http://localhost:4200/")
    print("  Sala y gerencia .... http://localhost:4200/mesas")
    print("  Cocina ............. http://localhost:4200/cocina")
    print("  Móvil del camarero . http://localhost:4200/camarero  (camarero1 / sakura)")
    print("  API ................ http://localhost:7070/")
    print("\nPara pararlo todo:  python detener.py")
    if not args.sin_navegador:
        webbrowser.open("http://localhost:4200/mesas")


if __name__ == "__main__":
    main()
