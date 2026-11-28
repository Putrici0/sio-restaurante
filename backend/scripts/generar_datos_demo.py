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
# Carta de Sakura Hanami (cocina de fusión japonesa, china y tailandesa), con los
# nombres, la numeración y los precios publicados en sakurahanami.com. Las descripciones
# son resúmenes propios de los ingredientes.
# Menú Sakura 18,95 € (almuerzos de lunes a jueves) · Menú Deluxe 21,95 € (cenas, viernes,
# fines de semana y festivos) · niños de 100 a 130 cm 10,95 € · bebidas y postres aparte.
POR_UNIDAD = {8, 9, *range(23, 36), 46, 47}

# (número, nombre, descripción)
PLATOS_CARTA = [
    (1, "Carpaccio de atún", "Láminas de atún rojo con tomate cherry, alga y salsa de sésamo"),
    (2, "Carpaccio de salmón picante", "Salmón con cebollino, tobiko, cacahuete y salsa ponzu"),
    (3, "Carpaccio sweet", "Salmón con un toque de cacao y salsa sakura dulce"),
    (4, "Carpaccio de pez limón", "Pez limón con pimiento verde y salsa de wasabi"),
    (5, "Tartar de salmón", "Salmón con puerro crujiente sobre lámina de arroz y ponzu"),
    (6, "Tartar de atún", "Atún rojo picado con puerro crujiente y salsa de sésamo"),
    (7, "Tartar Hawaii", "Tartar con fruta tropical al estilo hawaiano"),
    (8, "Cono kōn de atún", "Cono crujiente de atún, queso crema y perlas de arroz"),
    (9, "Cono kōn de salmón", "Cono crujiente de salmón, queso crema y perlas de arroz"),
    (10, "Crispy taco de atún", "Taco crujiente con tartar de atún, burrata y teriyaki (2 uds.)"),
    (11, "Crispy taco de salmón", "Taco crujiente con tartar de salmón, burrata y teriyaki (2 uds.)"),
    (12, "Gunkan de atún", "Tartar de atún sobre arroz con tobiko y salsa barbacoa japonesa"),
    (13, "Gunkan de salmón", "Tartar de salmón sobre arroz con tobiko y salsa barbacoa"),
    (14, "Nori crujiente", "Alga nori frita con salmón, trufa y queso crema (2 uds.)"),
    (15, "Poke mixto", "Bowl con wakame, tomate, edamame, almendra y pescado a elegir"),
    (16, "Tataki de atún", "Atún marcado con kizami wasabi y salsa del chef"),
    (17, "Tataki de salmón", "Salmón marcado con polvo de shacha y salsa del chef"),
    (18, "Maki de vieira", "Maki de vieira envuelto en aguacate con salsa Hanami (8 uds.)"),
    (19, "Maki yuzu", "Maki de mango, queso crema y perlas de arroz con yuzu (8 uds.)"),
    (20, "Paraíso Sakura", "Atún, salmón, pez limón y carabinero sobre salsa de burrata"),
    (21, "Sashimi mixto crudo", "Vieira, atún, cigala, carabinero, salmón, pez limón y huevas"),
    (22, "Volcán de mango", "Aguacate y mango en forma de volcán (8 uds.)"),
    (23, "Nigiri de anguila", "Anguila caramelizada con su salsa"),
    (24, "Nigiri de atún", "Arroz con un corte de atún rojo"),
    (25, "Nigiri de gamba", "Arroz con gamba"),
    (26, "Nigiri de pez limón", "Arroz con pez limón"),
    (27, "Nigiri de pulpo", "Arroz con pulpo y salsa de la casa"),
    (28, "Nigiri de salmón", "Arroz con salmón noruego"),
    (29, "Jo Philadelphia", "Arroz envuelto en salmón con queso crema y huevas"),
    (30, "Jo flambé", "Arroz envuelto en salmón flambeado"),
    (31, "Jo raíz de loto", "Raíz de loto crujiente con salmón y queso crema"),
    (32, "Jo de salmón", "Arroz envuelto en salmón relleno de tartar"),
    (33, "Jo tropical", "Arroz envuelto en salmón con mango"),
    (34, "Jo de huevas de salmón", "Arroz coronado con huevas de salmón"),
    (35, "Jo de atún flambeado", "Arroz envuelto en atún flambeado"),
    (36, "Sashimi de atún", "Cortes de atún rojo"),
    (37, "Sashimi de hamachi", "Cortes de hamachi"),
    (38, "Sashimi de pez limón", "Cortes de pez limón"),
    (39, "Sashimi de salmón", "Cortes de salmón noruego"),
    (40, "Hosomaki de atún cocido", "Rollito de atún cocido al estilo Tokio (6 uds.)"),
    (41, "Hosomaki de atún", "Rollito de atún fresco (6 uds.)"),
    (42, "Hosomaki de rábano y pepino", "Rollito vegetal de rábano y pepino (6 uds.)"),
    (43, "Hosomaki de salmón Sakura", "Rollito de salmón cocido al estilo Sakura (6 uds.)"),
    (44, "Hosomaki de salmón", "Rollito de salmón fresco (6 uds.)"),
    (45, "Hosomaki frito de fruta", "Rollito frito de salmón y fruta con frutos del bosque (8 uds.)"),
    (46, "Maki sandwich", "Atún o salmón con kataifi crujiente"),
    (47, "Maki sandwich frito", "Versión frita del maki sandwich"),
    (48, "Hosomaki de fruta", "Rollito de fruta de temporada con frutos del bosque (8 uds.)"),
    (49, "Uramaki de atún", "Atún, aguacate y alga frita con sésamo (4 uds.)"),
    (50, "Uramaki dragón", "Tempura de gamba con teriyaki y kataifi (4 uds.)"),
    (51, "Uramaki Philadelphia", "Salmón y queso crema con huevas (4 uds.)"),
    (52, "Uramaki de pistacho", "Salmón, aguacate y queso crema con salsa de mango y pistacho (4 uds.)"),
    (53, "Uramaki picante de atún", "Atún picante, aguacate y pimiento verde (4 uds.)"),
    (54, "Uramaki tartufo", "Salmón, aguacate y crema de trufa (4 uds.)"),
    (55, "Uramaki Hakone picante", "Salmón, guindilla y aguacate (4 uds.)"),
    (56, "Uramaki Takayama", "Aguacate, salmón y cebolla frita con sésamo (4 uds.)"),
    (57, "Uramaki tempura", "Gamba en tempura con sésamo y teriyaki (4 uds.)"),
    (58, "Uramaki vegetal", "Aguacate, alga, pepino y zanahoria (4 uds.)"),
    (59, "Uramaki Miyama", "Salmón, aguacate, queso crema y puerro frito (4 uds.)"),
    (60, "Uramaki Narai", "Coco, aguacate, salmón y queso crema (4 uds.)"),
    (61, "Uramaki Shirakawa", "Cebolla frita, atún y queso crema (4 uds.)"),
    (62, "Edamame", "Vainas de soja al vapor con sal"),
    (63, "Ensalada furutsu", "Mango, tomate cherry y salsa Hanami"),
    (64, "Pan de gamba frita", "Pan crujiente con sabor a gamba"),
    (65, "Sopa agripicante", "Sopa china ácida y picante"),
    (66, "Sopa de miso", "Caldo de miso japonés"),
    (67, "Wakame", "Ensalada de algas con sésamo"),
    (68, "Ensalada kaisen de marisco", "Algas con pulpo, gambas y pepino"),
    (69, "Empanadilla de carne", "Empanadillas de carne al estilo oriental (4 uds.)"),
    (70, "Empanadilla de gamba al vapor", "Empanadillas de gamba al vapor (4 uds.)"),
    (71, "Gyoza de carne", "Gyozas de carne y verdura (4 uds.)"),
    (72, "Empanadilla de pollo", "Empanadillas de pollo (4 uds.)"),
    (73, "Calamar frito con salsa japonesa", "Anillas de calamar con salsa japonesa"),
    (74, "Gamba empanada", "Gambas con empanado crujiente"),
    (75, "Gamba rebozada", "Gambas en rebozado esponjoso"),
    (76, "Tempura de gambas", "Gambas en tempura con su salsa"),
    (77, "Rollito de primavera", "Rollito crujiente de verduras"),
    (78, "Tempura vegetal", "Verduras en tempura"),
    (79, "Pollo estilo japonés", "Pollo a la japonesa"),
    (80, "Chips", "Patatas chips para compartir"),
    (81, "Takoyaki de calamar", "Bolitas de calamar con salsa takoyaki"),
    (82, "Pan chino", "Pan al vapor tradicional chino"),
    (83, "Pollo empanado", "Pollo empanado con arroz y salsa oriental"),
    (84, "Wantún de carne frito", "Raviolis chinos fritos rellenos de carne"),
    (85, "Empanadilla de curry", "Empanadilla rellena al curry"),
    (86, "Tallarines con marisco", "Tallarines salteados con gambas, calamar y verduras"),
    (87, "Arroz tres delicias", "Arroz salteado con jamón, tortilla y guisantes"),
    (88, "Espagueti de arroz", "Fideos de arroz salteados con verdura y huevo"),
    (89, "Tallarines vegetales", "Tallarines salteados con verduras"),
    (90, "Arroz salteado con gambas", "Arroz salteado con gambas"),
    (91, "Arroz blanco", "Arroz blanco con sésamo"),
    (92, "Arroz especial piña", "Arroz salteado servido en media piña"),
    (93, "Tallarines con ternera y soja", "Tallarines salteados con ternera y salsa de soja"),
    (94, "Pollo al curry", "Pollo en salsa de curry"),
    (95, "Pollo con almendras", "Pollo salteado con almendras"),
    (96, "Pollo salteado con champiñones", "Pollo y champiñones al wok"),
    (97, "Verduras salteadas de temporada", "Verduras de temporada al wok"),
    (98, "Pato Pekín", "Pato a la pequinesa con piel crujiente"),
    (99, "Gambas salteadas", "Gambas salteadas al wok"),
    (100, "Gambas con salsa douchi", "Gambas con salsa de frijol negro fermentado"),
    (101, "Gambas salteadas picantes", "Gambas al wok con salsa picante"),
    (102, "Ternera en salsa Sakura", "Ternera con salsa de la casa"),
    (103, "Solomillo con setas y coñac", "Solomillo a la plancha con setas flambeadas al coñac"),
    (104, "Solomillo salteado sabor Tailandia", "Solomillo con especias tailandesas"),
    (105, "Calamar salteado con salsa douchi", "Calamar al wok con salsa de frijol negro"),
    (106, "Calamar salteado Sichuan picante", "Calamar al wok con picante de Sichuan"),
    (107, "Calamares con salsa de ostras", "Calamares salteados con salsa de ostras"),
    (108, "Gambas a la plancha", "Gambas a la plancha"),
    (109, "Pinchito de pescado japonés", "Pescado blanco marinado a la japonesa"),
    (110, "Pinchito de choco", "Choco marinado a la plancha"),
    (111, "Pincho de pollo", "Pollo marinado con sésamo"),
    (112, "Pincho de gamba", "Gambas marinadas a la plancha"),
    (113, "Pincho de salmón", "Salmón marinado con sésamo"),
    (114, "Pincho de atún", "Atún rojo marinado con soja y sésamo"),
    (115, "Tofu frito con salsa de la casa", "Tofu crujiente salteado, apto para vegetarianos"),
]


