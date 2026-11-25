package model;

import java.time.Instant;
import java.util.List;

/**
 * Aviso "llamar al camarero": lo crea el cliente desde la pagina de su mesa
 * y lo recibe el personal de sala en su movil hasta que lo marca como atendido.
 */
public record Notificacion(
        String id,
        String cuentaId,
        List<String> mesaIds,
        Instant fecha,
        boolean atendida,
        Instant fechaAtendida
) {
    public Notificacion {
        mesaIds = mesaIds == null ? List.of() : List.copyOf(mesaIds);
    }
}
