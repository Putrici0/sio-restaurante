package dto.cocina;

import model.OrdenEstado;
import model.Pedido;
import model.Plato;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Orden tal y como la ve la pantalla de cocina.
 * Las órdenes se atienden por orden de llegada (FIFO): posicionCola indica
 * el puesto en la cola y etaMinutos el tiempo estimado hasta que esté lista.
 */
public record CocinaOrden(
        String id,
        Pedido pedido,
        Plato plato,
        BigDecimal precio,
        OrdenEstado ordenEstado,
        Instant fecha,
        String detalles,
        boolean pagada,
        int posicionCola,
        Integer etaMinutos
) {
}