def categoria_de(n):
    # Entrantes (62-85); sushi y crudos (1-61) y wok y plancha (86-115) en «Sushi y platos calientes»
    return "Entrante" if 62 <= n <= 85 else "Principal"


def emoji_de(nombre):
    n = nombre.lower()
    for clave, e in [("sopa", "🍲"), ("edamame", "🫛"), ("ensalada", "🥗"), ("wakame", "🥗"), ("poke", "🥗"),
                     ("gyoza", "🥟"), ("empanadilla", "🥟"), ("wantún", "🥟"), ("pan chino", "🥟"), ("pan de gamba", "🍘"),
                     ("chips", "🍟"), ("takoyaki", "🐙"), ("pulpo", "🐙"), ("rollito", "🌯"), ("tempura vegetal", "🥦"),
                     ("verduras", "🥦"), ("tofu", "🧈"), ("pato", "🦆"), ("curry", "🍛"), ("tallarines", "🍜"),
                     ("espagueti", "🍜"), ("piña", "🍍"), ("arroz", "🍚"), ("pollo", "🍗"), ("solomillo", "🥩"),
                     ("ternera", "🥩"), ("calamar", "🦑"), ("choco", "🦑"), ("gamba", "🍤"), ("pincho", "🍢"),
                     ("pinchito", "🍢"), ("cono", "🍦"), ("taco", "🌮"), ("volcán", "🌋"), ("mango", "🥭"),
                     ("fruta", "🍓"), ("sakura", "🌸"), ("paraíso", "🌸"), ("dragón", "🐉"), ("vieira", "🐚"),
                     ("anguila", "🍣"), ("nigiri", "🍣"), ("jo ", "🍣"), ("sashimi", "🐟"), ("tartar", "🐟"),
                     ("tataki", "🐟"), ("carpaccio", "🐟"), ("gunkan", "🍙"), ("nori", "🍙"), ("maki", "🍱")]:
        if clave in n:
            return e
    return "🍣"


