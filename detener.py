#!/usr/bin/env python3
"""
Detiene la demo de SIGO-RSH arrancada con iniciar.py (backend y frontend):

    python detener.py

Antes de apagar el backend le pide que guarde en disco los cambios pendientes.
Solo para procesos de Sakura Hanami: los que lanzó iniciar.py y, si se arrancaron a mano,
los que escuchan en sus puertos Y responden como Sakura Hanami. Nunca cierra otras
aplicaciones que usen los mismos puertos.
"""
from __future__ import annotations

import json
import os
import re
import signal
import subprocess
import sys
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
PIDS = RAIZ / ".sio-procesos.json"
ES_WINDOWS = os.name == "nt"
PUERTO_BACKEND = 7070


def leer(url: str) -> str | None:
    try:
        with urllib.request.urlopen(url, timeout=2) as r:
            return r.read(200_000).decode("utf-8", "replace")
    except Exception:
        return None


def guardar_datos() -> None:
    try:
        peticion = urllib.request.Request(f"http://127.0.0.1:{PUERTO_BACKEND}/sistema/guardar", method="POST")
        urllib.request.urlopen(peticion, timeout=5)
        print("• Datos guardados en data/sio-restaurante.json")
    except Exception:
        pass


def es_nuestro(nombre: str, host: str, puerto: int) -> bool:
    """¿Lo que responde en host:puerto es Sakura Hanami?"""
    if nombre == "backend":
        datos = leer(f"http://{host}:{puerto}/platos")
        return bool(datos) and "buffet-cena" in datos
    html = leer(f"http://{host}:{puerto}/")
    return bool(html) and "Sakura Hanami" in html


def escuchando(puerto: int) -> list[tuple[int, str]]:
    """(pid, host para probarlo) de cada proceso que escucha en el puerto, por IPv4 o IPv6."""
    resultado = []
    try:
        if ES_WINDOWS:
            salida = subprocess.run(["netstat", "-ano", "-p", "TCP"], capture_output=True, text=True).stdout
            salida += subprocess.run(["netstat", "-ano", "-p", "TCPv6"], capture_output=True, text=True).stdout
            for m in re.finditer(rf"(\S+):{puerto}\s+\S+\s+LISTENING\s+(\d+)", salida):
                resultado.append((int(m.group(2)), "[::1]" if m.group(1).startswith("[") else "127.0.0.1"))
            return resultado
        for comando in (["lsof", "-nP", f"-iTCP:{puerto}", "-sTCP:LISTEN", "-Fpn"],):
            r = subprocess.run(comando, capture_output=True, text=True)
            pid = None
            for linea in r.stdout.splitlines():
                if linea.startswith("p"):
                    pid = int(linea[1:])
                elif linea.startswith("n") and pid:
                    resultado.append((pid, "[::1]" if linea[1:].startswith("[") else "127.0.0.1"))
            return resultado
    except FileNotFoundError:
        pass
    # Linux sin lsof: ss
    try:
        r = subprocess.run(["ss", "-Hltnp", f"sport = :{puerto}"], capture_output=True, text=True)
        for linea in r.stdout.splitlines():
            host = "[::1]" if "[" in linea.split()[3] else "127.0.0.1"
            resultado += [(int(p), host) for p in re.findall(r"pid=(\d+)", linea)]
    except (FileNotFoundError, IndexError):
        pass
    return resultado


def matar(pid: int) -> bool:
    """Termina el proceso y todos sus hijos (Maven/Java, npm/Angular)."""
    try:
        if ES_WINDOWS:
            r = subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, text=True)
            return r.returncode == 0
        os.killpg(os.getpgid(pid), signal.SIGTERM)
        return True
    except (ProcessLookupError, PermissionError, OSError):
        return False


def main() -> None:
    # Consola de Windows: permitir emojis y tildes
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print("🌸 Deteniendo SIGO-RSH…")
    guardar_datos()

    registrados = json.loads(PIDS.read_text()) if PIDS.exists() else {}
    puertos = {"backend": PUERTO_BACKEND, "frontend": int(registrados.get("puertoFrontend") or 4200)}

    for nombre, puerto in puertos.items():
        # Lo que lanzó iniciar.py, más lo que escucha en el puerto y es de verdad Sakura Hanami
        objetivos = {pid for pid, host in escuchando(puerto) if es_nuestro(nombre, host, puerto)}
        if registrados.get(nombre):
            objetivos.add(int(registrados[nombre]))
        parado = False
        for pid in objetivos:
            parado = matar(pid) or parado
        print(f"• {nombre.capitalize()} ({puerto}): {'detenido' if parado else 'no estaba en marcha'}")
        ajenos = [pid for pid, host in escuchando(puerto) if not es_nuestro(nombre, host, puerto)]
        if ajenos:
            print(f"  (en el puerto {puerto} sigue otra aplicación que no es Sakura Hanami: no se ha tocado)")

    PIDS.unlink(missing_ok=True)
    restantes = [n for n, p in puertos.items() if any(es_nuestro(n, h, p) for _, h in escuchando(p))]
    if restantes:
        print(f"Aún queda algo de Sakura Hanami en marcha: {', '.join(restantes)}. Vuelve a ejecutar el script.")
    else:
        print("Todo parado.")


if __name__ == "__main__":
    main()
