"""Genera backend/src/main/resources/datos-iniciales.json: los datos de la demo de SIGO-RSH.

Restaurante Sakura Hanami (buffet libre japonés, 15 mesas): carta, mesas, personal,
reservas e histórico de las últimas 3 semanas de almuerzos y cenas, más un servicio
en curso hoy para que todas las pantallas tengan contenido.

Uso:  python backend/scripts/generar_datos_demo.py
"""
import hashlib
import json
import random
import unicodedata
import uuid
from datetime import datetime, timedelta, time, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ZONA = ZoneInfo("Atlantic/Canary")
random.seed(2026)
SALIDA = Path(__file__).resolve().parents[1] / "src" / "main" / "resources" / "datos-iniciales.json"
IMAGENES = Path(__file__).resolve().parents[2] / "frontend" / "public" / "platos"
EMOJIS = {'Edamame': '🫛', 'Sopa de miso': '🍲', 'Gyozas de pollo': '🥟', 'Ensalada de algas wakame': '🥗', 'Harumaki': '🌯', 'Takoyaki': '🐙', 'Nigiri de salmón': '🍣', 'Nigiri de atún': '🍣', 'Maki de pepino': '🥒', 'California roll': '🍱', 'Uramaki Sakura': '🌸', 'Sashimi variado': '🐟', 'Temaki de salmón': '🍙', 'Tempura de langostinos': '🍤', 'Yakisoba': '🍜', 'Ramen tonkotsu': '🍜', 'Pollo teriyaki': '🍗', 'Yakitori': '🍢', 'Arroz frito japonés': '🍚', 'Mochi variado': '🍡', 'Dorayaki': '🥞', 'Helado de té matcha': '🍨', 'Tarta de queso japonesa': '🍰', 'Agua mineral': '💧', 'Té verde': '🍵', 'Ramune': '🫧', 'Refresco de cola': '🥤', 'Cerveza Asahi': '🍺', 'Sake': '🍶'}
FONDOS = {"Entrante": ("#fde8ec", "#f9cfd8"), "Principal": ("#fff1e6", "#fbd9c4"),
          "Postre": ("#f1ecfb", "#ddd0f5"), "Bebida": ("#e8f4f1", "#c9e6de")}


def ilustracion(nombre, categoria):
    """Ilustracion SVG local del plato (sin depender de servicios externos)."""
    a, b = FONDOS[categoria]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220">'
            f'<defs><radialGradient id="g" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="{a}"/>'
            f'<stop offset="1" stop-color="{b}"/></radialGradient></defs>'
            f'<rect width="320" height="220" fill="url(#g)"/>'
            f'<circle cx="270" cy="40" r="6" fill="#f3a5b8" opacity=".7"/><circle cx="40" cy="180" r="4" fill="#f3a5b8" opacity=".6"/>'
            f'<ellipse cx="160" cy="158" rx="78" ry="14" fill="#000" opacity=".06"/>'
            f'<text x="160" y="140" font-size="96" text-anchor="middle">{EMOJIS.get(nombre, "🍽")}</text></svg>')


def uid(prefijo):
    return f"{prefijo}-{uuid.UUID(int=random.getrandbits(128)).hex[:12]}"


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha(t):
    return hashlib.sha256(t.encode()).hexdigest()


