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
import repository.interfaces.ReservaRepository;
import model.Reserva;
import service.domain.BuffetLibre;
import java.time.DayOfWeek;
import java.time.format.TextStyle;
import java.util.Locale;

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
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;
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
    private final ReservaRepository reservaRepository;

    public EstadisticasApplicationService(
            CuentaRepository cuentaRepository,
            OrdenRepository ordenRepository,
            PlatoRepository platoRepository,
            MesaRepository mesaRepository,
            ReservaRepository reservaRepository
    ) {
        this.cuentaRepository = cuentaRepository;
        this.ordenRepository = ordenRepository;
        this.platoRepository = platoRepository;
        this.mesaRepository = mesaRepository;
        this.reservaRepository = reservaRepository;
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

        return new Cuadro(desde, hasta, ventas(vendidas, desde, hasta), carta(vendidas, sesiones), eficiencia(sesiones, desde, hasta),
                sala(vendidas, sesiones), extras(vendidas, sesiones), reservas(desde, hasta));
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

    private Carta carta(List<Orden> vendidas, List<Cuenta> sesiones) {
        Map<String, ProductoVendido> porPlato = new HashMap<>();
        Map<Categoria, long[]> unidadesCategoria = new LinkedHashMap<>();
        Map<Categoria, BigDecimal> ingresosCategoria = new LinkedHashMap<>();

        for (Orden o : vendidas) {
            Plato plato = o.plato();
            if (plato == null || plato.id() == null || plato.categoria() == Categoria.Buffet) continue;
            porPlato.merge(plato.id(),
                    new ProductoVendido(plato.id(), plato.nombre(), plato.categoria(), 1, precio(o)),
                    (a, b) -> new ProductoVendido(a.platoId(), a.nombre(), a.categoria(),
                            a.unidades() + 1, a.ingresos().add(b.ingresos())));
            if (plato.categoria() != null) {
                unidadesCategoria.computeIfAbsent(plato.categoria(), k -> new long[1])[0]++;
                ingresosCategoria.merge(plato.categoria(), precio(o), BigDecimal::add);
            }
        }

        // Platos del buffet más pedidos (la comida incluida: lo que más trabajo y coste genera en cocina)
        List<ProductoVendido> ranking = porPlato.values().stream()
                .filter(p -> p.categoria() != null && p.categoria().incluidaEnBuffet())
                .sorted(Comparator.comparingLong(ProductoVendido::unidades).reversed()
                        .thenComparing(ProductoVendido::nombre))
                .limit(10)
                .toList();

        List<CategoriaVendida> categorias = new ArrayList<>();
        for (Categoria c : Categoria.values()) {
            if (c == Categoria.Buffet) continue;
            long unidades = unidadesCategoria.getOrDefault(c, new long[1])[0];
            categorias.add(new CategoriaVendida(c, unidades, escala(ingresosCategoria.getOrDefault(c, BigDecimal.ZERO))));
        }

        // Baja rotación: platos activos de la carta con menos unidades vendidas (incluye los no vendidos)
        List<ProductoVendido> bajaRotacion = platoRepository.findAll().stream()
                .filter(Plato::estaActivo)
                .filter(p -> p.categoria() != null && p.categoria().incluidaEnBuffet())
                .map(p -> porPlato.getOrDefault(p.id(),
                        new ProductoVendido(p.id(), p.nombre(), p.categoria(), 0, BigDecimal.ZERO)))
                .sorted(Comparator.comparingLong(ProductoVendido::unidades).thenComparing(ProductoVendido::nombre))
                .limit(5)
                .toList();

        long comensales = sesiones.stream().mapToLong(c -> Math.max(0, c.comensales())).sum();
        long raciones = vendidas.stream()
                .filter(o -> o.plato() != null && o.plato().categoria() != null && o.plato().categoria().incluidaEnBuffet())
                .count();
        double racionesPorComensal = comensales == 0 ? 0 : redondear((double) raciones / comensales);

        return new Carta(ranking, categorias, bajaRotacion, raciones, racionesPorComensal);
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

    // ------------------------------------------------------------- sala

    /** Rentabilidad por mesa, turnos (almuerzo/cena), dias de la semana y peso de las bebidas. */
    private Sala sala(List<Orden> vendidas, List<Cuenta> sesiones) {
        Map<String, BigDecimal> ingresosPorCuenta = new HashMap<>();
        BigDecimal bebidas = BigDecimal.ZERO;
        BigDecimal total = BigDecimal.ZERO;
        for (Orden o : vendidas) {
            String cuentaId = cuentaId(o);
            if (cuentaId != null) ingresosPorCuenta.merge(cuentaId, precio(o), BigDecimal::add);
            if (o.plato() != null && o.plato().categoria() == Categoria.Bebida) bebidas = bebidas.add(precio(o));
            total = total.add(precio(o));
        }

        Map<String, long[]> mesaSesionesComensalesMinutos = new HashMap<>();
        Map<String, BigDecimal> mesaIngresos = new HashMap<>();
        Map<String, long[]> turnoSesionesComensales = new LinkedHashMap<>();
        Map<String, BigDecimal> turnoIngresos = new LinkedHashMap<>();
        Map<String, BigDecimal> turnoBebidas = new LinkedHashMap<>();
        for (String t : List.of("Almuerzo", "Cena")) {
            turnoSesionesComensales.put(t, new long[2]);
            turnoIngresos.put(t, BigDecimal.ZERO);
            turnoBebidas.put(t, BigDecimal.ZERO);
        }
        Map<String, BigDecimal> bebidasPorCuenta = new HashMap<>();
        for (Orden o : vendidas) {
            String cuentaId = cuentaId(o);
            if (cuentaId != null && o.plato() != null && o.plato().categoria() == Categoria.Bebida) {
                bebidasPorCuenta.merge(cuentaId, precio(o), BigDecimal::add);
            }
        }
        Map<DayOfWeek, BigDecimal> diaIngresos = new TreeMap<>();
        Map<DayOfWeek, long[]> diaSesiones = new TreeMap<>();
        long comensalesTotales = 0;

        for (Cuenta c : sesiones) {
            BigDecimal ingreso = ingresosPorCuenta.getOrDefault(c.id(), BigDecimal.ZERO);
            int comensales = Math.max(0, c.comensales());
            comensalesTotales += comensales;
            String mesa = c.mesas().isEmpty() ? "?" : c.mesas().get(0).id();
            long minutos = c.fechaCreacion() == null ? 0 : Math.max(0, Duration.between(c.fechaCreacion(), c.fechaPago().get()).toMinutes());
            long[] acc = mesaSesionesComensalesMinutos.computeIfAbsent(mesa, k -> new long[3]);
            acc[0]++;
            acc[1] += comensales;
            acc[2] += minutos;
            mesaIngresos.merge(mesa, ingreso, BigDecimal::add);

            String turno = BuffetLibre.turno(c.fechaCreacion() != null ? c.fechaCreacion() : c.fechaPago().get());
            long[] t = turnoSesionesComensales.get(turno);
            t[0]++;
            t[1] += comensales;
            turnoIngresos.merge(turno, ingreso, BigDecimal::add);
            turnoBebidas.merge(turno, bebidasPorCuenta.getOrDefault(c.id(), BigDecimal.ZERO), BigDecimal::add);

            DayOfWeek dia = c.fechaPago().get().atZone(ZONA).getDayOfWeek();
            diaIngresos.merge(dia, ingreso, BigDecimal::add);
            diaSesiones.computeIfAbsent(dia, k -> new long[1])[0]++;
        }

        List<RentabilidadMesa> mesas = new ArrayList<>();
        for (var m : mesaRepository.findAll()) {
            long[] acc = mesaSesionesComensalesMinutos.getOrDefault(m.id(), new long[3]);
            BigDecimal ingresos = escala(mesaIngresos.getOrDefault(m.id(), BigDecimal.ZERO));
            mesas.add(new RentabilidadMesa(
                    m.id(), m.capacidad(), acc[0], acc[1], ingresos,
                    acc[0] == 0 ? BigDecimal.ZERO : ingresos.divide(BigDecimal.valueOf(acc[0]), 2, RoundingMode.HALF_UP),
                    acc[1] == 0 ? BigDecimal.ZERO : ingresos.divide(BigDecimal.valueOf(acc[1]), 2, RoundingMode.HALF_UP),
                    ingresos.divide(BigDecimal.valueOf(Math.max(1, m.capacidad())), 2, RoundingMode.HALF_UP),
                    acc[0] == 0 ? 0 : redondear((double) acc[2] / acc[0])
            ));
        }
        mesas.sort(Comparator.comparing(RentabilidadMesa::ingresos).reversed());

        List<Turno> turnos = new ArrayList<>();
        for (String t : turnoSesionesComensales.keySet()) {
            long[] v = turnoSesionesComensales.get(t);
            BigDecimal ingresos = escala(turnoIngresos.get(t));
            turnos.add(new Turno(t, v[0], v[1], ingresos,
                    v[1] == 0 ? BigDecimal.ZERO : ingresos.divide(BigDecimal.valueOf(v[1]), 2, RoundingMode.HALF_UP),
                    v[1] == 0 ? BigDecimal.ZERO : turnoBebidas.get(t).divide(BigDecimal.valueOf(v[1]), 2, RoundingMode.HALF_UP)));
        }

        List<DiaSemana> dias = new ArrayList<>();
        for (DayOfWeek d : DayOfWeek.values()) {
            long n = diaSesiones.getOrDefault(d, new long[1])[0];
            dias.add(new DiaSemana(d.getDisplayName(TextStyle.FULL, new Locale("es", "ES")), n,
                    escala(diaIngresos.getOrDefault(d, BigDecimal.ZERO))));
        }

        BigDecimal gastoPorComensal = comensalesTotales == 0 ? BigDecimal.ZERO
                : total.divide(BigDecimal.valueOf(comensalesTotales), 2, RoundingMode.HALF_UP);
        double pctBebidas = total.signum() == 0 ? 0
                : redondear(bebidas.multiply(BigDecimal.valueOf(100)).divide(total, 2, RoundingMode.HALF_UP).doubleValue());

        return new Sala(comensalesTotales, gastoPorComensal, pctBebidas, mesas, turnos, dias);
    }

    // ------------------------------------------------- bebidas y extras

    /**
     * Lo que no va incluido en el buffet: bebidas y postres. Es donde está el margen del
     * negocio, así que se desglosa por tipo de bebida, por producto y por comensal.
     */
    private Extras extras(List<Orden> vendidas, List<Cuenta> sesiones) {
        BigDecimal buffet = BigDecimal.ZERO;
        BigDecimal buffetInfantil = BigDecimal.ZERO;
        long ninos = 0;
        BigDecimal bebidas = BigDecimal.ZERO;
        BigDecimal postres = BigDecimal.ZERO;
        long unidadesBebida = 0;
        long unidadesPostre = 0;
        Map<String, BigDecimal> porTipo = new LinkedHashMap<>();
        for (String tipo : TIPOS_BEBIDA) porTipo.put(tipo, BigDecimal.ZERO);
        Map<String, ProductoVendido> porBebida = new HashMap<>();
        Set<String> cuentasConBebida = new HashSet<>();
        // La copia del plato en cada orden no lleva descripción: se toma de la carta
        Map<String, String> descripciones = new HashMap<>();
        for (Plato p : platoRepository.findAll()) {
            if (p.id() != null) descripciones.put(p.id(), p.descripcion() == null ? "" : p.descripcion());
        }

        for (Orden o : vendidas) {
            Plato plato = o.plato();
            if (plato == null || plato.categoria() == null) continue;
            switch (plato.categoria()) {
                case Buffet -> {
                    if (BuffetLibre.esTarifaInfantil(plato.id())) {
                        buffetInfantil = buffetInfantil.add(precio(o));
                        ninos++;
                    } else {
                        buffet = buffet.add(precio(o));
                    }
                }
                case Postre -> {
                    postres = postres.add(precio(o));
                    unidadesPostre++;
                }
                case Bebida -> {
                    bebidas = bebidas.add(precio(o));
                    unidadesBebida++;
                    porTipo.merge(tipoBebida(plato.nombre() + " · " + descripciones.getOrDefault(plato.id(), "")), precio(o), BigDecimal::add);
                    porBebida.merge(plato.id(),
                            new ProductoVendido(plato.id(), plato.nombre(), plato.categoria(), 1, precio(o)),
                            (a, b) -> new ProductoVendido(a.platoId(), a.nombre(), a.categoria(),
                                    a.unidades() + 1, a.ingresos().add(b.ingresos())));
                    String cuentaId = cuentaId(o);
                    if (cuentaId != null) cuentasConBebida.add(cuentaId);
                }
                default -> { }
            }
        }

        long comensales = sesiones.stream().mapToLong(c -> Math.max(0, c.comensales())).sum();
        long mesasSinBebida = sesiones.stream().filter(c -> !cuentasConBebida.contains(c.id())).count();

        List<Serie> desglose = List.of(
                new Serie("Buffet adultos", escala(buffet)),
                new Serie("Buffet infantil", escala(buffetInfantil)),
                new Serie("Bebidas", escala(bebidas)),
                new Serie("Postres", escala(postres)));
        List<Serie> tipos = porTipo.entrySet().stream()
                .map(e -> new Serie(e.getKey(), escala(e.getValue())))
                .sorted(Comparator.comparing(Serie::valor).reversed())
                .toList();
        List<ProductoVendido> rankingBebidas = porBebida.values().stream()
                .sorted(Comparator.comparing(ProductoVendido::ingresos).reversed())
                .limit(10)
                .map(p -> new ProductoVendido(p.platoId(), p.nombre(), p.categoria(), p.unidades(), escala(p.ingresos())))
                .toList();

        return new Extras(
                desglose,
                escala(bebidas),
                unidadesBebida,
                porComensal(bebidas, comensales),
                comensales == 0 ? 0 : redondear((double) unidadesBebida / comensales),
                sesiones.isEmpty() ? 0 : redondear(mesasSinBebida * 100.0 / sesiones.size()),
                tipos,
                rankingBebidas,
                escala(postres),
                porComensal(postres, comensales),
                comensales == 0 ? 0 : redondear(unidadesPostre * 100.0 / comensales),
                porComensal(buffet.add(buffetInfantil), comensales),
                ninos);
    }

    private static final List<String> TIPOS_BEBIDA = List.of(
            "Agua", "Refrescos y zumos", "Cervezas", "Vinos", "Sake y licores", "Cafés y tés");

    /** Agrupa las bebidas de la carta por tipo a partir de su nombre y su descripción. */
    static String tipoBebida(String texto) {
        String n = texto == null ? "" : texto.toLowerCase(new Locale("es", "ES"));
        if (n.contains("tónica")) return "Refrescos y zumos";
        if (n.startsWith("agua")) return "Agua";
        if (n.contains("café") || n.contains("cafe") || n.contains("infusión") || n.contains("matcha")) return "Cafés y tés";
        if (n.contains("cerveza") || n.contains("caña")) return "Cervezas";
        if (n.contains("vino") || n.contains("cava") || n.contains("rosado") || n.contains("lambrusco")
                || n.contains("tinto")) return "Vinos";
        if (n.contains("sake") || n.contains("licor") || n.contains("chupito") || n.contains("ron ")
                || n.contains("ginebra") || n.contains("whisky")) return "Sake y licores";
        return "Refrescos y zumos";
    }

    private BigDecimal porComensal(BigDecimal importe, long comensales) {
        return comensales == 0 ? BigDecimal.ZERO : importe.divide(BigDecimal.valueOf(comensales), 2, RoundingMode.HALF_UP);
    }

    // ---------------------------------------------------------- reservas

    private Reservas reservas(LocalDate desde, LocalDate hasta) {
        List<Reserva> enRango = reservaRepository.findAll().stream()
                .filter(r -> r.fecha() != null && !r.fecha().isBlank())
                .filter(r -> {
                    LocalDate f = LocalDate.parse(r.fecha());
                    return !f.isBefore(desde) && !f.isAfter(hasta);
                })
                .toList();
        long web = enRango.stream().filter(r -> "web".equals(r.origen())).count();
        long canceladas = enRango.stream().filter(r -> "Cancelado".equals(r.estado())).count();
        long cumplidas = enRango.stream().filter(r -> "Finalizado".equals(r.estado())).count();
        long comensales = enRango.stream().filter(r -> !"Cancelado".equals(r.estado())).mapToLong(Reserva::comensales).sum();
        return new Reservas(enRango.size(), web, canceladas, cumplidas, comensales);
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

    public record Cuadro(LocalDate desde, LocalDate hasta, Ventas ventas, Carta carta, Eficiencia eficiencia,
                         Sala sala, Extras extras, Reservas reservas) {}

    public record Serie(String etiqueta, BigDecimal valor) {}

    public record Ventas(BigDecimal ingresos, long cuentas, BigDecimal ticketMedio,
                         List<Serie> ingresosPorDia, List<Serie> ingresosPorHora, List<Serie> ingresosPorMetodo) {}

    public record ProductoVendido(String platoId, String nombre, Categoria categoria, long unidades, BigDecimal ingresos) {}

    public record CategoriaVendida(Categoria categoria, long unidades, BigDecimal ingresos) {}

    public record Carta(List<ProductoVendido> ranking, List<CategoriaVendida> categorias, List<ProductoVendido> bajaRotacion,
                        long raciones, double racionesPorComensal) {}

    public record RotacionDia(String fecha, long sesiones, double rotacion) {}

    public record Eficiencia(long sesiones, double ocupacionMediaMinutos, double rotacionMediaDiaria,
                             int numeroMesas, List<RotacionDia> rotacionPorDia) {}

    public record RentabilidadMesa(String mesa, int capacidad, long sesiones, long comensales, BigDecimal ingresos,
                                   BigDecimal ingresoMedioSesion, BigDecimal ingresoPorComensal,
                                   BigDecimal ingresoPorPlaza, double ocupacionMediaMinutos) {}

    public record Turno(String turno, long sesiones, long comensales, BigDecimal ingresos, BigDecimal gastoPorComensal,
                        BigDecimal bebidaPorComensal) {}

    public record DiaSemana(String dia, long sesiones, BigDecimal ingresos) {}

    public record Sala(long comensales, BigDecimal gastoPorComensal, double porcentajeBebidas,
                       List<RentabilidadMesa> mesas, List<Turno> turnos, List<DiaSemana> diasSemana) {}

    public record Reservas(long total, long web, long canceladas, long cumplidas, long comensales) {}

    /** Bebidas y postres: lo que se cobra aparte del buffet. */
    public record Extras(List<Serie> desgloseIngresos, BigDecimal ingresosBebidas, long unidadesBebidas,
                         BigDecimal bebidaPorComensal, double bebidasPorComensal, double porcentajeMesasSinBebida,
                         List<Serie> bebidasPorTipo, List<ProductoVendido> rankingBebidas,
                         BigDecimal ingresosPostres, BigDecimal postrePorComensal, double porcentajeComensalesConPostre,
                         BigDecimal buffetPorComensal, long ninos) {}
}
