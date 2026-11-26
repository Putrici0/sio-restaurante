"""Genera backend/src/main/resources/datos-iniciales.json: los datos de la demo de SIGO-RSH.

Restaurante Sakura Hanami (buffet libre japonés, 15 mesas): carta, mesas, personal,
reservas e histórico de las últimas 5 semanas de almuerzos y cenas, más un servicio
en curso hoy para que todas las pantallas tengan contenido.

Uso:  python backend/scripts/generar_datos_demo.py [--salida RUTA]
      (por defecto actualiza la semilla; iniciar.py --reset lo usa para escribir data/sio-restaurante.json)
"""
import argparse
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
_parser = argparse.ArgumentParser(description="Genera los datos de la demo de SIGO-RSH")
_parser.add_argument("--salida", type=Path, default=None, help="fichero JSON a escribir")
_SEMILLA = Path(__file__).resolve().parents[1] / "src" / "main" / "resources" / "datos-iniciales.json"
SALIDA = _parser.parse_args().salida or _SEMILLA
IMAGENES = Path(__file__).resolve().parents[2] / "frontend" / "public" / "platos"
EMOJIS = {}
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
# Carta modelada sobre los buffets japoneses "a la carta" reales de Canarias y la Península
# (p. ej. 17,90 € mediodía L-V y 22,90 € noche/fin de semana; bebida y postre aparte).
# (nombre, categoría, descripción, precio, emoji, popularidad)
# La comida (Entrante y Principal) va incluida en la tarifa; postres y bebidas se cobran aparte.
CARTA = [
    # --- Entrantes, ensaladas, sopas y fritos (incluidos)
    ("Edamame", "Entrante", "Vainas de soja verde al vapor con sal en escamas", 0, "🫛", 7),
    ("Sopa de miso", "Entrante", "Caldo dashi con miso, tofu, wakame y cebollino", 0, "🍲", 6),
    ("Ensalada de algas wakame", "Entrante", "Algas wakame con sésamo tostado y aliño de vinagre de arroz", 0, "🥗", 5),
    ("Ensalada de cangrejo", "Entrante", "Kanikama, pepino, mango y mayonesa japonesa", 0, "🥗", 5),
    ("Ensalada de salmón y aguacate", "Entrante", "Salmón, aguacate, mezclum y salsa de sésamo", 0, "🥗", 4),
    ("Gyozas de pollo", "Entrante", "Empanadillas a la plancha con salsa ponzu (4 uds.)", 0, "🥟", 9),
    ("Gyozas de langostino", "Entrante", "Empanadillas de langostino al vapor (4 uds.)", 0, "🥟", 7),
    ("Gyozas de verduras", "Entrante", "Empanadillas vegetales a la plancha (4 uds.)", 0, "🥟", 3),
    ("Harumaki", "Entrante", "Rollitos crujientes de verduras con salsa agridulce (2 uds.)", 0, "🌯", 5),
    ("Takoyaki", "Entrante", "Bolitas de pulpo con salsa okonomi, mayonesa y katsuobushi (4 uds.)", 0, "🐙", 4),
    ("Pan bao de panceta", "Entrante", "Bollo al vapor con panceta glaseada, pepino y cebolla crujiente", 0, "🥪", 6),
    ("Karaage", "Entrante", "Pollo frito marinado al estilo japonés con mayonesa de lima", 0, "🍗", 7),
    ("Alitas de pollo teriyaki", "Entrante", "Alitas glaseadas con salsa teriyaki y sésamo (4 uds.)", 0, "🍗", 5),
    ("Langostinos en tempura", "Entrante", "Langostinos en tempura ligera con salsa tentsuyu (3 uds.)", 0, "🍤", 9),
    ("Tempura de verduras", "Entrante", "Calabacín, berenjena, boniato y pimiento en tempura", 0, "🥦", 3),
    ("Calamares en tempura", "Entrante", "Anillas de calamar en tempura con mayonesa picante", 0, "🦑", 4),
    ("Shumai de langostino", "Entrante", "Saquitos de langostino al vapor (3 uds.)", 0, "🥟", 3),
    ("Tartar de salmón", "Entrante", "Salmón picado con aguacate, cebollino y salsa ponzu", 0, "🐟", 6),
    ("Tartar de atún picante", "Entrante", "Atún con salsa picante, aguacate y tobiko", 0, "🐟", 4),
    ("Tataki de atún", "Entrante", "Atún marcado en sésamo con salsa ponzu (5 cortes)", 0, "🐟", 4),
    ("Tataki de salmón", "Entrante", "Salmón marcado con salsa teriyaki y cebolla crujiente", 0, "🐟", 4),
    ("Berenjena con miso", "Entrante", "Nasu dengaku: berenjena asada glaseada con miso dulce", 0, "🍆", 2),
    # --- Sushi (incluido)
    ("Nigiri de salmón", "Principal", "Arroz de sushi con salmón fresco (2 uds.)", 0, "🍣", 12),
    ("Nigiri de atún", "Principal", "Arroz de sushi con atún (2 uds.)", 0, "🍣", 7),
    ("Nigiri de pez mantequilla", "Principal", "Pez mantequilla con escamas de sal (2 uds.)", 0, "🍣", 6),
    ("Nigiri de langostino", "Principal", "Langostino cocido sobre arroz de sushi (2 uds.)", 0, "🍤", 5),
    ("Nigiri de anguila", "Principal", "Anguila glaseada con salsa kabayaki (2 uds.)", 0, "🍣", 4),
    ("Nigiri de salmón flambeado", "Principal", "Salmón flambeado con mayonesa japonesa y teriyaki (2 uds.)", 0, "🔥", 10),
    ("Nigiri de tamago", "Principal", "Tortilla japonesa dulce sobre arroz (2 uds.)", 0, "🥚", 2),
    ("Nigiri de aguacate", "Principal", "Aguacate con sésamo sobre arroz (2 uds.)", 0, "🥑", 3),
    ("Gunkan de salmón", "Principal", "Barquito de nori con salmón picado (2 uds.)", 0, "🍣", 5),
    ("Gunkan de tartar picante", "Principal", "Barquito de nori con tartar de atún picante (2 uds.)", 0, "🌶️", 4),
    ("Gunkan de masago", "Principal", "Barquito de nori con huevas de capelán (2 uds.)", 0, "🍣", 2),
    ("Hosomaki de salmón", "Principal", "Rollito fino de nori con salmón (6 uds.)", 0, "🍣", 7),
    ("Hosomaki de atún", "Principal", "Rollito fino de nori con atún (6 uds.)", 0, "🍣", 4),
    ("Hosomaki de pepino", "Principal", "Rollito fino de nori con pepino (6 uds.)", 0, "🥒", 3),
    ("Hosomaki de aguacate", "Principal", "Rollito fino de nori con aguacate (6 uds.)", 0, "🥑", 3),
    ("Hosomaki de kanikama", "Principal", "Rollito fino de nori con barrita de cangrejo (6 uds.)", 0, "🦀", 3),
    ("California roll", "Principal", "Uramaki de kanikama, aguacate y pepino con sésamo (4 uds.)", 0, "🍱", 8),
    ("Philadelphia roll", "Principal", "Uramaki de salmón, queso crema y aguacate (4 uds.)", 0, "🍱", 8),
    ("Spicy tuna roll", "Principal", "Uramaki de atún picante y cebollino (4 uds.)", 0, "🌶️", 5),
    ("Ebi tempura roll", "Principal", "Uramaki de langostino en tempura, aguacate y teriyaki (4 uds.)", 0, "🍤", 9),
    ("Dragon roll", "Principal", "Langostino tempura cubierto de aguacate y salsa de anguila (4 uds.)", 0, "🐉", 6),
    ("Rainbow roll", "Principal", "California roll cubierto de salmón, atún y pez mantequilla (4 uds.)", 0, "🌈", 5),
    ("Uramaki Sakura", "Principal", "Especialidad de la casa: salmón, aguacate y queso crema cubierto de salmón flambeado (4 uds.)", 0, "🌸", 11),
    ("Crispy roll de salmón", "Principal", "Roll de salmón y queso crema rebozado en panko (4 uds.)", 0, "🍱", 7),
    ("Futomaki", "Principal", "Maki grueso de tortilla, kanikama, pepino y zanahoria (4 uds.)", 0, "🍱", 2),
    ("Temaki de salmón", "Principal", "Cono de nori con arroz, salmón y aguacate", 0, "🍙", 4),
    ("Temaki de atún picante", "Principal", "Cono de nori con atún picante y pepino", 0, "🍙", 2),
    ("Temaki de langostino tempura", "Principal", "Cono de nori con langostino en tempura y mayonesa", 0, "🍙", 3),
    ("Sashimi de salmón", "Principal", "Cortes de salmón fresco (5 cortes)", 0, "🐟", 9),
    ("Sashimi de atún", "Principal", "Cortes de atún (5 cortes)", 0, "🐟", 5),
    ("Sashimi de pez mantequilla", "Principal", "Cortes de pez mantequilla (5 cortes)", 0, "🐟", 4),
    # --- Platos calientes (incluidos)
    ("Yakisoba de pollo", "Principal", "Fideos salteados al wok con verduras, pollo y salsa yakisoba", 0, "🍜", 7),
    ("Yakisoba de langostinos", "Principal", "Fideos salteados al wok con langostinos y verduras", 0, "🍜", 5),
    ("Udon salteado con ternera", "Principal", "Fideos udon al wok con ternera y salsa de soja", 0, "🍜", 4),
    ("Ramen tonkotsu", "Principal", "Caldo de cerdo cremoso con fideos, chashu, huevo marinado y nori (media ración)", 0, "🍜", 5),
    ("Arroz frito japonés", "Principal", "Yakimeshi salteado con huevo, verduras y salsa de soja", 0, "🍚", 6),
    ("Arroz blanco", "Principal", "Cuenco de arroz japonés al vapor", 0, "🍚", 3),
    ("Pollo teriyaki", "Principal", "Muslo de pollo a la plancha glaseado con salsa teriyaki", 0, "🍗", 7),
    ("Salmón teriyaki", "Principal", "Lomo de salmón a la plancha con salsa teriyaki", 0, "🐟", 6),
    ("Ternera yakiniku", "Principal", "Ternera salteada con cebolla y salsa yakiniku", 0, "🥩", 5),
    ("Yakitori", "Principal", "Brochetas de pollo y puerro a la brasa con salsa tare (2 uds.)", 0, "🍢", 5),
    ("Pollo katsu", "Principal", "Pechuga empanada en panko con salsa tonkatsu", 0, "🍛", 4),
    ("Tonkatsu", "Principal", "Lomo de cerdo empanado en panko con salsa tonkatsu", 0, "🍛", 3),
    ("Langostinos a la plancha", "Principal", "Langostinos a la plancha con ajo y salsa de soja", 0, "🍤", 5),
    ("Calamar a la plancha", "Principal", "Calamar a la plancha con salsa teriyaki y sésamo", 0, "🦑", 3),
    # --- Postres (se cobran aparte)
    ("Mochi variado", "Postre", "Pastelitos de arroz rellenos de helado: té verde, fresa y mango (3 uds.)", 4.50, "🍡", 9),
    ("Dorayaki", "Postre", "Bizcochitos esponjosos rellenos de pasta dulce de judía roja", 3.90, "🥞", 3),
    ("Helado de té matcha", "Postre", "Helado artesano de té verde matcha (2 bolas)", 3.90, "🍨", 5),
    ("Tarta de queso japonesa", "Postre", "Cheesecake estilo japonés, ligera y esponjosa", 4.90, "🍰", 6),
    ("Helado frito en tempura", "Postre", "Bola de helado de vainilla en tempura crujiente", 4.90, "🍨", 6),
    ("Coulant de chocolate", "Postre", "Bizcocho de chocolate fundido con helado de vainilla", 5.50, "🍫", 5),
    ("Fruta natural de temporada", "Postre", "Piña, mango y fresas cortados al momento", 3.50, "🍍", 3),
    ("Helado artesano", "Postre", "Dos bolas a elegir: vainilla, fresa o chocolate", 3.90, "🍦", 4),
    # --- Bebidas (se cobran aparte, precios con IGIC)
    ("Agua mineral 50 cl", "Bebida", "Agua mineral natural en botella de 50 cl", 2.20, "💧", 0),
    ("Agua con gas 50 cl", "Bebida", "Agua mineral con gas en botella de 50 cl", 2.50, "🫧", 0),
    ("Agua mineral 1,5 l", "Bebida", "Botella grande de agua mineral para compartir", 3.90, "💧", 0),
    ("Coca-Cola", "Bebida", "Refresco de cola, lata de 33 cl", 2.80, "🥤", 0),
    ("Coca-Cola Zero", "Bebida", "Refresco de cola sin azúcar, lata de 33 cl", 2.80, "🥤", 0),
    ("Fanta de naranja", "Bebida", "Refresco de naranja, lata de 33 cl", 2.80, "🍊", 0),
    ("Fanta de limón", "Bebida", "Refresco de limón, lata de 33 cl", 2.80, "🍋", 0),
    ("Nestea", "Bebida", "Té frío al limón, lata de 33 cl", 2.80, "🧊", 0),
    ("Zumo de naranja natural", "Bebida", "Zumo de naranja recién exprimido", 3.50, "🍊", 0),
    ("Ramune", "Bebida", "Refresco japonés con canica, sabor original", 3.90, "🫧", 0),
    ("Té verde japonés", "Bebida", "Tetera de té verde sencha", 2.50, "🍵", 0),
    ("Matcha latte frío", "Bebida", "Té matcha con leche y hielo", 3.50, "🍵", 0),
    ("Café solo", "Bebida", "Café espresso", 1.50, "☕", 0),
    ("Café cortado", "Bebida", "Espresso con un poco de leche", 1.60, "☕", 0),
    ("Café con leche", "Bebida", "Café con leche caliente", 1.80, "☕", 0),
    ("Caña de cerveza", "Bebida", "Cerveza de barril Tropical, 25 cl", 2.30, "🍺", 0),
    ("Cerveza Dorada 33 cl", "Bebida", "Cerveza canaria en botellín", 2.80, "🍺", 0),
    ("Cerveza sin alcohol", "Bebida", "Botellín de cerveza sin alcohol 33 cl", 2.80, "🍺", 0),
    ("Asahi Super Dry", "Bebida", "Cerveza japonesa, botella de 33 cl", 3.80, "🍺", 0),
    ("Sapporo Premium", "Bebida", "Cerveza japonesa, botella de 33 cl", 3.90, "🍺", 0),
    ("Kirin Ichiban", "Bebida", "Cerveza japonesa, botella de 33 cl", 3.90, "🍺", 0),
    ("Copa de vino blanco", "Bebida", "Vino blanco D.O. Rueda, copa", 3.50, "🥂", 0),
    ("Copa de vino tinto", "Bebida", "Vino tinto D.O. Rioja, copa", 3.50, "🍷", 0),
    ("Tinto de verano", "Bebida", "Vino tinto con gaseosa y hielo", 3.20, "🍷", 0),
    ("Botella de vino blanco Rueda", "Bebida", "Verdejo D.O. Rueda, botella de 75 cl", 16.90, "🍾", 0),
    ("Botella de vino tinto Rioja", "Bebida", "Rioja crianza, botella de 75 cl", 18.90, "🍷", 0),
    ("Botella de Lambrusco", "Bebida", "Lambrusco rosado de aguja, botella de 75 cl", 13.90, "🍾", 0),
    ("Sake", "Bebida", "Tokkuri de sake de 180 ml, frío o caliente", 6.50, "🍶", 0),
    ("Umeshu", "Bebida", "Licor japonés de ciruela con hielo", 4.50, "🥃", 0),
    ("Chupito de licor de lichi", "Bebida", "Licor dulce de lichi, servido frío", 2.50, "🥃", 0),
]
EMOJIS = {nombre: emoji for nombre, _, _, _, emoji, _ in CARTA}