def popularidad(nombre):
    n = nombre.lower()
    for clave, peso in [("nigiri de salmón", 12), ("uramaki philadelphia", 10), ("tempura de gambas", 10),
                        ("jo flambé", 9), ("uramaki dragón", 9), ("arroz tres delicias", 9), ("sashimi de salmón", 8),
                        ("crispy taco", 7), ("gyoza", 8), ("pato pekín", 7), ("uramaki", 6), ("jo ", 6), ("nigiri", 6),
                        ("rollito", 6), ("pollo", 5), ("tallarines", 5), ("gamba", 5), ("sashimi", 5), ("tartar", 5),
                        ("edamame", 6), ("sopa de miso", 5), ("hosomaki", 4)]:
        if clave in n:
            return peso
    return 3


CARTA = []
for n, nombre, desc in PLATOS_CARTA:
    nota = " · se sirve por unidad" if n in POR_UNIDAD else ""
    CARTA.append((f"{n}. {nombre}", categoria_de(n), desc + nota, 0, emoji_de(nombre), popularidad(nombre)))

CARTA += [
    # --- Postres (se cobran aparte)
    ("Mochis artesanos", "Postre", "Pastelitos japoneses de arroz rellenos", 4.50, "🍡", 9),
    ("Copa sensación de turrón", "Postre", "Helado de turrón con caramelo y almendra garrapiñada", 4.10, "🍨", 4),
    ("Tarta de queso y dulce de leche", "Postre", "Tarta de queso con dulce de leche", 4.60, "🍰", 6),
    ("Fondant Baileys", "Postre", "Chocolate belga con corazón de Baileys", 4.60, "🍫", 6),
    ("Muerte por chocolate", "Postre", "Tarta de bizcocho y crema de chocolate", 4.60, "🍫", 5),
    ("Crema catalana", "Postre", "Helado de mantecado con yema quemada", 4.60, "🍮", 3),
    ("Copa de limón", "Postre", "Helado y sorbete de limón", 4.10, "🍋", 4),
    ("Tarta de queso con arándanos", "Postre", "Tarta de queso horneada con arándanos", 4.60, "🍰", 5),
    ("Helado de té verde", "Postre", "Helado japonés de té verde", 4.50, "🍵", 6),
    ("Copa helado tricolor con nueces", "Postre", "Tres sabores a elegir con nueces", 4.50, "🍨", 3),
    # --- Cervezas
    ("Mahou Cinco Estrellas", "Bebida", "Cerveza dorada, 5,5 %", 2.55, "🍺", 0),
    ("Mahou Radler", "Bebida", "Cerveza con limón, 3,2 %", 2.55, "🍺", 0),
    ("Alhambra Reserva 1925", "Bebida", "Pilsen bohemia, 6,4 %", 3.20, "🍺", 0),
    ("Alhambra Reserva Roja", "Bebida", "Cerveza bock, 7,2 %", 3.20, "🍺", 0),
    ("1906 Reserva Especial", "Bebida", "Cerveza de maltas tostadas, 6,5 %", 3.15, "🍺", 0),
    ("Estrella Galicia Especial", "Bebida", "Cerveza dorada, 5,5 %", 2.85, "🍺", 0),
    ("Tropical Pilsen", "Bebida", "Cerveza canaria, 4,7 %", 2.85, "🍺", 0),
    ("Tropical Limón", "Bebida", "Cerveza canaria con limón, 2,0 %", 2.85, "🍺", 0),
    ("Dorada Especial", "Bebida", "Cerveza canaria, 5,7 %", 3.15, "🍺", 0),
    ("Heineken", "Bebida", "Cerveza lager, 5,0 %", 2.45, "🍺", 0),
    ("Kirin Ichiban", "Bebida", "Cerveza japonesa premium, 5,0 %", 3.05, "🍺", 0),
    ("Sapporo Premium", "Bebida", "Cerveza japonesa, 4,9 %", 3.15, "🍺", 0),
    # --- Vinos
    ("Copa de vino Rioja", "Bebida", "Blanco o tinto", 3.60, "🍷", 0),
    ("Vino Sakura Hanami", "Bebida", "Tinto Rioja de la casa, botella", 11.10, "🍷", 0),
    ("Ibéricos Crianza", "Bebida", "Tinto Rioja, botella", 15.60, "🍷", 0),
    ("Viña Pomal Crianza", "Bebida", "Tinto Rioja, botella", 16.60, "🍷", 0),
    ("Ramón Bilbao Crianza", "Bebida", "Tinto Rioja, botella", 17.10, "🍷", 0),
    ("Marqués de Riscal", "Bebida", "Tinto Rioja, botella", 25.65, "🍷", 0),
    ("Celeste Roble", "Bebida", "Tinto Ribera del Duero, botella", 16.60, "🍷", 0),
    ("Verdejo D.O. Rueda", "Bebida", "Vino blanco, botella", 15.60, "🥂", 0),
    ("Viña Esmeralda", "Bebida", "Vino blanco D.O. Cataluña, botella", 16.60, "🥂", 0),
    ("Viña Esmeralda 3/8", "Bebida", "Vino blanco D.O. Cataluña, media botella", 9.85, "🥂", 0),
    ("Vino Sushi", "Bebida", "Vino blanco japonés, botella", 13.60, "🥂", 0),
    ("El Grifo", "Bebida", "Vino blanco D.O. Lanzarote, botella", 29.10, "🥂", 0),
    ("Mateus Rosé", "Bebida", "Vino rosado de Portugal, botella", 16.50, "🍾", 0),
    ("Lambrusco", "Bebida", "Vino de aguja italiano, botella", 16.50, "🍾", 0),
    ("Anna de Codorníu", "Bebida", "Cava, botella", 19.30, "🍾", 0),
    # --- Agua, refrescos, café y licores
    ("Agua 50 cl", "Bebida", "Agua mineral", 2.85, "💧", 0),
    ("Coca-Cola", "Bebida", "Refresco", 2.85, "🥤", 0),
    ("Coca-Cola Zero", "Bebida", "Refresco sin azúcar", 2.85, "🥤", 0),
    ("Fanta de naranja", "Bebida", "Refresco", 2.85, "🍊", 0),
    ("Fanta de limón", "Bebida", "Refresco", 2.85, "🍋", 0),
    ("Nestea", "Bebida", "Té frío al limón", 2.85, "🧊", 0),
    ("Aquarius", "Bebida", "Bebida isotónica", 2.85, "🥤", 0),
    ("Appletiser", "Bebida", "Zumo de manzana con gas", 2.85, "🍏", 0),
    ("Tónica", "Bebida", "Agua tónica", 2.85, "🫧", 0),
    ("Zumo", "Bebida", "Zumos variados", 2.85, "🧃", 0),
    ("Café o té", "Bebida", "Café a tu gusto, té japonés o chino, o infusión", 1.30, "☕", 0),
    ("Licor de sake", "Bebida", "Licor japonés de sake", 7.05, "🍶", 0),
    ("Licor de fruta", "Bebida", "Chupito de licor de fruta", 4.00, "🥃", 0),
    ("Licor de hierbas", "Bebida", "Chupito de licor de hierbas", 4.00, "🥃", 0),
    ("Baileys", "Bebida", "Crema de whisky", 4.30, "🥃", 0),
    ("Ron Arehucas", "Bebida", "Ron canario", 4.20, "🥃", 0),
    ("Ron miel", "Bebida", "Ron miel canario", 4.50, "🥃", 0),
    ("Ginebra Beefeater", "Bebida", "Copa de ginebra", 4.95, "🍸", 0),
]
EMOJIS = {nombre: emoji for nombre, _, _, _, emoji, _ in CARTA}

