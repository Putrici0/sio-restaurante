package repository.json;

import model.Mesa;
import repository.interfaces.MesaRepository;

import java.util.List;

public class JsonMesaRepository extends JsonRepository<Mesa> implements MesaRepository {

    public JsonMesaRepository(JsonDataStore store) {
        super(store, "mesas", Mesa.class);
    }

    @Override protected String idDe(Mesa m) { return m.id(); }

    @Override protected Mesa conId(Mesa m, String id) { return new Mesa(id, m.capacidad(), m.mesasUnidas(), m.sucia()); }

    @Override
    public List<Mesa> findAll() {
        return super.findAll().stream().sorted(Mesa.POR_NUMERO).toList();
    }

    @Override
    public List<Mesa> findByCapacidad(int capacidad) {
        return filtrar(m -> m.capacidad() == capacidad);
    }
}
