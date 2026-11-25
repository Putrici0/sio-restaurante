package util;

import com.google.cloud.firestore.Firestore;
import config.FirebaseConfig;
import config.FirestoreClientProvider;
import model.Categoria;
import model.Cuenta;
import model.Mesa;
import model.MetodoPago;
import model.Notificacion;
import model.Orden;
import model.OrdenEstado;
import model.Pedido;
import model.PedidoEstado;
import model.Plato;
import model.Rol;
import model.TipoNotificacion;
import model.Usuario;
import repository.firestore.FirestoreCuentaRepository;
import repository.firestore.FirestoreMesaRepository;
import repository.firestore.FirestoreNotificacionRepository;
import repository.firestore.FirestoreOrdenRepository;
import repository.firestore.FirestorePedidoRepository;
import repository.firestore.FirestorePlatoRepository;
import repository.firestore.FirestoreUsuarioRepository;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicInteger;

public final class SimuladorHoyMananaHastaLas16 {

    private SimuladorHoyMananaHastaLas16() {}

    public static void main(String[] args) {
        System.out.println("Iniciando simulacion de hoy y manana hasta las 16:00...");

        io.github.cdimascio.dotenv.Dotenv dotenv =
                io.github.cdimascio.dotenv.Dotenv.configure().ignoreIfMissing().load();

        if (dotenv.get("GOOGLE_APPLICATION_CREDENTIALS") == null) {
            dotenv = io.github.cdimascio.dotenv.Dotenv.configure()
                    .directory("..")
                    .ignoreIfMissing()
                    .load();
        }

        dotenv.entries().forEach(entry -> System.setProperty(entry.getKey(), entry.getValue()));

        FirebaseConfig.init();
        Firestore db = FirestoreClientProvider.getFirestore();
        simular(db);
    }

    public static void simular(Firestore db) {
        FirestoreMesaRepository mesaRepository = new FirestoreMesaRepository(db);
        FirestorePlatoRepository platoRepository = new FirestorePlatoRepository(db);
        FirestoreCuentaRepository cuentaRepository = new FirestoreCuentaRepository(db);
        FirestorePedidoRepository pedidoRepository = new FirestorePedidoRepository(db);
        FirestoreOrdenRepository ordenRepository = new FirestoreOrdenRepository(db);
        FirestoreNotificacionRepository notificacionRepository = new FirestoreNotificacionRepository(db);
        FirestoreUsuarioRepository usuarioRepository = new FirestoreUsuarioRepository(db);

        List<Mesa> mesas = mesaRepository.findAll();
        List<Plato> platos = platoRepository.findAll();
        List<Usuario> camareros = usuarioRepository.findByRol(Rol.Camarero);

        if (mesas.isEmpty() || platos.isEmpty()) {
            System.err.println("No hay mesas o platos suficientes para simular.");
            return;
        }

        if (camareros.isEmpty()) {
            throw new IllegalStateException(
                    "No se encontraron usuarios con el rol 'Camarero'."
            );
        }

        List<Plato> entrantes = filtrarPorCategoria(platos, Categoria.Entrante);
        List<Plato> principales = filtrarPorCategoria(platos, Categoria.Principal);
        List<Plato> postres = filtrarPorCategoria(platos, Categoria.Postre);
        List<Plato> bebidas = filtrarPorCategoria(platos, Categoria.Bebida);

        ZoneId zone = ZoneId.of("Europe/Madrid");
        ZonedDateTime hoy = ZonedDateTime.now(zone).truncatedTo(ChronoUnit.DAYS);
        List<ZonedDateTime> dias = List.of(hoy, hoy.plusDays(1));

        AtomicInteger cuentasGeneradas = new AtomicInteger();
        AtomicInteger ordenesGeneradas = new AtomicInteger();

        for (ZonedDateTime dia : dias) {
            int cuentasDia = simularDia(
                    dia,
                    mesas,
                    platos,
                    entrantes,
                    principales,
                    postres,
                    bebidas,
                    camareros,
                    cuentaRepository,
                    pedidoRepository,
                    ordenRepository,
                    notificacionRepository,
                    cuentasGeneradas,
                    ordenesGeneradas
            );

            System.out.println(
                    "Dia " + dia.toLocalDate() + " simulado con exito (" + cuentasDia + " cuentas)."
            );
        }

        System.out.println("========== SIMULACION COMPLETADA ==========");
        System.out.println("Cuentas generadas: " + cuentasGeneradas.get());
        System.out.println("Ordenes generadas: " + ordenesGeneradas.get());
    }

