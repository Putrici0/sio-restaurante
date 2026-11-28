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
from __future__ import annotations

import argparse
import hashlib
import json
import os
import socket
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

PUERTO_BACKEND = 7070          # fijo: el frontend llama a la API en este puerto
PUERTO_FRONTEND = 4200         # preferido; si lo usa otra aplicación se elige el siguiente libre


def leer(url: str) -> str | None:
    try:
        with urllib.request.urlopen(url, timeout=2) as r:
            return r.read(200_000).decode("utf-8", "replace") if r.status < 500 else None
    except Exception:
        return None


def es_nuestro_backend() -> bool:
    """El backend de Sakura Hanami (no otra aplicación que use el mismo puerto)."""
    datos = leer(f"http://127.0.0.1:{PUERTO_BACKEND}/platos")
    return bool(datos) and "buffet-cena" in datos


def es_nuestro_frontend(puerto: int) -> bool:
    for host in ("127.0.0.1", "[::1]"):
        html = leer(f"http://{host}:{puerto}/")
        if html and "Sakura Hanami" in html:
            return True
    return False


def puerto_ocupado(puerto: int) -> bool:
    """¿Escucha algo en el puerto, por IPv4 o por IPv6? (localhost puede ir a cualquiera de los dos)."""
    for familia, host in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")):
        try:
            with socket.socket(familia, socket.SOCK_STREAM) as s:
                s.settimeout(0.5)
                if s.connect_ex((host, puerto)) == 0:
                    return True
        except OSError:
            pass
    return False


def elegir_puerto_frontend(anterior: int | None) -> int:
    for puerto in [p for p in (anterior, PUERTO_FRONTEND) if p] + list(range(PUERTO_FRONTEND + 1, PUERTO_FRONTEND + 20)):
        if not puerto_ocupado(puerto):
            return puerto
    sys.exit("No hay ningún puerto libre entre 4200 y 4219 para el frontend.")


def esperar(comprobar, nombre: str, segundos: int, proceso=None) -> bool:
    print(f"  Esperando a que {nombre} responda", end="", flush=True)
    limite = time.time() + segundos
    while time.time() < limite:
        if comprobar():
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


def npm() -> str:
    ruta = shutil.which("npm.cmd" if ES_WINDOWS else "npm") or shutil.which("npm")
    if not ruta:
        sys.exit("No se encuentra npm. Instala Node.js (https://nodejs.org).")
    return ruta


def comando_frontend(puerto: int):
    # Mismo servidor que «npm start», pero en el puerto elegido
    return [npm(), "exec", "--", "ng", "serve", "--host", "0.0.0.0", "--port", str(puerto)]


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

    if es_nuestro_backend():
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
    subprocess.run([npm(), "install", "--no-audit", "--no-fund", "--loglevel=error"], cwd=frontend, check=True)
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

    # --- Backend (puerto fijo: lo usa el frontend)
    if es_nuestro_backend():
        print(f"• Backend ya estaba en marcha ({PUERTO_BACKEND}).")
    else:
        if puerto_ocupado(PUERTO_BACKEND):
            sys.exit(f"El puerto {PUERTO_BACKEND} lo está usando otra aplicación. Ciérrala y vuelve a ejecutar "
                     "python iniciar.py (el backend de Sakura Hanami necesita ese puerto).")
        print("• Arrancando backend (compila con Maven la primera vez, puede tardar)…")
        backend = lanzar(comando_backend(), LOGS / "backend.log", RAIZ)
        procesos["backend"] = backend.pid
        PIDS.write_text(json.dumps(procesos, indent=2))
        # La primera vez puede descargar Maven y las dependencias: margen amplio
        if not esperar(es_nuestro_backend, "el backend", 600, backend):
            sys.exit(f"El backend no arrancó. Revisa {LOGS / 'backend.log'}")

    # --- Frontend (4200 o, si otra aplicación lo usa, el siguiente libre)
    puerto = procesos.get("puertoFrontend")
    if puerto and es_nuestro_frontend(puerto):
        print(f"• Frontend ya estaba en marcha ({puerto}).")
    elif es_nuestro_frontend(PUERTO_FRONTEND):
        puerto = PUERTO_FRONTEND
        print(f"• Frontend ya estaba en marcha ({puerto}).")
    else:
        frontend = RAIZ / "frontend"
        comprobar_node()
        instalar_dependencias_frontend(frontend)
        puerto = elegir_puerto_frontend(None)
        if puerto != PUERTO_FRONTEND:
            print(f"  El puerto {PUERTO_FRONTEND} lo usa otra aplicación: el frontend usará el {puerto}.")
        print("• Arrancando frontend…")
        proceso_front = lanzar(comando_frontend(puerto), LOGS / "frontend.log", frontend)
        procesos["frontend"] = proceso_front.pid
        procesos["puertoFrontend"] = puerto
        PIDS.write_text(json.dumps(procesos, indent=2))
        if not esperar(lambda: es_nuestro_frontend(puerto), "el frontend", 300, proceso_front):
            sys.exit(f"El frontend no arrancó. Revisa {LOGS / 'frontend.log'}")

    procesos["puertoFrontend"] = puerto
    PIDS.write_text(json.dumps(procesos, indent=2))

    web = f"http://localhost:{puerto}"
    print("\nTodo listo:")
    print(f"  Web pública ........ {web}/")
    print(f"  Sala y gerencia .... {web}/mesas")
    print(f"  Cocina ............. {web}/cocina")
    print(f"  Móvil del camarero . {web}/camarero  (camarero1 / sakura)")
    print(f"  API ................ http://localhost:{PUERTO_BACKEND}/")
    print("\nPara pararlo todo:  python detener.py")
    if not args.sin_navegador:
        webbrowser.open(f"{web}/mesas")


if __name__ == "__main__":
    main()
