package repository.json;

import repository.interfaces.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Predicate;

/**
 * Repositorio genérico sobre una colección del {@link JsonDataStore}.
 * Todas las operaciones se sincronizan sobre el almacén para que lecturas y
 * escrituras concurrentes (varias pantallas a la vez) sean consistentes.
 */
public abstract class JsonRepository<T> implements Repository<T, String> {

    protected final JsonDataStore store;
    private final JsonDataStore.Coleccion<T> coleccion;

    protected JsonRepository(JsonDataStore store, String nombreColeccion, Class<T> tipo) {
        this.store = store;
        this.coleccion = store.coleccion(nombreColeccion, tipo);
    }

    protected abstract String idDe(T entidad);

    protected abstract T conId(T entidad, String id);

    @Override
    public List<T> findAll() {
        synchronized (store) {
            return coleccion.valores();
        }
    }

    @Override
    public List<T> findPage(int limit, String cursor) {
        synchronized (store) {
            List<T> todos = coleccion.valores();
            int inicio = 0;
            if (cursor != null && !cursor.isBlank()) {
                for (int i = 0; i < todos.size(); i++) {
                    if (cursor.equals(idDe(todos.get(i)))) {
                        inicio = i + 1;
                        break;
                    }
                }
            }
            return todos.subList(Math.min(inicio, todos.size()), Math.min(inicio + Math.max(1, limit), todos.size()));
        }
    }

    @Override
    public Optional<T> findById(String id) {
        if (id == null) return Optional.empty();
        synchronized (store) {
            return Optional.ofNullable(coleccion.datos.get(id));
        }
    }

    @Override
    public T save(T entidad) {
        synchronized (store) {
            String id = idDe(entidad);
            if (id == null || id.isBlank()) {
                id = UUID.randomUUID().toString();
            }
            T conId = conId(entidad, id);
            coleccion.datos.put(id, conId);
            store.guardar();
            return conId;
        }
    }

    @Override
    public T update(String id, T entidad) {
        synchronized (store) {
            if (!coleccion.datos.containsKey(id)) {
                throw new IllegalArgumentException("No existe el registro " + id);
            }
            T conId = conId(entidad, id);
            coleccion.datos.put(id, conId);
            store.guardar();
            return conId;
        }
    }

    @Override
    public void deleteById(String id) {
        synchronized (store) {
            if (coleccion.datos.remove(id) == null) {
                throw new IllegalArgumentException("No existe el registro " + id);
            }
            store.guardar();
        }
    }

    @Override
    public boolean existsById(String id) {
        synchronized (store) {
            return id != null && coleccion.datos.containsKey(id);
        }
    }

    protected List<T> filtrar(Predicate<T> condicion) {
        synchronized (store) {
            return coleccion.datos.values().stream().filter(condicion).toList();
        }
    }
}