platos, pesos = [], []
for f in IMAGENES.glob("plato-*.svg"):  # se regeneran todas las ilustraciones
    f.unlink()
for i, (nombre, cat, desc, precio, _, peso) in enumerate(CARTA, start=1):
    platos.append({
        "id": f"plato-{i:03d}", "nombre": nombre, "categoria": cat, "descripcion": desc,
        "precio": float(precio), "estaActivo": True, "imagen": f"/platos/plato-{i:03d}.svg",
    })
    IMAGENES.mkdir(parents=True, exist_ok=True)
    (IMAGENES / f"plato-{i:03d}.svg").write_text(ilustracion(nombre, cat), encoding="utf-8")
    pesos.append(peso)
# Tarifas del buffet libre por comensal: mediodía de lunes a viernes; noche, sábados y domingos
TARIFAS = {
    "Almuerzo": ("buffet-almuerzo", "Buffet libre · mediodía (lunes a viernes)", 17.90,
                 "Buffet libre a la carta de lunes a viernes a mediodía. Bebidas y postres no incluidos."),
    "Cena": ("buffet-cena", "Buffet libre · noche, sábados y domingos", 22.90,
             "Buffet libre a la carta por la noche y todo el día sábados y domingos. Bebidas y postres no incluidos."),
}
EMOJIS["Buffet"] = "🍱"
for turno, (tid, tnombre, tprecio, tdesc) in TARIFAS.items():
    platos.append({"id": tid, "nombre": tnombre, "categoria": "Buffet", "descripcion": tdesc,
                   "precio": tprecio, "estaActivo": True, "imagen": "/platos/buffet.svg"})
