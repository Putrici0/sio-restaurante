package repository.json;

import model.Reserva;
import repository.interfaces.ReservaRepository;

import java.util.Comparator;
import java.util.List;

public class JsonReservaRepository extends JsonRepository<Reserva> implements ReservaRepository {

    public JsonReservaRepository(JsonDataStore store) {
        super(store, "reservas", Reserva.class);
    }

    @Override protected String idDe(Reserva r) { return r.id(); }

    @Override
    protected Reserva conId(Reserva r, String id) {
        return new Reserva(id, r.nombre(), r.telefono(), r.email(), r.fecha(), r.hora(), r.comensales(),
                r.nota(), r.estado(), r.origen(), r.fechaCreacion());
    }

    @Override
    public List<Reserva> findAll() {
        return super.findAll().stream()
                .sorted(Comparator.comparing(Reserva::fecha, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(Reserva::hora, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
    }

    @Override
    public List<Reserva> findByFecha(String fecha) {
        return findAll().stream().filter(r -> fecha != null && fecha.equals(r.fecha())).toList();
    }
}