    private static int simularDia(
            ZonedDateTime dia,
            List<Mesa> mesas,
            List<Plato> platos,
            List<Plato> entrantes,
            List<Plato> principales,
            List<Plato> postres,
            List<Plato> bebidas,
            List<Usuario> camareros,
            FirestoreCuentaRepository cuentaRepository,
            FirestorePedidoRepository pedidoRepository,
            FirestoreOrdenRepository ordenRepository,
            FirestoreNotificacionRepository notificacionRepository,
            AtomicInteger cuentasGeneradas,
            AtomicInteger ordenesGeneradas
    ) {
        Random random = ThreadLocalRandom.current();
        Instant finServicio = dia.withHour(16).withMinute(0).withSecond(0).withNano(0).toInstant();

        boolean esFinde = dia.getDayOfWeek().getValue() >= 5;
        int cuentasPorDia = esFinde ? 14 + random.nextInt(9) : 8 + random.nextInt(7);

        for (int i = 0; i < cuentasPorDia; i++) {
            Usuario camarero = camareros.get(random.nextInt(camareros.size()));
            Instant fechaCreacionCuenta = generarHoraCuenta(dia, random);

            Cuenta cuenta = new Cuenta(
                    UUID.randomUUID().toString(),
                    List.of(mesas.get(random.nextInt(mesas.size()))),
                    false,
                    Optional.empty(),
                    fechaCreacionCuenta,
                    Optional.empty(),
                    String.format("%04d", random.nextInt(10000)),
                    Optional.empty()
            );

            cuentaRepository.save(cuenta);
            cuentasGeneradas.incrementAndGet();

            List<Pedido> pedidos = generarPedidos(cuenta, fechaCreacionCuenta, finServicio, random);
            pedidos.forEach(pedidoRepository::save);

            List<SimulatedOrden> ordenesSimuladas = generarOrdenes(
                    pedidos,
                    platos,
                    entrantes,
                    principales,
                    postres,
                    bebidas,
                    finServicio,
                    random
            );

            for (SimulatedOrden simulada : ordenesSimuladas) {
                notificacionRepository.save(new Notificacion(
                        UUID.randomUUID().toString(),
                        cuenta,
                        TipoNotificacion.Recoger,
                        true,
                        simulada.fechaLista,
                        simulada.id,
                        simulada.plato.nombre(),
                        simulada.plato.categoria().name(),
                        true,
                        camarero.id(),
                        camarero.username(),
                        simulada.fechaEnCurso
                ));
            }

            if (random.nextDouble() < 0.35) {
                Instant referenciaPago = ordenesSimuladas.stream()
                        .map(orden -> orden.fechaPago)
                        .min(Comparator.naturalOrder())
                        .orElse(fechaCreacionCuenta);

                Instant fechaAtencion = limitarA(referenciaPago.minusSeconds(120), finServicio);

                notificacionRepository.save(new Notificacion(
                        UUID.randomUUID().toString(),
                        cuenta,
                        TipoNotificacion.Atencion,
                        true,
                        fechaAtencion,
                        null,
                        null,
                        null,
                        true,
                        camarero.id(),
                        camarero.username(),
                        limitarA(fechaAtencion.plusSeconds(30), finServicio)
                ));
            }

            boolean pagoParcial = ordenesSimuladas.size() >= 3 && random.nextDouble() < 0.30;
            registrarPagoYOrdenes(
                    cuenta,
                    ordenesSimuladas,
                    pagoParcial,
                    finServicio,
                    random,
                    cuentaRepository,
                    ordenRepository
            );
            ordenesGeneradas.addAndGet(ordenesSimuladas.size());
        }

        return cuentasPorDia;
    }

    private static List<Pedido> generarPedidos(
            Cuenta cuenta,
            Instant fechaCreacionCuenta,
            Instant finServicio,
            Random random
    ) {
        int numeroPedidos = 1 + random.nextInt(3);
        List<Pedido> pedidos = new ArrayList<>();

        Instant fechaBase = limitarA(
                fechaCreacionCuenta.plusSeconds(30 + random.nextInt(90)),
                finServicio
        );

        pedidos.add(new Pedido(
                UUID.randomUUID().toString(),
                cuenta,
                PedidoEstado.Listo,
                fechaBase
        ));

        if (numeroPedidos >= 2) {
            pedidos.add(new Pedido(
                    UUID.randomUUID().toString(),
                    cuenta,
                    PedidoEstado.Listo,
                    limitarA(fechaBase.plus(20 + random.nextInt(15), ChronoUnit.MINUTES), finServicio)
            ));
        }

        if (numeroPedidos == 3) {
            Instant fechaPedido2 = pedidos.get(1).fechaPedido();
            pedidos.add(new Pedido(
                    UUID.randomUUID().toString(),
                    cuenta,
                    PedidoEstado.Listo,
                    limitarA(fechaPedido2.plus(20 + random.nextInt(15), ChronoUnit.MINUTES), finServicio)
            ));
        }

        return pedidos;
    }

