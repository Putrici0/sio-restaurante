package util;

import com.google.cloud.firestore.Firestore;
import config.FirebaseConfig;
import config.FirestoreClientProvider;
import model.*;
import repository.firestore.*;
import service.domain.cocina.CocinaPrioridadService;
import service.domain.cocina.CocinaContextoCuenta;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

public class SimuladorHistorico {

    public static void main(String[] args) {
        System.out.println("Iniciando simulación histórica de datos...");
        
        // Cargar variables de entorno si existen
        io.github.cdimascio.dotenv.Dotenv dotenv = io.github.cdimascio.dotenv.Dotenv.configure().ignoreIfMissing().load();
        if (dotenv.get("GOOGLE_APPLICATION_CREDENTIALS") == null) {
            dotenv = io.github.cdimascio.dotenv.Dotenv.configure().directory("..").ignoreIfMissing().load();
        }
        dotenv.entries().forEach(entry -> System.setProperty(entry.getKey(), entry.getValue()));

        FirebaseConfig.init();
        Firestore db = FirestoreClientProvider.getFirestore();

        FirestoreMesaRepository mesaRepository = new FirestoreMesaRepository(db);
        FirestorePlatoRepository platoRepository = new FirestorePlatoRepository(db);
        FirestoreCuentaRepository cuentaRepository = new FirestoreCuentaRepository(db);
        FirestorePedidoRepository pedidoRepository = new FirestorePedidoRepository(db);
        FirestoreOrdenRepository ordenRepository = new FirestoreOrdenRepository(db);
        FirestoreNotificacionRepository notificacionRepository = new FirestoreNotificacionRepository(db);

        List<Mesa> mesas = mesaRepository.findAll();
        List<Plato> platos = platoRepository.findAll();
        FirestoreUsuarioRepository usuarioRepository = new FirestoreUsuarioRepository(db);

        if (mesas.isEmpty() || platos.isEmpty()) {
            System.err.println("No hay mesas o platos suficientes para simular.");
            return;
        }

        System.out.println("Mesas cargadas: " + mesas.size());
        System.out.println("Platos cargados: " + platos.size());

        List<Usuario> camarerosRaw = usuarioRepository.findByRol(Rol.Camarero);
        if (camarerosRaw.isEmpty()) {
            throw new IllegalStateException("No se encontraron usuarios con el rol 'Camarero' en la base de datos (colección 'usuarios'). Por favor, registre al menos un camarero antes de ejecutar la simulación.");
        }
        final List<Usuario> camareros = camarerosRaw;
        System.out.println("Camareros cargados desde la base de datos: " + camareros.size());


        // Categorizar platos
        List<Plato> entrantes = platos.stream().filter(p -> p.categoria() == Categoria.Entrante).toList();
        List<Plato> principales = platos.stream().filter(p -> p.categoria() == Categoria.Principal).toList();
        List<Plato> postres = platos.stream().filter(p -> p.categoria() == Categoria.Postre).toList();
        List<Plato> bebidas = platos.stream().filter(p -> p.categoria() == Categoria.Bebida).toList();

        List<Plato> finalEntrantes = entrantes.isEmpty() ? platos : entrantes;
        List<Plato> finalPrincipales = principales.isEmpty() ? platos : principales;
        List<Plato> finalPostres = postres.isEmpty() ? platos : postres;
        List<Plato> finalBebidas = bebidas.isEmpty() ? platos : bebidas;

        ZoneId zone = ZoneId.of("Europe/Madrid");
        ZonedDateTime hoy = ZonedDateTime.now(zone);
        
        // Simular últimos 60 días
        int diasASimular = 60;
        AtomicInteger cuentasGeneradas = new AtomicInteger(0);
        AtomicInteger ordenesGeneradas = new AtomicInteger(0);

        ExecutorService executor = Executors.newFixedThreadPool(12);
        List<Future<?>> futures = new ArrayList<>();

        for (int i = diasASimular; i >= 0; i--) {
            final int dayOffset = i;
            futures.add(executor.submit(() -> {
                try {
                    ZonedDateTime dia = hoy.minusDays(dayOffset);
                    Random random = ThreadLocalRandom.current();
                    
                    java.time.DayOfWeek diaSemana = dia.getDayOfWeek();
                    boolean esFinde = diaSemana == java.time.DayOfWeek.FRIDAY || 
                                      diaSemana == java.time.DayOfWeek.SATURDAY || 
                                      diaSemana == java.time.DayOfWeek.SUNDAY;
                    
                    // Simular carga de trabajo por día (fines de semana más concurridos)
                    int cuentasPorDia = esFinde ? (35 + random.nextInt(26)) : (15 + random.nextInt(16));
            
            for (int c = 0; c < cuentasPorDia; c++) {
                // Seleccionar un camarero dedicado de la base de datos para esta cuenta
                Usuario camareroAsignado = camareros.get(random.nextInt(camareros.size()));
                
                int hora;
                int minuto;
                
                // 70% de probabilidad de que sea en hora punta (13:30-15:30 o 20:30-22:30)
                double probHoraPunta = random.nextDouble();
                if (probHoraPunta < 0.70) {
                    boolean mediodia = random.nextBoolean();
                    if (mediodia) {
                        hora = 13 + random.nextInt(3); // 13, 14, 15
                        if (hora == 13) minuto = 30 + random.nextInt(30);
                        else if (hora == 15) minuto = random.nextInt(31);
                        else minuto = random.nextInt(60);
                    } else {
                        hora = 20 + random.nextInt(3); // 20, 21, 22
                        if (hora == 20) minuto = 30 + random.nextInt(30);
                        else if (hora == 22) minuto = random.nextInt(31);
                        else minuto = random.nextInt(60);
                    }
                } else {
                    // Hora valle (resto del horario operativo: 11:00 a 23:30)
                    int[] horasValle = {11, 12, 13, 15, 16, 17, 18, 19, 20, 22, 23};
                    hora = horasValle[random.nextInt(horasValle.length)];
                    if (hora == 13) minuto = random.nextInt(30);
                    else if (hora == 15) minuto = 30 + random.nextInt(30);
                    else if (hora == 20) minuto = random.nextInt(30);
                    else if (hora == 22) minuto = 30 + random.nextInt(30);
                    else if (hora == 23) minuto = random.nextInt(31); // Hasta las 23:30
                    else minuto = random.nextInt(60);
                }

                ZonedDateTime horaCreacion = dia.withHour(hora).withMinute(minuto).withSecond(0).withNano(0);
                Instant instantCreacion = horaCreacion.toInstant();

                // Seleccionar mesa(s) aleatoria(s)
                Mesa mesaAleatoria = mesas.get(random.nextInt(mesas.size()));
                List<Mesa> mesasCuenta = List.of(mesaAleatoria);
                
                // Si la mesa está unida a otra, es posible simularlo, pero para simplicidad 
                // usaremos la mesa seleccionada, asegurándonos de limpiar dependencias raras.
                
                // Crear la Cuenta inicial con payed = false
                Cuenta cuentaSim = new Cuenta(
                        UUID.randomUUID().toString(),
                        mesasCuenta,
                        false,
                        Optional.empty(),
                        instantCreacion,
                        Optional.empty(),
                        String.format("%04d", random.nextInt(10000)),
                        Optional.empty()
                );
                cuentaRepository.save(cuentaSim);
                cuentasGeneradas.incrementAndGet();

                // Generar Pedidos para la cuenta (1 a 3 pedidos) de forma realista
                int numPedidos = 1 + random.nextInt(3);
                List<Pedido> listPedidos = new ArrayList<>();
                List<SimulatedOrden> simOrdenes = new ArrayList<>();

                // Pedido 1
                Instant tPedido1 = instantCreacion.plusSeconds(30 + random.nextInt(90));
                Pedido pedido1 = new Pedido(UUID.randomUUID().toString(), cuentaSim, PedidoEstado.Listo, tPedido1);
                listPedidos.add(pedido1);

                // Agregar platos para Pedido 1
                int numEntrantes = random.nextDouble() < 0.8 ? 1 + random.nextInt(2) : 0;
                for (int o = 0; o < numEntrantes; o++) {
                    Plato plato = finalEntrantes.get(random.nextInt(finalEntrantes.size()));
                    simOrdenes.add(new SimulatedOrden(UUID.randomUUID().toString(), pedido1, plato, tPedido1));
                }
                int numBebidas = random.nextDouble() < 0.9 ? 1 + random.nextInt(2) : 0;
                for (int o = 0; o < numBebidas; o++) {
                    Plato plato = finalBebidas.get(random.nextInt(finalBebidas.size()));
                    simOrdenes.add(new SimulatedOrden(UUID.randomUUID().toString(), pedido1, plato, tPedido1));
                }

                if (numPedidos == 1) {
                    int numPrincipales = 1 + random.nextInt(2);
                    for (int o = 0; o < numPrincipales; o++) {
                        Plato plato = finalPrincipales.get(random.nextInt(finalPrincipales.size()));
                        simOrdenes.add(new SimulatedOrden(UUID.randomUUID().toString(), pedido1, plato, tPedido1));
                    }
                    if (random.nextDouble() < 0.7) {
                        Plato plato = finalPostres.get(random.nextInt(finalPostres.size()));
                        simOrdenes.add(new SimulatedOrden(UUID.randomUUID().toString(), pedido1, plato, tPedido1));
                    }
                } else {
                    int numPrincipales = 1 + random.nextInt(2);
                    for (int o = 0; o < numPrincipales; o++) {
                        Plato plato = finalPrincipales.get(random.nextInt(finalPrincipales.size()));
                        simOrdenes.add(new SimulatedOrden(UUID.randomUUID().toString(), pedido1, plato, tPedido1));
                    }
                }

                Instant tPedido2 = null;
                if (numPedidos >= 2) {
                    tPedido2 = tPedido1.plus(20 + random.nextInt(15), ChronoUnit.MINUTES);
                    Pedido pedido2 = new Pedido(UUID.randomUUID().toString(), cuentaSim, PedidoEstado.Listo, tPedido2);
                    listPedidos.add(pedido2);

                    if (numPedidos == 2) {
                        int numPostres = 1 + random.nextInt(2);
                        for (int o = 0; o < numPostres; o++) {
                            Plato plato = finalPostres.get(random.nextInt(finalPostres.size()));
                            simOrdenes.add(new SimulatedOrden(UUID.randomUUID().toString(), pedido2, plato, tPedido2));
                        }
                        if (random.nextBoolean()) {
                            Plato plato = finalBebidas.get(random.nextInt(finalBebidas.size()));
                            simOrdenes.add(new SimulatedOrden(UUID.randomUUID().toString(), pedido2, plato, tPedido2));
                        }
                    } else {
                        int numPrincipales = 1 + random.nextInt(2);
                        for (int o = 0; o < numPrincipales; o++) {
                            Plato plato = finalPrincipales.get(random.nextInt(finalPrincipales.size()));
                            simOrdenes.add(new SimulatedOrden(UUID.randomUUID().toString(), pedido2, plato, tPedido2));
                        }
                        if (random.nextBoolean()) {
                            Plato plato = finalBebidas.get(random.nextInt(finalBebidas.size()));
                            simOrdenes.add(new SimulatedOrden(UUID.randomUUID().toString(), pedido2, plato, tPedido2));
                        }
                    }
                }

                Instant tPedido3 = null;
                if (numPedidos == 3) {
                    tPedido3 = tPedido2.plus(25 + random.nextInt(15), ChronoUnit.MINUTES);
                    Pedido pedido3 = new Pedido(UUID.randomUUID().toString(), cuentaSim, PedidoEstado.Listo, tPedido3);
                    listPedidos.add(pedido3);

                    int numPostres = 1 + random.nextInt(2);
                    for (int o = 0; o < numPostres; o++) {
                        Plato plato = finalPostres.get(random.nextInt(finalPostres.size()));
                        simOrdenes.add(new SimulatedOrden(UUID.randomUUID().toString(), pedido3, plato, tPedido3));
                    }
                    if (random.nextBoolean()) {
                        Plato plato = finalBebidas.get(random.nextInt(finalBebidas.size()));
                        simOrdenes.add(new SimulatedOrden(UUID.randomUUID().toString(), pedido3, plato, tPedido3));
                    }
                }

                // Guardar los Pedidos en la base de datos
                for (Pedido ped : listPedidos) {
                    pedidoRepository.save(ped);
                }

                // Paso 1: Simular Bebidas (preparación rápida)
                for (SimulatedOrden o : simOrdenes) {
                    if (o.plato.categoria() == Categoria.Bebida) {
                        o.fechaPreparacion = o.fechaOrden.plusSeconds(10 + random.nextInt(30));
                        o.fechaListo = o.fechaPreparacion.plus(2 + random.nextInt(3), ChronoUnit.MINUTES);
                        Instant fechaEnCurso = o.fechaListo.plusSeconds(15 + random.nextInt(45));
                        o.fechaEntregado = fechaEnCurso.plusSeconds(30 + random.nextInt(60));
                    }
                }

                // Paso 2: Simular órdenes de cocina usando CocinaPrioridadService
                List<SimulatedOrden> kitchenOrders = simOrdenes.stream()
                        .filter(o -> o.plato.categoria() != Categoria.Bebida)
                        .collect(Collectors.toList());

                if (!kitchenOrders.isEmpty()) {
                    Instant tSim = kitchenOrders.stream()
                            .map(o -> o.fechaOrden)
                            .min(Comparator.naturalOrder())
                            .get();

                    CocinaPrioridadService cocinaPrioridadService = new CocinaPrioridadService();

                    while (true) {
                        final Instant currentTime = tSim;
                        List<SimulatedOrden> activeOrPending = kitchenOrders.stream()
                                .filter(o -> !o.fechaOrden.isAfter(currentTime))
                                .filter(o -> o.fechaListo == null || o.fechaListo.isAfter(currentTime))
                                .toList();

                        if (activeOrPending.isEmpty()) {
                            boolean anyFuture = kitchenOrders.stream().anyMatch(o -> o.fechaOrden.isAfter(currentTime));
                            if (anyFuture) {
                                tSim = kitchenOrders.stream()
                                        .map(o -> o.fechaOrden)
                                        .filter(time -> time.isAfter(currentTime))
                                        .min(Comparator.naturalOrder())
                                        .get();
                                continue;
                            } else {
                                break;
                            }
                        }

                        List<SimulatedOrden> cooking = activeOrPending.stream()
                                .filter(o -> o.fechaPreparacion != null && !o.fechaPreparacion.isAfter(currentTime))
                                .toList();

                        int capacity = 2;
                        int freeSlots = capacity - cooking.size();

                        List<SimulatedOrden> pending = activeOrPending.stream()
                                .filter(o -> o.fechaPreparacion == null)
                                .toList();

                        if (freeSlots > 0 && !pending.isEmpty()) {
                            Map<String, CocinaContextoCuenta> contextoMap = new HashMap<>();
                            List<Orden> currentStateOrdenes = new ArrayList<>();

                            for (SimulatedOrden simO : simOrdenes) {
                                if (!simO.fechaOrden.isAfter(currentTime)) {
                                    OrdenEstado estado = simO.getEstadoAt(currentTime);
                                    Orden tempOrden = new Orden(
                                            simO.id,
                                            simO.pedido,
                                            simO.plato,
                                            simO.plato.precio(),
                                            estado,
                                            simO.fechaOrden,
                                            "",
                                            false,
                                            false,
                                            Optional.empty(),
                                            Optional.empty()
                                    );
                                    currentStateOrdenes.add(tempOrden);
                                }
                            }

                            CocinaContextoCuenta contexto = new CocinaContextoCuenta(
                                    "cuenta:" + cuentaSim.id(),
                                    cuentaSim,
                                    currentStateOrdenes
                            );
                            contextoMap.put("cuenta:" + cuentaSim.id(), contexto);

                            List<Orden> tempPending = pending.stream()
                                    .map(simO -> new Orden(
                                            simO.id,
                                            simO.pedido,
                                            simO.plato,
                                            simO.plato.precio(),
                                            OrdenEstado.Pendiente,
                                            simO.fechaOrden,
                                            "",
                                            false,
                                            false,
                                            Optional.empty(),
                                            Optional.empty()
                                    ))
                                    .toList();

                            List<Orden> sortedTempPending = cocinaPrioridadService.ordenarPorPrioridad(tempPending, contextoMap, currentTime);

                            int toStart = Math.min(freeSlots, sortedTempPending.size());
                            for (int idx = 0; idx < toStart; idx++) {
                                Orden chosen = sortedTempPending.get(idx);
                                SimulatedOrden simO = pending.stream().filter(o -> o.id.equals(chosen.id())).findFirst().get();

                                simO.fechaPreparacion = currentTime;

                                int estMin = tiempoEstimadoMinutos(simO.plato.categoria());
                                int prepDuration = estMin - 1 + random.nextInt(3);
                                if (prepDuration < 1) prepDuration = 1;

                                simO.fechaListo = currentTime.plus(prepDuration, ChronoUnit.MINUTES);

                                Instant fechaEnCurso = simO.fechaListo.plusSeconds(15 + random.nextInt(45));
                                simO.fechaEntregado = fechaEnCurso.plusSeconds(30 + random.nextInt(60));
                            }
                            continue;
                        }

                        Instant nextEventTime = null;

                        Instant nextFinish = activeOrPending.stream()
                                .filter(o -> o.fechaListo != null)
                                .map(o -> o.fechaListo)
                                .min(Comparator.naturalOrder())
                                .orElse(null);
                        if (nextFinish != null && nextFinish.isAfter(currentTime)) {
                            nextEventTime = nextFinish;
                        }

                        Instant nextOrder = kitchenOrders.stream()
                                .map(o -> o.fechaOrden)
                                .filter(time -> time.isAfter(currentTime))
                                .min(Comparator.naturalOrder())
                                .orElse(null);
                        if (nextOrder != null) {
                            if (nextEventTime == null || nextOrder.isBefore(nextEventTime)) {
                                nextEventTime = nextOrder;
                            }
                        }

                        if (nextEventTime == null) {
                            for (SimulatedOrden o : activeOrPending) {
                                if (o.fechaPreparacion == null) {
                                    o.fechaPreparacion = currentTime;
                                    o.fechaListo = currentTime.plus(5, ChronoUnit.MINUTES);
                                    Instant fechaEnCurso = o.fechaListo.plusSeconds(30);
                                    o.fechaEntregado = fechaEnCurso.plusSeconds(60);
                                }
                            }
                            break;
                        }

                        tSim = nextEventTime;
                    }
                }

                // Generar notificaciones de tipo Recoger para cada plato/bebida listo
                for (SimulatedOrden o : simOrdenes) {
                    Instant fechaEnCurso = o.fechaListo.plusSeconds(10 + random.nextInt(20));

                    Notificacion notiRecoger = new Notificacion(
                            UUID.randomUUID().toString(),
                            cuentaSim,
                            TipoNotificacion.Recoger,
                            true, // leida e histórica
                            o.fechaListo,
                            o.id,
                            o.plato.nombre(),
                            o.plato.categoria().name(),
                            true, // en curso
                            camareroAsignado.id(),
                            camareroAsignado.username(),
                            fechaEnCurso
                    );
                    notificacionRepository.save(notiRecoger);
                }

                // Obtener el momento del último plato entregado
                Instant lastDeliveryTime = simOrdenes.stream()
                        .map(o -> o.fechaEntregado)
                        .filter(Objects::nonNull)
                        .max(Comparator.naturalOrder())
                        .orElse(instantCreacion.plus(45, ChronoUnit.MINUTES));

                Instant instantPagoInicio = lastDeliveryTime.plus(5 + random.nextInt(10), ChronoUnit.MINUTES);

                // Generar Notificaciones de Atención para pedir la cuenta
                if (random.nextDouble() > 0.7) {
                    Instant tAtencion = instantPagoInicio.minusSeconds(120);
                    Instant tAtencionEnCurso = tAtencion.plusSeconds(15 + random.nextInt(30));

                    Notificacion notiAtencion = new Notificacion(
                            UUID.randomUUID().toString(),
                            cuentaSim,
                            TipoNotificacion.Atencion,
                            true, // leida
                            tAtencion,
                            null,
                            null,
                            null,
                            true,
                            camareroAsignado.id(),
                            camareroAsignado.username(),
                            tAtencionEnCurso
                    );
                    notificacionRepository.save(notiAtencion);
                }

                // Simular el pago (pago único 70%, o pagos parciales 30%)
                boolean splitPayment = simOrdenes.size() >= 2 && random.nextDouble() < 0.3;

                if (splitPayment) {
                    List<SimulatedOrden> shuffled = new ArrayList<>(simOrdenes);
                    Collections.shuffle(shuffled, random);

                    int k = 2 + random.nextInt(2); // 2 o 3 partes
                    List<List<SimulatedOrden>> parts = new ArrayList<>();
                    for (int idx = 0; idx < k; idx++) {
                        parts.add(new ArrayList<>());
                    }
                    for (int idx = 0; idx < shuffled.size(); idx++) {
                        parts.get(idx % k).add(shuffled.get(idx));
                    }
                    parts.removeIf(List::isEmpty);
                    k = parts.size();

                    Instant tPay = instantPagoInicio;
                    MetodoPago partMetodo = MetodoPago.TARJETA;

                    for (int j = 0; j < k; j++) {
                        tPay = instantPagoInicio.plus(j * (30 + random.nextInt(60)), ChronoUnit.SECONDS);
                        partMetodo = random.nextBoolean() ? MetodoPago.EFECTIVO : MetodoPago.TARJETA;

                        for (SimulatedOrden o : parts.get(j)) {
                            Orden orden = new Orden(
                                    o.id,
                                    o.pedido,
                                    o.plato,
                                    o.plato.precio(),
                                    OrdenEstado.Entregado,
                                    o.fechaOrden,
                                    "",
                                    false,
                                    true, // pagada
                                    Optional.of(tPay),
                                    Optional.of(partMetodo)
                            );
                            ordenRepository.save(orden);
                            ordenesGeneradas.incrementAndGet();
                        }

                        // Al registrar el último pago parcial, cerramos la cuenta completa
                        if (j == k - 1) {
                            Cuenta cuentaPagada = new Cuenta(
                                    cuentaSim.id(),
                                    cuentaSim.mesas(),
                                    true, // payed
                                    cuentaSim.reserva(),
                                    cuentaSim.fechaCreacion(),
                                    Optional.of(tPay),
                                    cuentaSim.password(),
                                    Optional.of(partMetodo)
                            );
                            cuentaRepository.save(cuentaPagada);
                        }
                    }
                } else {
                    MetodoPago metodoPago = random.nextBoolean() ? MetodoPago.EFECTIVO : MetodoPago.TARJETA;

                    for (SimulatedOrden o : simOrdenes) {
                        Orden orden = new Orden(
                                o.id,
                                o.pedido,
                                o.plato,
                                o.plato.precio(),
                                OrdenEstado.Entregado,
                                o.fechaOrden,
                                "",
                                false,
                                true, // pagada
                                Optional.of(instantPagoInicio),
                                Optional.of(metodoPago)
                        );
                        ordenRepository.save(orden);
                        ordenesGeneradas.incrementAndGet();
                    }

                    Cuenta cuentaPagada = new Cuenta(
                            cuentaSim.id(),
                            cuentaSim.mesas(),
                            true, // payed
                            cuentaSim.reserva(),
                            cuentaSim.fechaCreacion(),
                            Optional.of(instantPagoInicio),
                            cuentaSim.password(),
                            Optional.of(metodoPago)
                    );
                    cuentaRepository.save(cuentaPagada);
                }
            }
            System.out.println("Día " + dia.toLocalDate() + " simulado con éxito (" + cuentasPorDia + " cuentas).");
                } catch (Exception e) {
                    System.err.println("Error simulando el día offset " + dayOffset + ": " + e.getMessage());
                    e.printStackTrace();
                }
            }));
        }

        // Esperar a que terminen todos los hilos
        for (Future<?> future : futures) {
            try {
                future.get();
            } catch (Exception e) {
                System.err.println("Error esperando fin de tarea: " + e.getMessage());
            }
        }
        executor.shutdown();

        System.out.println("========== SIMULACIÓN COMPLETADA ==========");
        System.out.println("Cuentas generadas: " + cuentasGeneradas.get());
        System.out.println("Órdenes generadas: " + ordenesGeneradas.get());
    }

    private static int tiempoEstimadoMinutos(Categoria categoria) {
        if (categoria == null) return 12;
        return switch (categoria) {
            case Entrante -> 8;
            case Principal -> 15;
            case Postre -> 6;
            case Bebida -> 4;
        };
    }

    private static class SimulatedOrden {
        final String id;
        final Pedido pedido;
        final Plato plato;
        final Instant fechaOrden;

        Instant fechaPreparacion;
        Instant fechaListo;
        Instant fechaEntregado;

        SimulatedOrden(String id, Pedido pedido, Plato plato, Instant fechaOrden) {
            this.id = id;
            this.pedido = pedido;
            this.plato = plato;
            this.fechaOrden = fechaOrden;
        }

        OrdenEstado getEstadoAt(Instant t) {
            if (fechaEntregado != null && !t.isBefore(fechaEntregado)) {
                return OrdenEstado.Entregado;
            }
            if (fechaListo != null && !t.isBefore(fechaListo)) {
                return OrdenEstado.Listo;
            }
            if (fechaPreparacion != null && !t.isBefore(fechaPreparacion)) {
                return OrdenEstado.Preparación;
            }
            return OrdenEstado.Pendiente;
        }
    }
}
