package model;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Sesión de una mesa (o grupo de mesas) desde su apertura hasta el cobro.
 * cobroSolicitado = true indica que la sesión se ha cerrado y la mesa
 * queda "pendiente de cobro": ya no admite nuevos pedidos.
 */
public record Cuenta(
        String id,
        List<Mesa> mesas,
        boolean payed,
        Optional<Reserva> reserva,
        Instant fechaCreacion,
        Optional<Instant> fechaPago,
        String password,
        Optional<MetodoPago> metodoPago,
        boolean cobroSolicitado
) {
    public Cuenta {
        mesas = (mesas == null) ? List.of() : List.copyOf(mesas);
        password = (password == null) ? "" : password;
        reserva = (reserva == null) ? Optional.empty() : reserva;
        metodoPago = (metodoPago == null) ? Optional.empty() : metodoPago;
    }

    public Cuenta(
            String id,
            List<Mesa> mesas,
            boolean payed,
            Optional<Reserva> reserva,
            Instant fechaCreacion,
            Optional<Instant> fechaPago,
            String password,
            Optional<MetodoPago> metodoPago
    ) {
        this(id, mesas, payed, reserva, fechaCreacion, fechaPago, password, metodoPago, false);
    }

    public Cuenta conCobroSolicitado(boolean valor) {
        return new Cuenta(id, mesas, payed, reserva, fechaCreacion, fechaPago, password, metodoPago, valor);
    }
}
