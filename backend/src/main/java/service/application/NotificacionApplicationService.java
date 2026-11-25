package service.application;

import model.Cuenta;
import model.Mesa;
import model.Notificacion;
import repository.interfaces.CuentaRepository;
import repository.interfaces.NotificacionRepository;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;

/**
 * "Llamar al camarero": el cliente lo solicita desde la pagina de su mesa y
 * el aviso llega a los moviles del personal de sala hasta que alguien lo atiende.
 */
public class NotificacionApplicationService {

    private final NotificacionRepository notificacionRepository;
    private final CuentaRepository cuentaRepository;

    public NotificacionApplicationService(NotificacionRepository notificacionRepository, CuentaRepository cuentaRepository) {
        this.notificacionRepository = notificacionRepository;
        this.cuentaRepository = cuentaRepository;
    }

    /** Crea el aviso de la cuenta (si ya hay uno pendiente, devuelve ese mismo). */
    public Notificacion llamarCamarero(String cuentaId) {
        Cuenta cuenta = cuentaRepository.findById(cuentaId)
                .orElseThrow(() -> new IllegalArgumentException("La cuenta no existe"));
        if (cuenta.payed()) {
            throw new IllegalArgumentException("La sesión de esta mesa ya está cerrada");
        }

        return notificacionRepository.findPendienteDeCuenta(cuentaId).orElseGet(() ->
                notificacionRepository.save(new Notificacion(
                        null,
                        cuentaId,
                        cuenta.mesas().stream().map(Mesa::id).toList(),
                        Instant.now(),
                        false,
                        null
                )));
    }

    public List<Notificacion> pendientes() {
        // Los avisos de sesiones ya cerradas (mesa cobrada o liberada) dejan de mostrarse
        return notificacionRepository.findPendientes().stream()
                .filter(n -> cuentaRepository.findById(n.cuentaId()).map(c -> !c.payed()).orElse(false))
                .sorted(Comparator.comparing(Notificacion::fecha))
                .toList();
    }

    public boolean hayAvisoPendiente(String cuentaId) {
        return notificacionRepository.findPendienteDeCuenta(cuentaId).isPresent();
    }

    public Notificacion marcarAtendida(String notificacionId) {
        Notificacion n = notificacionRepository.findById(notificacionId)
                .orElseThrow(() -> new IllegalArgumentException("El aviso no existe"));
        if (n.atendida()) return n;
        return notificacionRepository.update(n.id(),
                new Notificacion(n.id(), n.cuentaId(), n.mesaIds(), n.fecha(), true, Instant.now()));
    }

    /** Al terminar una sesion se dan por atendidos sus avisos pendientes. */
    public void cerrarAvisosDeCuenta(String cuentaId) {
        notificacionRepository.findPendienteDeCuenta(cuentaId).ifPresent(n -> marcarAtendida(n.id()));
    }
}