platos, pesos = [], []
for f in IMAGENES.glob("plato-*.svg"):  # se regeneran todas las ilustraciones
    f.unlink()
FOTOS = IMAGENES / "fotos"  # fotos reales de Sakura Hanami (con su permiso), por número de plato


def imagen_de(i, nombre):
    """Foto real del plato numerado si la hay (fotos/NNN.webp); si no, la ilustración generada."""
    numero = nombre.split(".", 1)[0]
    if numero.isdigit() and (FOTOS / f"{int(numero):03d}.webp").exists():
        return f"/platos/fotos/{int(numero):03d}.webp"
    return f"/platos/plato-{i:03d}.svg"


for i, (nombre, cat, desc, precio, _, peso) in enumerate(CARTA, start=1):
    platos.append({
        "id": f"plato-{i:03d}", "nombre": nombre, "categoria": cat, "descripcion": desc,
        "precio": float(precio), "estaActivo": True, "imagen": imagen_de(i, nombre),
    })
    IMAGENES.mkdir(parents=True, exist_ok=True)
    (IMAGENES / f"plato-{i:03d}.svg").write_text(ilustracion(nombre, cat), encoding="utf-8")
    pesos.append(peso)
# Tarifas por comensal: Menú Sakura (almuerzos de lunes a jueves) y Menú Deluxe (resto)
TARIFAS = {
    "Almuerzo": ("buffet-almuerzo", "Menú Sakura", 18.95,
                 "Almuerzos de lunes a jueves: una selección de nuestros mejores platos, sin límites. Bebidas y postres no incluidos."),
    "Cena": ("buffet-cena", "Menú Deluxe", 21.95,
             "Cenas, viernes, fines de semana y festivos: más de 110 platos para disfrutar sin límites. Bebidas y postres no incluidos."),
}
# Niños de 100 a 130 cm (los de menos de 100 cm no pagan)
TARIFAS_INFANTILES = {
    "Almuerzo": ("buffet-almuerzo-infantil", "Menú infantil Sakura", 10.95,
                 "Niños de 100 a 130 cm de altura. Menos de 100 cm, gratis."),
    "Cena": ("buffet-cena-infantil", "Menú infantil Deluxe", 10.95,
             "Niños de 100 a 130 cm de altura. Menos de 100 cm, gratis."),
}
EMOJIS["Buffet"] = "🍱"
for turno, (tid, tnombre, tprecio, tdesc) in [*TARIFAS.items(), *TARIFAS_INFANTILES.items()]:
    platos.append({"id": tid, "nombre": tnombre, "categoria": "Buffet", "descripcion": tdesc,
                   "precio": tprecio, "estaActivo": True, "imagen": "/platos/buffet.svg"})