    private static List<SimulatedOrden> generarOrdenes(
            List<Pedido> pedidos,
            List<Plato> platos,
            List<Plato> entrantes,
            List<Plato> principales,
            List<Plato> postres,
            List<Plato> bebidas,
            Instant finServicio,
            Random random
    ) {
        List<SimulatedOrden> resultado = new ArrayList<>();

        for (int i = 0; i < pedidos.size(); i++) {
            Pedido pedido = pedidos.get(i);
            boolean ultimoPedido = i == pedidos.size() - 1;

            int bebidasCount = random.nextDouble() < 0.9 ? 1 + random.nextInt(2) : 0;
            int entrantesCount = i == 0 && random.nextDouble() < 0.8 ? 1 + random.nextInt(2) : 0;
            int principalesCount = ultimoPedido ? 1 + random.nextInt(2) : 1;
            int postresCount = ultimoPedido && random.nextDouble() < 0.6 ? 1 + random.nextInt(2) : 0;

            agregarOrdenes(resultado, pedido, pickList(bebidas, platos), bebidasCount, finServicio, random);
            agregarOrdenes(resultado, pedido, pickList(entrantes, platos), entrantesCount, finServicio, random);
            agregarOrdenes(resultado, pedido, pickList(principales, platos), principalesCount, finServicio, random);
            agregarOrdenes(resultado, pedido, pickList(postres, platos), postresCount, finServicio, random);
        }

        return resultado;
    }

    private static void agregarOrdenes(
            List<SimulatedOrden> destino,
            Pedido pedido,
            List<Plato> candidatos,
            int cantidad,
            Instant finServicio,
            Random random
    ) {
        for (int i = 0; i < cantidad; i++) {
            Plato plato = candidatos.get(random.nextInt(candidatos.size()));
            Instant fechaOrden = pedido.fechaPedido();
            Instant fechaPreparacion = limitarA(
                    fechaOrden.plusSeconds(10 + random.nextInt(50)),
                    finServicio
            );
            Instant fechaLista = limitarA(
                    fechaPreparacion.plus(tiempoEstimadoMinutos(plato.categoria()) + random.nextInt(4), ChronoUnit.MINUTES),
                    finServicio
            );
            Instant fechaEnCurso = limitarA(
                    fechaLista.plusSeconds(10 + random.nextInt(20)),
                    finServicio
            );
            Instant fechaEntregada = limitarA(
                    fechaEnCurso.plusSeconds(30 + random.nextInt(70)),
                    finServicio
            );

            destino.add(new SimulatedOrden(
                    UUID.randomUUID().toString(),
                    pedido,
                    plato,
                    fechaOrden,
                    fechaPreparacion,
                    fechaLista,
                    fechaEnCurso,
                    fechaEntregada,
                    fechaEntregada
            ));
        }
    }