# ------------------------------------------------------------------ carta
CARTA = [
    ("Edamame", "Entrante", "Vainas de soja verde al vapor con sal en escamas", 3.50, "edamame", 6),
    ("Sopa de miso", "Entrante", "Caldo dashi con miso, tofu, wakame y cebollino", 3.20, "miso,soup", 5),
    ("Gyozas de pollo", "Entrante", "Empanadillas japonesas a la plancha con salsa ponzu (6 uds.)", 5.50, "gyoza", 9),
    ("Ensalada de algas wakame", "Entrante", "Algas wakame con sésamo tostado y aliño de vinagre de arroz", 4.50, "seaweed,salad", 4),
    ("Harumaki", "Entrante", "Rollitos crujientes de verduras con salsa agridulce (4 uds.)", 4.20, "spring,roll", 5),
    ("Takoyaki", "Entrante", "Bolitas de pulpo con salsa okonomi, mayonesa japonesa y katsuobushi", 5.80, "takoyaki", 3),
    ("Nigiri de salmón", "Principal", "Arroz de sushi con lámina de salmón fresco (2 uds.)", 3.80, "nigiri,salmon", 12),
    ("Nigiri de atún", "Principal", "Arroz de sushi con atún rojo (2 uds.)", 4.20, "nigiri,tuna", 7),
    ("Maki de pepino", "Principal", "Rollito fino de alga nori, arroz y pepino (6 uds.)", 3.50, "maki,sushi", 3),
    ("California roll", "Principal", "Uramaki de surimi, aguacate y pepino con sésamo (8 uds.)", 6.50, "california,roll", 9),
    ("Uramaki Sakura", "Principal", "Especialidad de la casa: salmón, aguacate y queso crema cubierto de salmón flambeado (8 uds.)", 8.90, "uramaki,sushi", 11),
    ("Sashimi variado", "Principal", "Láminas de salmón, atún y pez mantequilla (9 piezas)", 9.50, "sashimi", 6),
    ("Temaki de salmón", "Principal", "Cono de alga nori relleno de arroz, salmón y aguacate", 4.80, "temaki", 4),
    ("Tempura de langostinos", "Principal", "Langostinos en tempura ligera con salsa tentsuyu (5 uds.)", 7.50, "tempura,shrimp", 8),
    ("Yakisoba", "Principal", "Fideos salteados al wok con verduras, pollo y salsa yakisoba", 7.80, "yakisoba,noodles", 6),
    ("Ramen tonkotsu", "Principal", "Caldo de cerdo cremoso con fideos, chashu, huevo marinado y nori", 10.50, "ramen", 5),
    ("Pollo teriyaki", "Principal", "Muslo de pollo a la plancha glaseado con salsa teriyaki y arroz", 8.50, "teriyaki,chicken", 6),
    ("Yakitori", "Principal", "Brochetas de pollo y puerro a la brasa con salsa tare (3 uds.)", 6.20, "yakitori", 5),
    ("Arroz frito japonés", "Principal", "Yakimeshi salteado con huevo, verduras y salsa de soja", 5.90, "fried,rice", 4),
    ("Mochi variado", "Postre", "Pastelitos de arroz glutinoso rellenos de helado: té verde, fresa y mango (3 uds.)", 4.50, "mochi", 7),
    ("Dorayaki", "Postre", "Bizcochitos esponjosos rellenos de pasta dulce de judía roja", 3.80, "dorayaki", 3),
    ("Helado de té matcha", "Postre", "Helado artesano de té verde matcha", 3.50, "matcha,icecream", 5),
    ("Tarta de queso japonesa", "Postre", "Cheesecake estilo japonés, ligera y esponjosa", 4.90, "japanese,cheesecake", 2),
    ("Agua mineral", "Bebida", "Botella de agua mineral de 50 cl", 1.50, "water,bottle", 9),
    ("Té verde", "Bebida", "Tetera de té verde japonés sencha", 2.20, "green,tea", 6),
    ("Ramune", "Bebida", "Refresco japonés con canica, sabor original", 3.00, "ramune,soda", 4),
    ("Refresco de cola", "Bebida", "Refresco de cola en lata", 2.20, "coke,soft-drink", 6),
    ("Cerveza Asahi", "Bebida", "Cerveza japonesa Asahi Super Dry 33 cl", 3.50, "japanese,beer", 6),
    ("Sake", "Bebida", "Copa de sake servido frío o caliente", 4.50, "sake", 2),
]

platos, pesos = [], []
for i, (nombre, cat, desc, precio, tag, peso) in enumerate(CARTA, start=1):
    platos.append({
        "id": f"plato-{i:02d}", "nombre": nombre, "categoria": cat, "descripcion": desc,
        "precio": precio, "estaActivo": True,
        "imagen": f"/platos/plato-{i:02d}.svg",
    })
    IMAGENES.mkdir(parents=True, exist_ok=True)
    (IMAGENES / f"plato-{i:02d}.svg").write_text(ilustracion(nombre, cat), encoding="utf-8")
    pesos.append(peso)
por_categoria = {c: [(p, w) for p, w in zip(platos, pesos) if p["categoria"] == c]
                 for c in ("Entrante", "Principal", "Postre", "Bebida")}