FONDOS["Buffet"] = ("#fde8ec", "#f9cfd8")
(IMAGENES / "buffet.svg").write_text(ilustracion("Buffet", "Buffet"), encoding="utf-8")
tarifa_por_turno = {t: next(p for p in platos if p["id"] == tid) for t, (tid, *_) in TARIFAS.items()}
plato_por_nombre = {p["nombre"]: p for p in platos}

por_categoria = {c: [(p, w) for p, w in zip(platos, pesos) if p["categoria"] == c]
                 for c in ("Entrante", "Principal", "Postre")}


# ------------------------------------------------------------------ mesas (15)
# Comedor: 15 mesas fijas (no se juntan), 60 plazas
CAPACIDADES = [2, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 8, 8]
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
    return {"id": p["id"], "nombre": p["nombre"], "categoria": p["categoria"], "precio": p["precio"],
            "estaActivo": True, "imagen": p["imagen"]}


def pedido_snapshot(p):
    return {"id": p["id"], "cuenta": p["cuenta"], "fechaPedido": p["fechaPedido"]}


def P(nombre):
    return plato_por_nombre[nombre]


def bebida_principal(turno):
    """Primera bebida de un comensal: en las cenas se pide más cerveza y vino."""
    cena = turno == "Cena"
    opciones = [
        ("Agua mineral 50 cl", 24), ("Agua con gas 50 cl", 3),
        ("Coca-Cola", 11), ("Coca-Cola Zero", 8), ("Fanta de naranja", 4), ("Fanta de limón", 3), ("Nestea", 4),
        ("Zumo de naranja natural", 2), ("Ramune", 3), ("Té verde japonés", 3), ("Matcha latte frío", 1),
        ("Caña de cerveza", 12 if cena else 9), ("Cerveza Dorada 33 cl", 6 if cena else 4),
        ("Cerveza sin alcohol", 2), ("Asahi Super Dry", 8 if cena else 4), ("Sapporo Premium", 3 if cena else 1),
        ("Kirin Ichiban", 2 if cena else 1), ("Copa de vino blanco", 4 if cena else 2),
        ("Copa de vino tinto", 3 if cena else 1), ("Tinto de verano", 2),
    ]
    return P(random.choices([n for n, _ in opciones], [w for _, w in opciones])[0])


