package dto;

import model.MetodoPago;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * Una cuenta cobrada en el historial de facturación.
 * fechaHora: momento del último cobro; fechaApertura: cuando se abrió la mesa.
 * pagos: número de cobros (pagos parciales o total); metodos: métodos usados en ellos.
 * bebidas: importe de bebidas y postres (lo que no incluye el buffet).
 */
public record CuentaPagadaResumenResponse(
        String cuentaId,
        Instant fechaHora,
        Instant fechaApertura,
        String mesa,
        BigDecimal importeTotal,
        MetodoPago metodoPago,
        int comensales,
        int ninos,
        int pagos,
        List<MetodoPago> metodos,
        BigDecimal extras
) {
}
