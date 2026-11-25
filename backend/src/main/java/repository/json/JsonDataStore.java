package repository.json;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.datatype.jdk8.Jdk8Module;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Almacén de datos de la demo: todo el sistema vive en un único fichero JSON
 * ({@code data/sio-restaurante.json}) con una colección por entidad.
 *
 * Si el fichero no existe se crea a partir de {@code datos-iniciales.json}
 * (recurso del classpath). Cada escritura se guarda en disco de forma atómica.
 * Para reiniciar la demo basta con borrar el fichero de datos.
 */
public class JsonDataStore {

    private static final String SEMILLA = "datos-iniciales.json";

    private final Path fichero;
    private final ObjectMapper mapper;
    private final ObjectNode raiz;
    private final Map<String, Coleccion<?>> colecciones = new LinkedHashMap<>();
    private static final long RETARDO_GUARDADO_MS = 300;
    private final AtomicBoolean pendiente = new AtomicBoolean(false);
    private final ScheduledExecutorService escritor = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "guardado-json");
        t.setDaemon(true);
        return t;
    });

    public JsonDataStore(Path fichero) {
        this.fichero = fichero;
        this.mapper = crearMapper();
        this.raiz = cargar();
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            if (pendiente.get()) guardarAhora();
        }, "guardado-json-final"));
    }

    public static ObjectMapper crearMapper() {
        ObjectMapper m = new ObjectMapper();
        m.registerModule(new Jdk8Module());
        m.registerModule(new JavaTimeModule());
        m.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        m.disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        return m;
    }

    public Path fichero() {
        return fichero;
    }

    /** Devuelve (creándola la primera vez) la colección con ese nombre, mapeada al tipo indicado. */
    @SuppressWarnings("unchecked")
    public synchronized <T> Coleccion<T> coleccion(String nombre, Class<T> tipo) {
        Coleccion<?> existente = colecciones.get(nombre);
        if (existente != null) {
            return (Coleccion<T>) existente;
        }
        Coleccion<T> nueva = new Coleccion<>();
        JsonNode nodo = raiz.get(nombre);
        if (nodo instanceof ArrayNode array) {
            for (JsonNode item : array) {
                try {
                    T entidad = mapper.treeToValue(item, tipo);
                    String id = item.path("id").asText(null);
                    if (id != null) nueva.datos.put(id, entidad);
                } catch (IOException e) {
                    throw new UncheckedIOException("Registro no válido en '" + nombre + "': " + item, e);
                }
            }
        }
        colecciones.put(nombre, nueva);
        return nueva;
    }

    /**
     * Pide guardar los cambios. Las escrituras se agrupan: varios cambios seguidos
     * (p. ej. cobrar las 25 lineas de una mesa) se vuelcan a disco una sola vez
     * pasados unos milisegundos. Al cerrar el backend se guarda lo pendiente.
     */
    public void guardar() {
        if (pendiente.compareAndSet(false, true)) {
            escritor.schedule(this::guardarAhora, RETARDO_GUARDADO_MS, TimeUnit.MILLISECONDS);
        }
    }

    /** Guarda en disco todas las colecciones (escritura atómica: fichero temporal + renombrado). */
    public synchronized void guardarAhora() {
        pendiente.set(false);
        try {
            for (Map.Entry<String, Coleccion<?>> e : colecciones.entrySet()) {
                raiz.set(e.getKey(), mapper.valueToTree(new ArrayList<>(e.getValue().datos.values())));
            }
            Files.createDirectories(fichero.toAbsolutePath().getParent());
            Path temporal = fichero.resolveSibling(fichero.getFileName() + ".tmp");
            mapper.writeValue(temporal.toFile(), raiz);
            Files.move(temporal, fichero, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new UncheckedIOException("No se ha podido guardar " + fichero, e);
        }
    }

    private ObjectNode cargar() {
        try {
            if (Files.exists(fichero)) {
                return (ObjectNode) mapper.readTree(fichero.toFile());
            }
            try (InputStream semilla = JsonDataStore.class.getClassLoader().getResourceAsStream(SEMILLA)) {
                ObjectNode datos = semilla != null ? (ObjectNode) mapper.readTree(semilla) : mapper.createObjectNode();
                Files.createDirectories(fichero.toAbsolutePath().getParent());
                mapper.writeValue(fichero.toFile(), datos);
                return datos;
            }
        } catch (IOException e) {
            throw new UncheckedIOException("No se ha podido leer " + fichero, e);
        }
    }

    /** Colección en memoria (id → entidad), en orden de inserción. */
    public static final class Coleccion<T> {
        final Map<String, T> datos = new LinkedHashMap<>();

        public List<T> valores() {
            return new ArrayList<>(datos.values());
        }
    }
}