def elegir_consumo(n_comensales, turno):
    """Comida (incluida), bebidas y postres (de pago) de una mesa de buffet."""
    cena = turno == "Cena"
    comida = []
    for _ in range(n_comensales):
        # Cada comensal pide de media unas 4-5 raciones (una ración = 2 nigiris, 4 gyozas…)
        n = max(2, round(random.gauss(4.6, 1.1)))
        for _ in range(n):
            cat = "Entrante" if random.random() < 0.36 else "Principal"
            opciones = por_categoria[cat]
            comida.append(random.choices([p for p, _ in opciones], [w for _, w in opciones])[0])

    extras = []
    # Algunas mesas solo piden agua del grifo (gratuita por ley desde 2022): no pagan bebida
    solo_agua_grifo = random.random() < 0.06
    vino_en_botella = not solo_agua_grifo and cena and n_comensales >= 2 and random.random() < 0.14
    if vino_en_botella:
        extras.append(P(random.choice(["Botella de vino blanco Rueda", "Botella de vino blanco Rueda",
                                       "Botella de vino tinto Rioja", "Botella de Lambrusco"])))
    if not solo_agua_grifo and n_comensales >= 4 and random.random() < 0.25:
        extras.append(P("Agua mineral 1,5 l"))
    for _ in range(n_comensales):
        if solo_agua_grifo or (vino_en_botella and random.random() < 0.6):
            pass  # agua del grifo o bebe de la botella de la mesa
        else:
            extras.append(bebida_principal(turno))
        if not solo_agua_grifo and random.random() < (0.6 if cena else 0.4):  # segunda ronda de bebida
            extras.append(bebida_principal(turno))
        if random.random() < 0.3:  # postre (se cobra aparte)
            opciones = por_categoria["Postre"]
            extras.append(random.choices([p for p, _ in opciones], [w for _, w in opciones])[0])
        if random.random() < (0.28 if not cena else 0.14):  # café al terminar
            extras.append(P(random.choice(["Café solo", "Café cortado", "Café cortado", "Café con leche"])))
    if random.random() < (0.10 if cena else 0.04):
        extras.append(P("Sake"))
    if cena and random.random() < 0.06:
        extras.append(P("Umeshu"))
    return comida, extras


