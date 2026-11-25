package service.application;

import model.Categoria;
import model.Cuenta;
import model.Orden;
import model.OrdenEstado;
import model.Plato;
import repository.interfaces.CuentaRepository;
import repository.interfaces.MesaRepository;
import repository.interfaces.OrdenRepository;
import repository.interfaces.PlatoRepository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;

/**
 * Módulo analítico de SIGO-RSH (cuadro de mando gerencial).
 * Calcula, para un rango de fechas, los indicadores definidos en la P1:
 * ventas (ingresos por día, franjas horarias, ticket medio), carta (ranking,
 * categorías, baja rotación) y eficiencia (ocupación media y rotación de mesas).
 */
public class EstadisticasApplicationService {

    private static final ZoneId ZONA = ZoneId.of("Atlantic/Canary");

    private final CuentaRepository cuentaRepository;
    private final OrdenRepository ordenRepository;
    private final PlatoRepository platoRepository;
    private final MesaRepository mesaRepository;

    public EstadisticasApplicationService(
            CuentaRepository cuentaRepository,
            OrdenRepository ordenRepository,
            PlatoRepository platoRepository,
            MesaRepository mesaRepository
    ) {
        this.cuentaRepository = cuentaRepository;
        this.ordenRepository = ordenRepository;
        this.platoRepository = platoRepository;
        this.mesaRepository = mesaRepository;
    }

    public Cuadro calcular(LocalDate desde, LocalDate hasta) {
        if (desde == null || hasta == null) {
            throw new IllegalArgumentException("Debes indicar las fechas desde y hasta");
        }
        if (hasta.isBefore(desde)) {
            throw new IllegalArgumentException("La fecha 'hasta' no puede ser anterior a 'desde'");
        }
        Instant inicio = desde.atStartOfDay(ZONA).toInstant();
        Instant fin = hasta.plusDays(1).atStartOfDay(ZONA).toInstant();

        // Órdenes vendidas (pagadas y no canceladas) en el rango
        List<Orden> vendidas = ordenRepository.findByPagada(true).stream()
                .filter(o -> o.ordenEstado() != OrdenEstado.Cancelado)
                .filter(o -> o.fechaPago().isPresent() && enRango(o.fechaPago().get(), inicio, fin))
                .toList();

        // Sesiones cerradas (cuentas pagadas) en el rango
        List<Cuenta> sesiones = cuentaRepository.findByEstaPagada(true).stream()
                .filter(c -> c.fechaPago().isPresent() && enRango(c.fechaPago().get(), inicio, fin))
                .toList();

        return new Cuadro(desde, hasta, ventas(vendidas, desde, hasta), carta(vendidas), eficiencia(sesiones, desde, hasta));
    }

    // ---------------------------------------------------------------- ventas

    private Ventas ventas(List<Orden> vendidas, LocalDate desde, LocalDate hasta) {
        BigDecimal ingresos = vendidas.stream().map(this::precio).reduce(BigDecimal.ZERO, BigDecimal::add);
        long cuentasConConsumo = vendidas.stream()
                .map(this::cuentaId).filter(Objects::nonNull).distinct().count();
        BigDecimal ticketMedio = cuentasConConsumo == 0
                ? BigDecimal.ZERO
                : ingresos.divide(BigDecimal.valueOf(cuentasConConsumo), 2, RoundingMode.HALF_UP);

        Map<LocalDate, BigDecimal> porDia = new TreeMap<>();
        for (LocalDate d = desde; !d.isAfter(hasta); d = d.plusDays(1)) porDia.put(d, BigDecimal.ZERO);
        Map<Integer, BigDecimal> porHora = new TreeMap<>();
        Map<String, BigDecimal> porMetodo = new LinkedHashMap<>();

        for (Orden o : vendidas) {
            var momento = o.fechaPago().get().atZone(ZONA);
            porDia.merge(momento.toLocalDate(), precio(o), BigDecimal::add);
            porHora.merge(momento.getHour(), precio(o), BigDecimal::add);
            String metodo = o.metodoPago().map(Enum::name).orElse("SIN_DATO");
            porMetodo.merge(metodo, precio(o), BigDecimal::add);
        }

        List<Serie> ingresosPorDia = porDia.entrySet().stream()
                .map(e -> new Serie(e.getKey().toString(), e.getValue())).toList();
        List<Serie> ingresosPorHora = porHora.entrySet().stream()
                .map(e -> new Serie(String.format("%02d:00", e.getKey()), e.getValue())).toList();
        List<Serie> ingresosPorMetodo = porMetodo.entrySet().stream()
                .map(e -> new Serie(e.getKey(), e.getValue())).toList();

        return new Ventas(escala(ingresos), cuentasConConsumo, ticketMedio, ingresosPorDia, ingresosPorHora, ingresosPorMetodo);
    }

    // ----------------------------------------------------------------- carta