    private static void registrarPagoYOrdenes(
            Cuenta cuenta,
            List<SimulatedOrden> ordenesSimuladas,
            boolean pagoParcial,
            Instant finServicio,
            Random random,
            FirestoreCuentaRepository cuentaRepository,
            FirestoreOrdenRepository ordenRepository
    ) {
        List<SimulatedOrden> ordenesOrdenadas = new ArrayList<>(ordenesSimuladas);
        ordenesOrdenadas.sort(Comparator.comparing(orden -> orden.fechaEntregada));

        if (pagoParcial) {
            List<SimulatedOrden> mezcladas = new ArrayList<>(ordenesOrdenadas);
            Collections.shuffle(mezcladas, random);

            int partes = Math.min(3, Math.max(2, 2 + random.nextInt(2)));
            List<List<SimulatedOrden>> bloques = new ArrayList<>();
            for (int i = 0; i < partes; i++) {
                bloques.add(new ArrayList<>());
            }

            for (int i = 0; i < mezcladas.size(); i++) {
                bloques.get(i % partes).add(mezcladas.get(i));
            }

            Instant pagoBase = limitarA(
                    ordenesOrdenadas.get(ordenesOrdenadas.size() - 1).fechaEntregada.plus(5 + random.nextInt(8), ChronoUnit.MINUTES),
                    finServicio
            );

            Instant ultimoPago = pagoBase;
            MetodoPago ultimoMetodo = MetodoPago.TARJETA;

            for (int i = 0; i < bloques.size(); i++) {
                Instant fechaPago = limitarA(
                        pagoBase.plus(i * (30 + random.nextInt(60)), ChronoUnit.SECONDS),
                        finServicio
                );
                MetodoPago metodo = random.nextBoolean() ? MetodoPago.EFECTIVO : MetodoPago.TARJETA;
                ultimoPago = fechaPago;
                ultimoMetodo = metodo;

                for (SimulatedOrden ordenSimulada : bloques.get(i)) {
                    ordenRepository.save(ordenSimulada.toOrdenPagada(fechaPago, metodo));
                }
            }

            cuentaRepository.save(new Cuenta(
                    cuenta.id(),
                    cuenta.mesas(),
                    true,
                    cuenta.reserva(),
                    cuenta.fechaCreacion(),
                    Optional.of(ultimoPago),
                    cuenta.password(),
                    Optional.of(ultimoMetodo)
            ));

            return;
        }

        Instant fechaPago = limitarA(
                ordenesOrdenadas.get(ordenesOrdenadas.size() - 1).fechaEntregada.plus(5 + random.nextInt(8), ChronoUnit.MINUTES),
                finServicio
        );
        MetodoPago metodoPago = random.nextBoolean() ? MetodoPago.EFECTIVO : MetodoPago.TARJETA;

        for (SimulatedOrden ordenSimulada : ordenesOrdenadas) {
            ordenRepository.save(ordenSimulada.toOrdenPagada(fechaPago, metodoPago));
        }

        cuentaRepository.save(new Cuenta(
                cuenta.id(),
                cuenta.mesas(),
                true,
                cuenta.reserva(),
                cuenta.fechaCreacion(),
                Optional.of(fechaPago),
                cuenta.password(),
                Optional.of(metodoPago)
        ));
    }

    private static List<Plato> filtrarPorCategoria(List<Plato> platos, Categoria categoria) {
        List<Plato> filtrados = platos.stream()
                .filter(plato -> plato.categoria() == categoria)
                .toList();

        return filtrados.isEmpty() ? platos : filtrados;
    }

    private static List<Plato> pickList(List<Plato> categoria, List<Plato> fallback) {
        return categoria.isEmpty() ? fallback : categoria;
    }

    private static Instant generarHoraCuenta(ZonedDateTime dia, Random random) {
        int hora;
        int minuto;

        if (random.nextDouble() < 0.75) {
            hora = 12 + random.nextInt(3);
            if (hora == 12) {
                minuto = 30 + random.nextInt(30);
            } else if (hora == 14) {
                minuto = random.nextInt(31);
            } else {
                minuto = random.nextInt(60);
            }
        } else {
            int[] horasValle = {11, 12, 14, 15};
            hora = horasValle[random.nextInt(horasValle.length)];

            if (hora == 12) {
                minuto = random.nextInt(30);
            } else if (hora == 14) {
                minuto = 31 + random.nextInt(29);
            } else if (hora == 15) {
                minuto = random.nextInt(16);
            } else {
                minuto = random.nextInt(60);
            }
        }

        return dia.withHour(hora).withMinute(minuto).withSecond(0).withNano(0).toInstant();
    }

    private static int tiempoEstimadoMinutos(Categoria categoria) {
        if (categoria == null) {
            return 12;
        }

        return switch (categoria) {
            case Entrante -> 8;
            case Principal -> 15;
            case Postre -> 6;
            case Bebida -> 4;
        };
    }

    private static Instant limitarA(Instant instante, Instant maximo) {
        if (instante == null) {
            return maximo;
        }

        return instante.isAfter(maximo) ? maximo : instante;
    }

    private record SimulatedOrden(
            String id,
            Pedido pedido,
            Plato plato,
            Instant fechaOrden,
            Instant fechaPreparacion,
            Instant fechaLista,
            Instant fechaEnCurso,
            Instant fechaEntregada,
            Instant fechaPago
    ) {
        Orden toOrdenPagada(Instant fechaPagoReal, MetodoPago metodoPago) {
            return new Orden(
                    id,
                    pedido,
                    plato,
                    plato.precio(),
                    OrdenEstado.Entregado,
                    fechaOrden,
                    "",
                    true,
                    Optional.ofNullable(fechaPagoReal),
                    Optional.ofNullable(metodoPago)
            );
        }
    }
}