# ------------------------------------------------------------------ mesas (15)
CAPACIDADES = [2, 4, 2, 4, 4, 4, 2, 4, 2, 4, 4, 4, 4, 6, 6]
mesas = [{"id": str(i), "capacidad": c, "mesasUnidas": [str(i)], "sucia": False}
         for i, c in enumerate(CAPACIDADES, start=1)]
mesa_por_id = {m["id"]: m for m in mesas}

# ------------------------------------------------------------------ personal
ahora = datetime.now(ZONA).replace(second=0, microsecond=0)
alta = iso(ahora - timedelta(days=120))
usuarios = [
    {"id": "usr-gerente", "username": "gerente", "nombre": "Gerencia Sakura Hanami", "passwordHash": sha("sakura"), "rol": "Gerente", "fechaCreacion": alta},
    {"id": "usr-encargado", "username": "encargado", "nombre": "Encargado de sala", "passwordHash": sha("sakura"), "rol": "Camarero", "fechaCreacion": alta},
    {"id": "usr-camarero1", "username": "camarero1", "nombre": "Camarero 1", "passwordHash": sha("sakura"), "rol": "Camarero", "fechaCreacion": alta},
    {"id": "usr-camarero2", "username": "camarero2", "nombre": "Camarero 2", "passwordHash": sha("sakura"), "rol": "Camarero", "fechaCreacion": alta},
    {"id": "usr-cocina", "username": "cocina", "nombre": "Jefe de cocina", "passwordHash": sha("sakura"), "rol": "Cocinero", "fechaCreacion": alta},
]

cuentas, pedidos, ordenes = [], [], []


def cuenta_snapshot(c):
    # Copia reducida de la cuenta dentro de cada pedido (los servicios consultan la cuenta completa por id)
    return {"id": c["id"], "mesas": c["mesas"], "payed": c["payed"], "fechaCreacion": c["fechaCreacion"]}


def plato_snapshot(p):
    return {"id": p["id"], "nombre": p["nombre"], "categoria": p["categoria"], "precio": p["precio"], "estaActivo": True}


def pedido_snapshot(p):
    return {"id": p["id"], "cuenta": p["cuenta"], "fechaPedido": p["fechaPedido"]}


def elegir_platos(n_comensales):
    lineas = []
    for cat, por_persona in (("Bebida", 0.9), ("Entrante", 0.8), ("Principal", 1.8), ("Postre", 0.4)):
        n = max(0, round(random.gauss(por_persona * n_comensales, 0.8)))
        opciones = por_categoria[cat]
        for _ in range(n):
            lineas.append(random.choices([p for p, _ in opciones], [w for _, w in opciones])[0])
    return lineas or [por_categoria["Principal"][0][0]]


def crear_sesion(mesa, inicio, duracion_min, estado_sesion, metodo=None):
    """estado_sesion: 'pagada' | 'ocupada' | 'pendiente-cobro'"""
    fin = inicio + timedelta(minutes=duracion_min)
    pagada = estado_sesion == "pagada"
    cuenta = {
        "id": uid("cta"), "mesas": [mesa], "payed": pagada, "reserva": None,
        "fechaCreacion": iso(inicio), "fechaPago": iso(fin) if pagada else None,
        "password": "" if pagada else str(random.randint(1000, 9999)),
        "metodoPago": metodo if pagada else None,
        "cobroSolicitado": estado_sesion != "ocupada",
    }
    cuentas.append(cuenta)
    comensales = max(1, min(mesa["capacidad"], round(random.gauss(mesa["capacidad"] * 0.8, 0.8))))
    lineas = elegir_platos(comensales)
    rondas = 3 if len(lineas) > 6 else 2
    for r in range(rondas):
        t_pedido = inicio + timedelta(minutes=5 + r * (duracion_min - 15) / max(1, rondas))
        pedido = {"id": uid("ped"), "cuenta": cuenta_snapshot(cuenta), "pedidoEstado": "Listo", "fechaPedido": iso(t_pedido)}
        pedidos.append(pedido)
        for plato in lineas[r::rondas]:
            if estado_sesion == "ocupada" and r == rondas - 1:
                estado = random.choice(["Pendiente", "Pendiente", "Preparación", "Listo"])
                pedido["pedidoEstado"] = "Pendiente"
            else:
                estado = "Entregado"
            ordenes.append({
                "id": uid("ord"), "pedido": pedido_snapshot(pedido), "plato": plato_snapshot(plato), "precio": plato["precio"],
                "ordenEstado": estado, "fecha": iso(t_pedido + timedelta(seconds=random.randint(0, 90))),
                "detalles": "", "pagada": pagada, "fechaPago": iso(fin) if pagada else None,
                "metodoPago": metodo if pagada else None,
            })
    return cuenta