FONDOS["Buffet"] = ("#fde8ec", "#f9cfd8")
(IMAGENES / "buffet.svg").write_text(ilustracion("Buffet", "Buffet"), encoding="utf-8")
tarifa_por_turno = {t: next(p for p in platos if p["id"] == tid) for t, (tid, *_) in TARIFAS.items()}
tarifa_infantil_por_turno = {t: next(p for p in platos if p["id"] == tid) for t, (tid, *_) in TARIFAS_INFANTILES.items()}
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
        ("Agua 50 cl", 26), ("Coca-Cola", 11), ("Coca-Cola Zero", 8), ("Fanta de naranja", 4),
        ("Fanta de limón", 3), ("Nestea", 4), ("Aquarius", 2), ("Appletiser", 1), ("Zumo", 2), ("Tónica", 1),
        ("Tropical Pilsen", 10 if cena else 8), ("Dorada Especial", 6 if cena else 4),
        ("Mahou Cinco Estrellas", 4), ("Heineken", 4), ("Estrella Galicia Especial", 3),
        ("Tropical Limón", 2), ("Mahou Radler", 1), ("Alhambra Reserva 1925", 3 if cena else 1),
        ("Kirin Ichiban", 4 if cena else 2), ("Sapporo Premium", 3 if cena else 1),
        ("Copa de vino Rioja", 6 if cena else 3),
    ]
    return P(random.choices([n for n, _ in opciones], [w for _, w in opciones])[0])


