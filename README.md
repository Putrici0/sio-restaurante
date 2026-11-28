# 🌸 SIGO-RSH · Restaurante Sakura Hanami

Sistema de gestión del restaurante **Sakura Hanami** (Las Palmas de Gran Canaria), cocina de fusión
japonesa, china y tailandesa a la carta sin límites: web pública con carta y reservas, pedidos desde
el móvil de la mesa (QR), cocina, sala y caja, móvil del camarero, facturación y cuadro de mando.

* **Backend:** Java 21 + Javalin, datos en un fichero JSON (`data/sio-restaurante.json`)
* **Frontend:** Angular 21

---

## Requisitos

| Herramienta | Versión | Comprobar |
|---|---|---|
| Python | 3.9 o superior | `python --version` (en Windows también `py --version`) |
| Java (JDK) | 21 o superior | `java -version` |
| Node.js | 20.19+, 22.12+ o 24+ | `node -v` |

No hace falta instalar **Maven** ni ningún IDE: si no está instalado, `iniciar.py` descarga Maven
automáticamente en `.herramientas/` (si tienes IntelliJ, usa el Maven que trae).

---

## Arrancar y parar

Desde la carpeta del proyecto, en cualquier sistema (Windows, macOS o Linux):

```bash
python iniciar.py      # arranca backend y frontend en segundo plano y abre el navegador
python detener.py      # guarda los datos y lo para todo
```

En Windows puedes usar `py` en lugar de `python`. Opciones útiles:

```bash
python iniciar.py --reset          # vuelve a la demo original (con la fecha y hora de hoy)
python iniciar.py --sin-navegador  # no abre el navegador
```

La primera vez tarda más (descarga dependencias de Maven y npm). Los registros quedan en `logs/`.

### Después de un `git pull`

Basta con parar y volver a arrancar:

```bash
python detener.py
python iniciar.py
```

`iniciar.py` detecta lo que ha cambiado y lo pone al día solo:

* **Datos de la demo** (`data/`, que no se sube a git): si la carta, los precios o las imágenes han
  cambiado, los regenera con la fecha de hoy y guarda los anteriores en `data/anteriores/`.
* **Dependencias del frontend**: si ha cambiado `package-lock.json`, ejecuta `npm install`.
* **Backend**: se recompila en cada arranque.

---

## Direcciones

| Pantalla | URL |
|---|---|
| Web pública (carta y reservas) | http://localhost:4200/ |
| Sala, reservas, carta, facturación y estadísticas | http://localhost:4200/mesas |
| Cocina | http://localhost:4200/cocina |
| Móvil del camarero | http://localhost:4200/camarero (`camarero1` / `sakura`) |
| Mesa del cliente (código en Sala) | http://localhost:4200/acceso/1 |
| API | http://localhost:7070/ |

---

## Desarrollo

* Tests del backend: `mvn test` (o con el Maven descargado: `.herramientas/apache-maven-3.9.9/bin/mvn test`).
* Regenerar la semilla de datos (`backend/src/main/resources/datos-iniciales.json`) e ilustraciones:
  `python backend/scripts/generar_datos_demo.py`.
* Las fotos de los platos (`frontend/public/platos/fotos/`) son del restaurante Sakura Hanami y se
  usan con su permiso.
* En VS Code, el botón ▶ (Code Runner) ejecuta `iniciar.py` con el Python seleccionado.

---

# Autores

- Alejandro Hernández Delgado
- Carlos Alonso Rodríguez
- Pablo Llopis Parrilla
- Joan Martínez Perdomo
- Esther Viera Rivero
- Juan López Ramírez
