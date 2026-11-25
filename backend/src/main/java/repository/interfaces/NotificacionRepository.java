package repository.interfaces;

import model.Notificacion;

import java.util.List;
import java.util.Optional;

public interface NotificacionRepository extends Repository<Notificacion, String> {
    List<Notificacion> findPendientes();
    Optional<Notificacion> findPendienteDeCuenta(String cuentaId);
}