# ------------------------------------------------------------------ histórico (21 días)
hoy = ahora.date()
for dias_atras in range(21, 0, -1):
    dia = hoy - timedelta(days=dias_atras)
    finde = dia.weekday() >= 4
    for turno_inicio, turno_fin, base in ((time(13, 0), time(15, 30), 9), (time(20, 0), time(22, 45), 11)):
        n_sesiones = base + (5 if finde else 0) + random.randint(-3, 3)
        for _ in range(n_sesiones):
            mesa = random.choice(mesas)
            h0 = datetime.combine(dia, turno_inicio, ZONA)
            ventana = (datetime.combine(dia, turno_fin, ZONA) - h0).seconds // 60
            inicio = h0 + timedelta(minutes=random.randint(0, ventana))
            crear_sesion(mesa, inicio, random.randint(55, 110), "pagada", random.choice(["TARJETA", "TARJETA", "EFECTIVO"]))

# ------------------------------------------------------------------ servicio de hoy
servicio_activo = ahora.hour >= 12
inicio_servicio = ahora - timedelta(minutes=50) if servicio_activo else datetime.combine(hoy, time(13, 10), ZONA)
crear_sesion(mesa_por_id["2"], inicio_servicio, 50, "ocupada")
crear_sesion(mesa_por_id["5"], inicio_servicio + timedelta(minutes=15), 35, "ocupada")
crear_sesion(mesa_por_id["11"], inicio_servicio + timedelta(minutes=25), 25, "ocupada")
crear_sesion(mesa_por_id["14"], inicio_servicio - timedelta(minutes=30), 80, "pendiente-cobro")
mesa_por_id["8"]["sucia"] = True

# ------------------------------------------------------------------ reservas
NOMBRES = ["María Santana", "Carlos Medina", "Laura Rodríguez", "Javier Suárez", "Ana Quintana",
           "Pedro Hernández", "Elena Cabrera", "Sergio Ramírez", "Lucía Domínguez", "Miguel Ojeda"]
reservas = []
for dias, hora, comensales, estado, origen in [
    (0, "14:00", 4, "Confirmado", "web"), (0, "21:00", 2, "Pendiente", "web"), (0, "21:30", 6, "Confirmado", "personal"),
    (1, "13:30", 3, "Pendiente", "web"), (1, "20:30", 5, "Confirmado", "web"), (2, "21:00", 8, "Pendiente", "web"),
    (3, "14:30", 2, "Confirmado", "personal"), (5, "20:00", 4, "Pendiente", "web"), (-1, "21:00", 4, "Finalizado", "web"),
    (-2, "14:00", 2, "Cancelado", "web"),
]:
    nombre = NOMBRES[len(reservas) % len(NOMBRES)]
    reservas.append({
        "id": uid("res"), "nombre": nombre, "telefono": f"6{random.randint(10000000, 99999999)}",
        "email": unicodedata.normalize("NFKD", nombre.split()[0].lower()).encode("ascii", "ignore").decode() + "@ejemplo.com", "fecha": (hoy + timedelta(days=dias)).isoformat(),
        "hora": hora, "comensales": comensales,
        "nota": random.choice(["", "", "Celebración de cumpleaños", "Una persona celíaca", "Necesitamos trona"]),
        "estado": estado, "origen": origen, "fechaCreacion": iso(ahora - timedelta(days=3)),
    })

datos = {
    "mesas": mesas, "platos": platos, "usuarios": usuarios, "reservas": reservas,
    "cuentas": cuentas, "pedidos": pedidos, "ordenes": ordenes, "notificaciones": [],
}
SALIDA.write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"{SALIDA.name}: {len(cuentas)} cuentas, {len(pedidos)} pedidos, {len(ordenes)} órdenes, {len(reservas)} reservas")
