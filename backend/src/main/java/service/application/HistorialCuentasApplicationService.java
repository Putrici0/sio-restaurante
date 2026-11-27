package service.application;

import dto.CuentaPagadaResumenResponse;
import model.Categoria;
import model.Cuenta;
import model.Mesa;
import model.MetodoPago;
import model.Orden;
import model.OrdenEstado;
import model.Pedido;
import repository.interfaces.CuentaRepository;
import repository.interfaces.OrdenRepository;
import repository.interfaces.PedidoRepository;
import service.domain.BuffetLibre;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Historial de facturación: cuentas cobradas con su importe, comensales, número de
 * cobros (pagos parciales o total) y métodos de pago usados.
 */
public class HistorialCuentasApplicationService {
    private final CuentaRepository cuentaRepository;
    private final PedidoRepository pedidoRepository;
    private final OrdenRepository ordenRepository;

    public HistorialCuentasApplicationService(
            CuentaRepository cuentaRepository,
            PedidoRepository pedidoRepository,
            OrdenRepository ordenRepository
    ) {
        this.cuentaRepository = cuentaRepository;
        this.pedidoRepository = pedidoRepository;
        this.ordenRepository = ordenRepository;
    }

    public List<CuentaPagadaResumenResponse> obtenerCuentasPagadas(LocalDate fecha) {
        List<Cuenta> cuentasPagadas = cuentaRepository.findByEstaPagada(true).stream()
                .filter(cuenta -> coincideFecha(cuenta, fecha))
                .toList();

        Map<String, List<Orden>> ordenesPorCuenta = ordenesPorCuenta(cuentasPagadas);

        return cuentasPagadas.stream()
                .map(cuenta -> mapearResumen(cuenta, ordenesPorCuenta.getOrDefault(cuenta.id(), List.of())))
                .sorted(Comparator.comparing(CuentaPagadaResumenResponse::fechaHora).reversed())
                .toList();
    }

    private boolean coincideFecha(Cuenta cuenta, LocalDate fecha) {
        if (fecha == null) {
            return true;
        }
        Instant fechaBase = cuenta.fechaPago().orElse(cuenta.fechaCreacion());
        return fechaBase.atZone(BuffetLibre.ZONA).toLocalDate().equals(fecha);
    }

    private CuentaPagadaResumenResponse mapearResumen(Cuenta cuenta, List<Orden> ordenes) {
        List<Orden> validas = ordenes.stream()
                .filter(o -> o.ordenEstado() != OrdenEstado.Cancelado)
                .toList();

        BigDecimal total = validas.stream().map(this::precio).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal extras = validas.stream()
                .filter(o -> o.plato() != null && (o.plato().categoria() == Categoria.Bebida
                        || o.plato().categoria() == Categoria.Postre))
                .map(this::precio)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        int ninos = (int) validas.stream()
                .filter(o -> o.plato() != null && BuffetLibre.esTarifaInfantil(o.plato().id()))
                .count();

        // Un cobro = órdenes pagadas en el mismo segundo y con el mismo método
        Set<String> cobros = new LinkedHashSet<>();
        Set<MetodoPago> metodos = new LinkedHashSet<>();
        Instant ultimoCobro = null;
        for (Orden o : validas.stream()
                .filter(o -> o.pagada() && o.fechaPago().isPresent())
                .sorted(Comparator.comparing(o -> o.fechaPago().get()))
                .toList()) {
            Instant cuando = o.fechaPago().get();
            cobros.add(cuando.truncatedTo(ChronoUnit.SECONDS) + "|" + o.metodoPago().map(Enum::name).orElse(""));
            o.metodoPago().ifPresent(metodos::add);
            ultimoCobro = cuando;
        }

        Instant fechaHora = cuenta.fechaPago().orElse(ultimoCobro != null ? ultimoCobro : cuenta.fechaCreacion());
        return new CuentaPagadaResumenResponse(
                cuenta.id(),
                fechaHora,
                cuenta.fechaCreacion(),
                obtenerMesaPrincipal(cuenta),
                total,
                cuenta.metodoPago().orElse(null),
                Math.max(0, cuenta.comensales()),
                ninos,
                Math.max(1, cobros.size()),
                new ArrayList<>(metodos),
                extras
        );
    }

    private BigDecimal precio(Orden o) {
        return o.precio() == null ? BigDecimal.ZERO : o.precio();
    }

    private String obtenerMesaPrincipal(Cuenta cuenta) {
        List<Mesa> mesas = cuenta.mesas();
        if (mesas == null || mesas.isEmpty()) {
            return "-";
        }
        return mesas.stream()
                .map(Mesa::id)
                .filter(Objects::nonNull)
                .filter(id -> !id.isBlank())
                .collect(Collectors.joining(", "));
    }

    /** Órdenes de cada cuenta (todas, incluidas las canceladas, que se filtran después). */
    private Map<String, List<Orden>> ordenesPorCuenta(List<Cuenta> cuentas) {
        List<String> ids = cuentas.stream()
                .map(Cuenta::id)
                .filter(id -> id != null && !id.isBlank())
                .distinct()
                .toList();
        if (ids.isEmpty()) {
            return Map.of();
        }

        Map<String, String> pedidoIdACuentaId = new HashMap<>();
        for (Pedido pedido : pedidoRepository.findByCuentaIds(ids)) {
            if (pedido.id() != null && pedido.cuenta() != null && pedido.cuenta().id() != null) {
                pedidoIdACuentaId.putIfAbsent(pedido.id(), pedido.cuenta().id());
            }
        }
        if (pedidoIdACuentaId.isEmpty()) {
            return Map.of();
        }

        return ordenRepository.findByPedidosIds(List.copyOf(pedidoIdACuentaId.keySet())).stream()
                .filter(orden -> orden.pedido() != null && pedidoIdACuentaId.containsKey(orden.pedido().id()))
                .collect(Collectors.groupingBy(orden -> pedidoIdACuentaId.get(orden.pedido().id())));
    }
}