def comensales_para(mesa):
    c = mesa["capacidad"]
    if c == 2:
        return random.choices([2, 1], [80, 20])[0]
    return max(1, c - random.choices([0, 1, 2], [55, 30, 15])[0])


def nueva_orden(pedido, plato, momento, estado, pagada, fin, metodo):
    ordenes.append({
        "id": uid("ord"), "pedido": pedido_snapshot(pedido), "plato": plato_snapshot(plato), "precio": plato["precio"],
        "ordenEstado": estado, "fecha": iso(momento), "detalles": "", "pagada": pagada,
        "fechaPago": iso(fin) if pagada else None, "metodoPago": metodo if pagada else None,
    })


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
    comensales = comensales_para(mesa)
    cuenta["comensales"] = comensales
    # Tarifa del buffet: una línea por comensal, cargada al abrir la mesa
    turno = "Cena" if inicio.hour >= 18 else "Almuerzo"
    tarifa = tarifa_por_turno["Cena" if turno == "Cena" or inicio.weekday() >= 5 else "Almuerzo"]
    cubiertos = {"id": uid("ped"), "cuenta": cuenta_snapshot(cuenta), "pedidoEstado": "Listo", "fechaPedido": iso(inicio)}
    pedidos.append(cubiertos)
    for _ in range(comensales):
        nueva_orden(cubiertos, tarifa, inicio, "Entregado", pagada, fin, metodo)

    comida, extras = elegir_consumo(comensales, turno)
    bebidas = [p for p in extras if p["categoria"] == "Bebida"]
    postres = [p for p in extras if p["categoria"] == "Postre"]
    # Rondas: bebidas en la primera, la comida repartida (máx. 5 platos por comensal y ronda), postres al final
    maximo = 5 * comensales
    rondas = [comida[i:i + maximo] for i in range(0, len(comida), maximo)] or [[]]
    rondas[0] = bebidas[: comensales + 1] + rondas[0]
    resto_bebidas = bebidas[comensales + 1:]
    if len(rondas) > 1:
        rondas[-1] = resto_bebidas + rondas[-1]
    else:
        rondas.append(resto_bebidas)
    rondas.append(postres)
    rondas = [r for r in rondas if r]
    for r, lineas in enumerate(rondas):
        t_pedido = inicio + timedelta(minutes=4 + r * (duracion_min - 15) / max(1, len(rondas)))
        pedido = {"id": uid("ped"), "cuenta": cuenta_snapshot(cuenta), "pedidoEstado": "Listo", "fechaPedido": iso(t_pedido)}
        pedidos.append(pedido)
        for plato in lineas:
            if estado_sesion == "ocupada" and r == len(rondas) - 1:
                estado = random.choice(["Pendiente", "Pendiente", "Preparación", "Listo"])
                pedido["pedidoEstado"] = "Pendiente"
            else:
                estado = "Entregado"
            nueva_orden(pedido, plato, t_pedido + timedelta(seconds=random.randint(0, 90)), estado, pagada, fin, metodo)
    return cuenta