BEBIDAS_INFANTILES = ["Agua 50 cl", "Agua 50 cl", "Coca-Cola", "Fanta de naranja",
                      "Fanta de limón", "Nestea", "Zumo", "Zumo", "Aquarius"]


def elegir_consumo(n_comensales, turno, ninos=0):
    """Comida (incluida), bebidas y postres (de pago) de una mesa de buffet.
    Los últimos 'ninos' comensales son niños: comen menos, sin alcohol ni café y piden más postre."""
    cena = turno == "Cena"
    adultos = n_comensales - ninos
    comida = []
    for i in range(n_comensales):
        # Cada adulto pide de media unas 4-5 raciones (una ración = 2 nigiris, 4 gyozas…); un niño, unas 3
        n = max(2, round(random.gauss(4.6 if i < adultos else 3.0, 1.1)))
        for _ in range(n):
            cat = "Entrante" if random.random() < 0.36 else "Principal"
            opciones = por_categoria[cat]
            comida.append(random.choices([p for p, _ in opciones], [w for _, w in opciones])[0])

    extras = []
    # Algunas mesas solo piden agua del grifo (gratuita por ley desde 2022): no pagan bebida
    solo_agua_grifo = random.random() < 0.06
    vino_en_botella = not solo_agua_grifo and cena and n_comensales >= 2 and random.random() < 0.14
    if vino_en_botella:
        extras.append(P(random.choice(["Vino Sakura Hanami", "Vino Sakura Hanami", "Verdejo D.O. Rueda",
                                       "Viña Esmeralda", "Viña Pomal Crianza", "Lambrusco", "Vino Sushi",
                                       "Mateus Rosé", "Ramón Bilbao Crianza", "El Grifo"])))
    if not solo_agua_grifo and n_comensales >= 4 and random.random() < 0.25:
        extras.append(P("Agua 50 cl"))
    for i in range(n_comensales):
        if i >= adultos:  # niño
            if not solo_agua_grifo:
                extras.append(P(random.choice(BEBIDAS_INFANTILES)))
            if random.random() < 0.55:
                opciones = por_categoria["Postre"]
                extras.append(random.choices([p for p, _ in opciones], [w for _, w in opciones])[0])
            continue
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
            extras.append(P("Café o té"))
    if random.random() < (0.10 if cena else 0.04):
        extras.append(P("Licor de sake"))
    if cena and random.random() < 0.08:
        extras.append(P(random.choice(["Licor de fruta", "Licor de hierbas", "Baileys", "Ron miel"])))
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
    # Familias: en mesas de 4 o más, a veces 1-2 niños (más en fin de semana)
    ninos = 0
    if comensales >= 3 and random.random() < (0.35 if inicio.weekday() >= 5 else 0.18):
        ninos = min(comensales - 1, random.choice([1, 1, 2]))
    # Tarifa del buffet: una línea por comensal, cargada al abrir la mesa
    turno = "Cena" if inicio.hour >= 18 else "Almuerzo"
    # Menú Sakura solo en almuerzos de lunes a jueves; Menú Deluxe en cenas, viernes y fines de semana
    tarifa_turno = "Cena" if turno == "Cena" or inicio.weekday() >= 4 else "Almuerzo"
    cubiertos = {"id": uid("ped"), "cuenta": cuenta_snapshot(cuenta), "pedidoEstado": "Listo", "fechaPedido": iso(inicio)}
    pedidos.append(cubiertos)
    for i in range(comensales):
        tarifa = tarifa_por_turno[tarifa_turno] if i < comensales - ninos else tarifa_infantil_por_turno[tarifa_turno]
        nueva_orden(cubiertos, tarifa, inicio, "Entregado", pagada, fin, metodo)

    comida, extras = elegir_consumo(comensales, turno, ninos)
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
