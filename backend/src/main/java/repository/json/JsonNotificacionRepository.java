package repository.json;

import model.Notificacion;
import repository.interfaces.NotificacionRepository;

import java.util.List;
import java.util.Optional;

public class JsonNotificacionRepository extends JsonRepository<Notificacion> implements NotificacionRepository {

    public JsonNotificacionRepository(JsonDataStore store) {
        super(store, "notificaciones", Notificacion.class);
    }

    @Override protected String idDe(Notificacion n) { return n.id(); }

    @Override
    protected Notificacion conId(Notificacion n, String id) {
        return new Notificacion(id, n.cuentaId(), n.mesaIds(), n.fecha(), n.atendida(), n.fechaAtendida());
    }

    @Override public List<Notificacion> findPendientes() { return filtrar(n -> !n.atendida()); }

    @Override
    public Optional<Notificacion> findPendienteDeCuenta(String cuentaId) {
        return filtrar(n -> !n.atendida() && cuentaId != null && cuentaId.equals(n.cuentaId())).stream().findFirst();
    }
}