    private Carta carta(List<Orden> vendidas) {
        Map<String, ProductoVendido> porPlato = new HashMap<>();
        Map<Categoria, long[]> unidadesCategoria = new LinkedHashMap<>();
        Map<Categoria, BigDecimal> ingresosCategoria = new LinkedHashMap<>();

        for (Orden o : vendidas) {
            Plato plato = o.plato();
            if (plato == null || plato.id() == null) continue;
            porPlato.merge(plato.id(),
                    new ProductoVendido(plato.id(), plato.nombre(), plato.categoria(), 1, precio(o)),
                    (a, b) -> new ProductoVendido(a.platoId(), a.nombre(), a.categoria(),
                            a.unidades() + 1, a.ingresos().add(b.ingresos())));
            if (plato.categoria() != null) {
                unidadesCategoria.computeIfAbsent(plato.categoria(), k -> new long[1])[0]++;
                ingresosCategoria.merge(plato.categoria(), precio(o), BigDecimal::add);
            }
        }

        List<ProductoVendido> ranking = porPlato.values().stream()
                .sorted(Comparator.comparingLong(ProductoVendido::unidades).reversed()
                        .thenComparing(ProductoVendido::nombre))
                .limit(10)
                .toList();

        List<CategoriaVendida> categorias = new ArrayList<>();
        for (Categoria c : Categoria.values()) {
            long unidades = unidadesCategoria.getOrDefault(c, new long[1])[0];
            categorias.add(new CategoriaVendida(c, unidades, escala(ingresosCategoria.getOrDefault(c, BigDecimal.ZERO))));
        }

        // Baja rotación: platos activos de la carta con menos unidades vendidas (incluye los no vendidos)
        List<ProductoVendido> bajaRotacion = platoRepository.findAll().stream()
                .filter(Plato::estaActivo)
                .map(p -> porPlato.getOrDefault(p.id(),
                        new ProductoVendido(p.id(), p.nombre(), p.categoria(), 0, BigDecimal.ZERO)))
                .sorted(Comparator.comparingLong(ProductoVendido::unidades).thenComparing(ProductoVendido::nombre))
                .limit(5)
                .toList();

        return new Carta(ranking, categorias, bajaRotacion);
    }

    // ------------------------------------------------------------ eficiencia

    private Eficiencia eficiencia(List<Cuenta> sesiones, LocalDate desde, LocalDate hasta) {
        int numeroMesas = Math.max(1, mesaRepository.findAll().size());

        List<Long> duraciones = sesiones.stream()
                .filter(c -> c.fechaCreacion() != null)
                .map(c -> Duration.between(c.fechaCreacion(), c.fechaPago().get()).toMinutes())
                .filter(m -> m >= 0 && m <= 12 * 60)
                .toList();
        double ocupacionMedia = duraciones.stream().mapToLong(Long::longValue).average().orElse(0);

        Map<LocalDate, Long> sesionesPorDia = new TreeMap<>();
        for (LocalDate d = desde; !d.isAfter(hasta); d = d.plusDays(1)) sesionesPorDia.put(d, 0L);
        for (Cuenta c : sesiones) {
            sesionesPorDia.merge(c.fechaPago().get().atZone(ZONA).toLocalDate(), 1L, Long::sum);
        }

        List<RotacionDia> rotacion = sesionesPorDia.entrySet().stream()
                .map(e -> new RotacionDia(e.getKey().toString(), e.getValue(),
                        redondear((double) e.getValue() / numeroMesas)))
                .toList();
        double rotacionMedia = rotacion.stream().mapToDouble(RotacionDia::rotacion).average().orElse(0);

        return new Eficiencia(sesiones.size(), redondear(ocupacionMedia), redondear(rotacionMedia), numeroMesas, rotacion);
    }

    // --------------------------------------------------------------- helpers

    private boolean enRango(Instant t, Instant inicio, Instant fin) {
        return !t.isBefore(inicio) && t.isBefore(fin);
    }

    private BigDecimal precio(Orden o) {
        return o.precio() == null ? BigDecimal.ZERO : o.precio();
    }

    private String cuentaId(Orden o) {
        return o.pedido() != null && o.pedido().cuenta() != null ? o.pedido().cuenta().id() : null;
    }

    private BigDecimal escala(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP);
    }

    private double redondear(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    // ------------------------------------------------------------------ DTOs

    public record Cuadro(LocalDate desde, LocalDate hasta, Ventas ventas, Carta carta, Eficiencia eficiencia) {}

    public record Serie(String etiqueta, BigDecimal valor) {}

    public record Ventas(BigDecimal ingresos, long cuentas, BigDecimal ticketMedio,
                         List<Serie> ingresosPorDia, List<Serie> ingresosPorHora, List<Serie> ingresosPorMetodo) {}

    public record ProductoVendido(String platoId, String nombre, Categoria categoria, long unidades, BigDecimal ingresos) {}

    public record CategoriaVendida(Categoria categoria, long unidades, BigDecimal ingresos) {}

    public record Carta(List<ProductoVendido> ranking, List<CategoriaVendida> categorias, List<ProductoVendido> bajaRotacion) {}

    public record RotacionDia(String fecha, long sesiones, double rotacion) {}

    public record Eficiencia(long sesiones, double ocupacionMediaMinutos, double rotacionMediaDiaria,
                             int numeroMesas, List<RotacionDia> rotacionPorDia) {}
}
