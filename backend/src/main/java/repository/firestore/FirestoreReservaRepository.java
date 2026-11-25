package repository.firestore;

import com.google.cloud.firestore.Firestore;
import model.Reserva;
import repository.interfaces.ReservaRepository;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class FirestoreReservaRepository extends AbstractFirestoreRepository<Reserva> implements ReservaRepository {

    public FirestoreReservaRepository(Firestore db) {
        super(db, "reservas");
    }

    @Override
    protected Reserva mapToEntity(String id, Map<String, Object> data) {
        Object capacidad = data.getOrDefault("capacidad", data.getOrDefault("comensales", 0L));
        return new Reserva(
                id,
                get(data, "nombre", ""),
                get(data, "telefono", ""),
                get(data, "email", ""),
                toInstant(data.get("fecha")),
                get(data, "hora", ""),
                capacidad instanceof Number n ? n.intValue() : 0,
                get(data, "nota", ""),
                get(data, "estado", "Pendiente"),
                toInstant(data.get("fechaCreacion"))
        );
    }

    @Override
    protected Map<String, Object> entityToMap(Reserva reserva) {
        Map<String, Object> map = new HashMap<>();
        map.put("nombre", reserva.nombre());
        map.put("telefono", reserva.telefono());
        map.put("email", reserva.email());
        map.put("fecha", toTimestamp(reserva.fecha()));
        map.put("hora", reserva.hora());
        map.put("capacidad", reserva.capacidad());
        map.put("nota", reserva.nota());
        map.put("estado", reserva.estado());
        map.put("fechaCreacion", toTimestamp(reserva.fechaCreacion()));
        return map;
    }

    @Override
    protected String getEntityId(Reserva reserva) {
        return reserva.id();
    }

    @Override
    protected Reserva createWithId(Reserva reserva, String id) {
        return new Reserva(
                id,
                reserva.nombre(),
                reserva.telefono(),
                reserva.email(),
                reserva.fecha(),
                reserva.hora(),
                reserva.capacidad(),
                reserva.nota(),
                reserva.estado(),
                reserva.fechaCreacion()
        );
    }

    @Override
    public List<Reserva> findByFecha(Instant fecha) {
        return buscarPorCampo("fecha", toTimestamp(fecha));
    }
}
