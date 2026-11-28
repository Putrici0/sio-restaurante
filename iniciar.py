#!/usr/bin/env python3
"""
Arranca toda la demo de SIGO-RSH (Restaurante Sakura Hanami) con un solo comando:

    python iniciar.py            # backend + frontend
    python iniciar.py --reset    # igual, pero regenerando los datos de demo con la hora actual

Funciona en cualquier ordenador con Python 3, Java 21+ y Node.js; no hace falta ningún IDE
(si Maven no está instalado se descarga solo en .herramientas/).

- Backend (Java/Javalin) en http://localhost:7070, datos en data/sio-restaurante.json
- Frontend (Angular) en http://localhost:4200
Los procesos quedan en segundo plano; sus registros están en la carpeta logs/.
Para pararlo todo:  python detener.py
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

if sys.version_info < (3, 9):
    sys.exit("Hace falta Python 3.9 o superior (tienes " + sys.version.split()[0] + "). Descárgalo en https://www.python.org")

RAIZ = Path(__file__).resolve().parent
LOGS = RAIZ / "logs"
PIDS = RAIZ / ".sio-procesos.json"
DATOS = RAIZ / "data"
FICHERO_DATOS = DATOS / "sio-restaurante.json"
VERSION_DATOS = DATOS / ".version"
GENERADOR = RAIZ / "backend" / "scripts" / "generar_datos_demo.py"
ES_WINDOWS = os.name == "nt"

BACKEND_URL = "http://localhost:7070/health"
FRONTEND_URL = "http://localhost:4200"


def responde(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=2) as r:
            return r.status < 500
    except Exception:
        return False


def esperar(url: str, nombre: str, segundos: int, proceso=None) -> bool:
    print(f"  Esperando a que {nombre} responda", end="", flush=True)
    limite = time.time() + segundos
    while time.time() < limite:
        if responde(url):
            print(" ✓")
            return True
        if proceso is not None and proceso.poll() is not None:
            break  # el proceso ha terminado (error de compilación, puerto ocupado…)
        print(".", end="", flush=True)
        time.sleep(2)
    print(" ✗")
    return False


def lanzar(comando, log: Path, cwd: Path) -> subprocess.Popen:
    """Lanza un proceso en segundo plano, desligado de esta consola."""
    salida = open(log, "w", encoding="utf-8", errors="replace")
    opciones = {"cwd": str(cwd), "stdout": salida, "stderr": subprocess.STDOUT, "stdin": subprocess.DEVNULL}
    if ES_WINDOWS:
        opciones["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
    else:
        opciones["start_new_session"] = True
    return subprocess.Popen(comando, **opciones)


def comando_backend():
    # backend/scripts/backend.py localiza Java y Maven (o descarga Maven) en cualquier ordenador
    return [sys.executable, "-u", str(RAIZ / "backend" / "scripts" / "backend.py")]


def comando_frontend():
    npm = shutil.which("npm.cmd" if ES_WINDOWS else "npm") or shutil.which("npm")
    if not npm:
        sys.exit("No se encuentra npm. Instala Node.js (https://nodejs.org).")
    return [npm, "run", "start"]


def comprobar_node() -> None:
    """Angular 21 necesita Node.js 20.19+, 22.12+ o 24+."""
    node = shutil.which("node")
    if not node:
        sys.exit("No se encuentra Node.js. Instálalo desde https://nodejs.org (versión LTS).")
    salida = subprocess.run([node, "-v"], capture_output=True, text=True).stdout.strip()
    try:
        mayor, menor = (int(x) for x in salida.lstrip("v").split(".")[:2])
    except ValueError:
        return
    valida = mayor >= 24 or (mayor == 22 and menor >= 12) or (mayor == 20 and menor >= 19)
    if not valida:
        sys.exit(f"Node.js {salida} es demasiado antiguo para Angular 21: instala la versión LTS desde https://nodejs.org")


def huella(*ficheros: Path) -> str:
    """Huella de unos ficheros, igual en Windows, macOS y Linux (ignora CRLF/LF)."""
    h = hashlib.sha256()
    for f in ficheros:
        if f.exists():
            h.update(f.read_bytes().replace(b"\r\n", b"\n"))
    return h.hexdigest()[:16]


def preparar_datos(reset: bool) -> None:
    """
    Los datos de la demo (data/, no se suben a git) se generan en cada ordenador con la
    fecha de hoy. Se regeneran solos si faltan o si el generador ha cambiado tras un
    'git pull' (carta, precios, imágenes…); los anteriores se guardan en data/anteriores/.
    """
    version_actual = huella(GENERADOR)
    version_local = VERSION_DATOS.read_text().strip() if VERSION_DATOS.exists() else None
    faltan = not FICHERO_DATOS.exists()
    desfasados = not faltan and version_local != version_actual
    if not (reset or faltan or desfasados):
        return

    if responde(BACKEND_URL):
        if reset:
            sys.exit("Para usar --reset primero detén la demo: python detener.py")
        print("⚠ La demo en marcha usa datos de una versión anterior (carta, precios o imágenes).\n"
              "  Para actualizarlos: python detener.py  y después  python iniciar.py")
        return

    if FICHERO_DATOS.exists():
        copia = DATOS / "anteriores" / f"sio-restaurante-{time.strftime('%Y%m%d-%H%M%S')}.json"
        copia.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(FICHERO_DATOS), copia)
        print(f"  Datos anteriores guardados en {copia.relative_to(RAIZ)}")
    motivo = ("se ha pedido --reset" if reset else "es la primera vez en este ordenador" if faltan
              else "la carta o el generador han cambiado desde la última vez")
    print(f"• Generando los datos de la demo ({motivo})…", flush=True)
    # Histórico de 5 semanas y un servicio en curso con la fecha y hora actuales
    subprocess.run([sys.executable, str(GENERADOR), "--salida", str(FICHERO_DATOS)], check=True)
    VERSION_DATOS.write_text(version_actual)


def instalar_dependencias_frontend(frontend: Path) -> None:
    """npm install la primera vez y cada vez que cambie package-lock.json (p. ej. tras un pull)."""
    marca = frontend / "node_modules" / ".sio-dependencias"
    version = huella(frontend / "package.json", frontend / "package-lock.json")
    if marca.exists() and marca.read_text().strip() == version:
        return
    primera = not (frontend / "node_modules").exists()
    print(f"• Instalando dependencias del frontend ({'primera vez' if primera else 'han cambiado'})…", flush=True)
    subprocess.run([comando_frontend()[0], "install", "--no-audit", "--no-fund", "--loglevel=error"], cwd=frontend, check=True)
    marca.write_text(version)


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

    preparar_datos(args.reset)

    # --- Backend
    if responde(BACKEND_URL):
        print("• Backend ya estaba en marcha (7070).")
    else:
        print("• Arrancando backend (compila con Maven la primera vez, puede tardar)…")
        backend = lanzar(comando_backend(), LOGS / "backend.log", RAIZ)
        procesos["backend"] = backend.pid
        PIDS.write_text(json.dumps(procesos, indent=2))
        # La primera vez puede descargar Maven y las dependencias: margen amplio
        if not esperar(BACKEND_URL, "el backend", 600, backend):
            sys.exit(f"El backend no arrancó. Revisa {LOGS / 'backend.log'}")

    # --- Frontend
    if responde(FRONTEND_URL):
        print("• Frontend ya estaba en marcha (4200).")
    else:
        frontend = RAIZ / "frontend"
        comprobar_node()
        instalar_dependencias_frontend(frontend)
        print("• Arrancando frontend…")
        proceso_front = lanzar(comando_frontend(), LOGS / "frontend.log", frontend)
        procesos["frontend"] = proceso_front.pid
        PIDS.write_text(json.dumps(procesos, indent=2))
        if not esperar(FRONTEND_URL, "el frontend", 300, proceso_front):
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
