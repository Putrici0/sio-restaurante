#!/usr/bin/env python3
"""
Detiene la demo de SIGO-RSH arrancada con iniciar.py (backend y frontend):

    python detener.py

Antes de apagar el backend le pide que guarde en disco los cambios pendientes.
Si algún proceso se arrancó a mano, también lo localiza por su puerto (7070 y 4200).
"""
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
PUERTOS = {"backend": 7070, "frontend": 4200}


def guardar_datos() -> None:
    try:
        peticion = urllib.request.Request("http://localhost:7070/sistema/guardar", method="POST")
        urllib.request.urlopen(peticion, timeout=5)
        print("• Datos guardados en data/sio-restaurante.json")
    except Exception:
        pass


def pids_en_puerto(puerto: int) -> set[int]:
    """Procesos que escuchan en el puerto indicado."""
    try:
        if ES_WINDOWS:
            salida = subprocess.run(["netstat", "-ano", "-p", "TCP"], capture_output=True, text=True).stdout
            return {int(m.group(1)) for m in re.finditer(rf"[:.]{puerto}\s+\S+\s+LISTENING\s+(\d+)", salida)}
        salida = subprocess.run(["lsof", "-ti", f"tcp:{puerto}", "-sTCP:LISTEN"], capture_output=True, text=True).stdout
        return {int(p) for p in salida.split()}
    except FileNotFoundError:
        return set()


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
    for nombre, puerto in PUERTOS.items():
        objetivos = set(pids_en_puerto(puerto))
        if nombre in registrados:
            objetivos.add(int(registrados[nombre]))
        parado = False
        for pid in objetivos:
            parado = matar(pid) or parado
        estado = "detenido" if parado else "no estaba en marcha"
        print(f"• {nombre.capitalize()} ({puerto}): {estado}")

    PIDS.unlink(missing_ok=True)
    restantes = [n for n, p in PUERTOS.items() if pids_en_puerto(p)]
    if restantes:
        print(f"Aún queda algo escuchando en: {', '.join(restantes)}. Vuelve a ejecutar el script.")
    else:
        print("Todo parado.")


if __name__ == "__main__":
    main()
