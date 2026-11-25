package repository.firestore;

import com.google.cloud.firestore.Firestore;
import model.Reserva;
import repository.interfaces.ReservaRepository;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class FirestoreReservaRepository extends AbstractFirestoreRepository<Reserva> implements ReservaRepository {

    public FirestoreReservaRepository(Firestore db) {
        super(db, "reservas");
    }

    @Override
    protected Reserva mapToEntity(String id, Map<String, Object> data) {
        @SuppressWarnings("unchecked")
        List<String> mesasIds = data.get("mesasIds") instanceof List<?>
                ? ((List<?>) data.get("mesasIds")).stream()
                .filter(java.util.Objects::nonNull)
                .map(Object::toString)
                .toList()
                : new ArrayList<>();

        return new Reserva(
                id,
                get(data, "nombre", ""),
                get(data, "telefono", ""),
                toInstant(data.get("fecha")),
                get(data, "hora", ""),
                ((Long) data.getOrDefault("capacidad", 0L)).intValue(),
                get(data, "zona", ""),
                mesasIds,
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
        map.put("fecha", toTimestamp(reserva.fecha()));
        map.put("hora", reserva.hora());
        map.put("capacidad", reserva.capacidad());
        map.put("zona", reserva.zona());
        map.put("mesasIds", reserva.mesasIds());
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
                reserva.fecha(),
                reserva.hora(),
                reserva.capacidad(),
                reserva.zona(),
                reserva.mesasIds(),
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