# ------------------------------------------------------------------ histórico (35 días)
# Cada mesa encadena sesiones durante el servicio (sin solaparse): se sienta, come ~75 min,
# se cobra y se limpia. La ocupación sube por la noche y en fin de semana.
DIAS_HISTORICO = 35
hoy = ahora.date()
for dias_atras in range(DIAS_HISTORICO, 0, -1):
    dia = hoy - timedelta(days=dias_atras)
    finde = dia.weekday() >= 5
    viernes = dia.weekday() == 4
    for turno, (apertura, ultima_entrada) in (("Almuerzo", (time(13, 0), time(15, 30))), ("Cena", (time(20, 0), time(22, 30)))):
        ocupacion = {("Almuerzo", False): 0.32, ("Cena", False): 0.48}.get((turno, finde), 0.8)
        if viernes and turno == "Cena":
            ocupacion = 0.8
        ocupacion = min(0.95, max(0.2, random.gauss(ocupacion, 0.07)))
        limite = datetime.combine(dia, ultima_entrada, ZONA)
        for mesa in mesas:
            t = datetime.combine(dia, apertura, ZONA) + timedelta(minutes=random.randint(0, 45))
            while t <= limite:
                if random.random() < ocupacion:
                    duracion = int(min(120, max(45, random.gauss(78 if turno == "Cena" else 70, 14))))
                    metodo = random.choices(["TARJETA", "EFECTIVO"], [72, 28])[0]
                    crear_sesion(mesa, t, duracion, "pagada", metodo)
                    t += timedelta(minutes=duracion + random.randint(8, 20))
                else:
                    t += timedelta(minutes=random.randint(25, 50))


# ------------------------------------------------------------------ servicio de hoy
servicio_activo = ahora.hour >= 12
inicio_servicio = ahora - timedelta(minutes=50) if servicio_activo else datetime.combine(hoy, time(13, 10), ZONA)
crear_sesion(mesa_por_id["7"], inicio_servicio, 50, "ocupada")
crear_sesion(mesa_por_id["2"], inicio_servicio + timedelta(minutes=15), 35, "ocupada")
crear_sesion(mesa_por_id["12"], inicio_servicio + timedelta(minutes=25), 25, "ocupada")
crear_sesion(mesa_por_id["15"], inicio_servicio - timedelta(minutes=30), 80, "pendiente-cobro")
mesa_por_id["9"]["sucia"] = True
mesa_por_id["4"]["sucia"] = True

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
SALIDA.parent.mkdir(parents=True, exist_ok=True)
SALIDA.write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"{SALIDA.name}: {len(cuentas)} cuentas, {len(pedidos)} pedidos, {len(ordenes)} órdenes, {len(reservas)} reservas")
