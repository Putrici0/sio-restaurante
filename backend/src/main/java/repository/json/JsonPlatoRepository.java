package repository.json;

import model.Categoria;
import model.Plato;
import repository.interfaces.PlatoRepository;

import java.util.List;

public class JsonPlatoRepository extends JsonRepository<Plato> implements PlatoRepository {

    public JsonPlatoRepository(JsonDataStore store) {
        super(store, "platos", Plato.class);
    }

    @Override protected String idDe(Plato p) { return p.id(); }

    @Override
    protected Plato conId(Plato p, String id) {
        return new Plato(id, p.nombre(), p.categoria(), p.descripcion(), p.precio(), p.estaActivo(), p.imagen());
    }

    @Override public List<Plato> findByCategoria(Categoria categoria) { return filtrar(p -> p.categoria() == categoria); }

    @Override public List<Plato> findByEstaActivo(boolean activo) { return filtrar(p -> p.estaActivo() == activo); }

    @Override
    public List<Plato> findByNombre(String nombre) {
        return filtrar(p -> p.nombre() != null && p.nombre().equalsIgnoreCase(nombre));
    }
}
