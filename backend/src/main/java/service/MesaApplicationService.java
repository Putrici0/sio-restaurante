package service;

import model.*;
import repository.interfaces.CuentaRepository;
import repository.interfaces.MesaRepository;
import repository.interfaces.OrdenRepository;
import repository.interfaces.PedidoRepository;
import repository.interfaces.ReservaRepository;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

public class MesaApplicationService {
    private final MesaRepository mesaRepository;
    private final CuentaRepository cuentaRepository;
    private final PedidoRepository pedidoRepository;
    private final OrdenRepository ordenRepository;
    private final ReservaRepository reservaRepository;

    private static final SecureRandom RANDOM = new SecureRandom();

    public MesaApplicationService(
            MesaRepository mesaRepository,
            CuentaRepository cuentaRepository,
            PedidoRepository pedidoRepository,
            OrdenRepository ordenRepository,
            ReservaRepository reservaRepository
    ) {
        this.mesaRepository = mesaRepository;
        this.cuentaRepository = cuentaRepository;
        this.pedidoRepository = pedidoRepository;
        this.ordenRepository = ordenRepository;
        this.reservaRepository = reservaRepository;
    }

    public boolean estaOcupada(String mesaId) {
        return obtenerCuentaActivaDeMesa(mesaId).isPresent();
    }

    public boolean estaLibre(String mesaId) {
        return !estaOcupada(mesaId);
    }

    public Mesa obtenerMesa(String mesaId) {
        return mesaRepository.findById(mesaId)
                .orElseThrow(() -> new IllegalArgumentException("La mesa no existe"));
    }

    public Optional<Cuenta> obtenerCuentaActivaDeMesa(String mesaId) {
        // En lugar de confiar solo en el grupo local, buscamos en el repositorio
        // cualquier cuenta activa que contenga esta mesaId en su lista de mesas.
        List<Cuenta> cuentasActivas = cuentaRepository.findActivasByMesaIds(List.of(mesaId));
        return cuentasActivas.stream().findFirst();
    }

    public Cuenta ocuparMesa(String mesaId) {
        // 1. Bloqueo de seguridad: ¿Está ocupada ya por alguna cuenta activa?
        if (estaOcupada(mesaId)) {
            throw new IllegalArgumentException("La mesa ya está ocupada o forma parte de un grupo ocupado");
        }

        Optional<Reserva> reservaOpt = buscarReservaActivaParaMesa(mesaId);
        List<String> idsAUnir = new ArrayList<>();

        if (reservaOpt.isPresent()) {
            Reserva reserva = reservaOpt.get();
            idsAUnir = reserva.mesasIds();
            if (idsAUnir == null || idsAUnir.isEmpty()) {
                idsAUnir = List.of(mesaId);
            }
        } else {
            // Si no hay reserva, usamos la unión actual de la mesa
            Mesa mesaActual = obtenerMesa(mesaId);
            idsAUnir = grupoIdsDe(mesaActual);
        }

        // 2. Validar que NINGUNA de las mesas del grupo esté ocupada
        List<Mesa> grupoMesasFinal = new ArrayList<>();
        for (String id : idsAUnir) {
            if (estaOcupada(id)) {
                throw new IllegalArgumentException("La mesa " + id + " del grupo ya está ocupada");
            }
            grupoMesasFinal.add(obtenerMesa(id));
        }

        // 3. Forzar la unión física en la DB para todas las mesas del grupo
        // Esto es CRITICO para que el frontend las vea como una sola entidad
        if (idsAUnir.size() > 1) {
            for (String id : idsAUnir) {
                Mesa m = obtenerMesa(id);
                mesaRepository.update(id, new Mesa(id, m.capacidad(), List.copyOf(idsAUnir)));
            }
            // Refrescar la lista de mesas con la unión ya persistida
            grupoMesasFinal.clear();
            for (String id : idsAUnir) {
                grupoMesasFinal.add(obtenerMesa(id));
            }
        }

        // 4. Crear la cuenta única para el grupo
        Cuenta nuevaCuenta = new Cuenta(
                null,
                grupoMesasFinal,
                false,
                reservaOpt,
                Instant.now(),
                Optional.empty(),
                generarPassword(),
                Optional.empty()
        );

        return cuentaRepository.save(nuevaCuenta);
    }

    private Optional<Reserva> buscarReservaActivaParaMesa(String mesaId) {
        Instant ahora = Instant.now();
        List<Reserva> todas = reservaRepository.findAll();

        return todas.stream()
                .filter(r -> "Confirmado".equalsIgnoreCase(r.estado()))
                .filter(r -> r.mesasIds() != null && r.mesasIds().contains(mesaId))
                .filter(r -> {
                    try {
                        String fechaBase = r.fecha().toString().split("T")[0];
                        String horaStr = r.hora() == null || r.hora().isBlank() ? "00:00" : r.hora();
                        Instant inicioReserva = Instant.parse(fechaBase + "T" + horaStr + ":00Z");

                        // Solo unimos automáticamente si faltan 15 minutos o ya pasó la hora (pero menos de 15 mins)
                        long diffMinutos = ChronoUnit.MINUTES.between(ahora, inicioReserva);
                        return Math.abs(diffMinutos) <= 15;
                    } catch (Exception e) {
                        return false;
                    }
                })
                .min(Comparator.comparingLong(r -> {
                    try {
                        String fechaBase = r.fecha().toString().split("T")[0];
                        String horaStr = r.hora() == null || r.hora().isBlank() ? "00:00" : r.hora();
                        Instant inicioReserva = Instant.parse(fechaBase + "T" + horaStr + ":00Z");
                        // En caso de haber varias, nos quedamos con la más cercana al momento actual
                        return Math.abs(ChronoUnit.SECONDS.between(ahora, inicioReserva));
                    } catch (Exception e) {
                        return Long.MAX_VALUE;
                    }
                }));
    }

    public Cuenta liberarMesa(String mesaId) {
        Cuenta cuentaActiva = obtenerCuentaActivaDeMesa(mesaId)
                .orElseThrow(() -> new IllegalArgumentException("La mesa ya esta libre"));

        List<Pedido> pedidos = pedidoRepository.findByCuenta(cuentaActiva);
        List<String> pedidosIds = pedidos.stream()
                .map(Pedido::id)
                .filter(id -> id != null && !id.isBlank())
                .toList();

        List<Orden> ordenes = ordenRepository.findByPedidosIds(pedidosIds);
        for (Orden orden : ordenes) {
            if (orden.ordenEstado() == OrdenEstado.Cancelado) {
                continue;
            }

            Orden ordenCancelada = new Orden(
                    orden.id(),
                    orden.pedido(),
                    orden.plato(),
                    orden.precio(),
                    OrdenEstado.Cancelado,
                    orden.fecha(),
                    orden.detalles(),
                    orden.urgente(),
                    orden.pagada(),
                    orden.fechaPago(),
                    orden.metodoPago()
            );

            ordenRepository.update(orden.id(), ordenCancelada);
        }

        Cuenta cuentaLiberada = new Cuenta(
                cuentaActiva.id(),
                cuentaActiva.mesas(),
                true,
                cuentaActiva.reserva(),
                cuentaActiva.fechaCreacion(),
                Optional.of(Instant.now()),
                "",
                cuentaActiva.metodoPago()
        );

        // Finalizar la reserva si existe
        if (cuentaActiva.reserva().isPresent()) {
            Reserva reserva = cuentaActiva.reserva().get();
            Reserva reservaFinalizada = new Reserva(
                    reserva.id(),
                    reserva.nombre(),
                    reserva.telefono(),
                    reserva.fecha(),
                    reserva.hora(),
                    reserva.capacidad(),
                    reserva.zona(),
                    reserva.mesasIds(),
                    reserva.nota(),
                    "Finalizado",
                    reserva.fechaCreacion()
            );
            reservaRepository.update(reserva.id(), reservaFinalizada);
        }

        return cuentaRepository.update(cuentaActiva.id(), cuentaLiberada);
    }

    public List<Mesa> unirMesas(String mesaIdOrigen, String mesaIdDestino) {
        if (mesaIdOrigen == null || mesaIdOrigen.isBlank() || mesaIdDestino == null || mesaIdDestino.isBlank()) {
            throw new IllegalArgumentException("Debes indicar dos mesas validas para unir");
        }

        Mesa mesaOrigen = obtenerMesa(mesaIdOrigen);
        Mesa mesaDestino = obtenerMesa(mesaIdDestino);

        Set<String> grupoIds = new LinkedHashSet<>(grupoIdsDe(mesaOrigen));
        grupoIds.addAll(grupoIdsDe(mesaDestino));

        if (grupoIds.size() < 2) {
            return obtenerGrupoMesas(mesaIdOrigen);
        }

        List<Mesa> mesasDelGrupo = grupoIds.stream()
                .map(this::obtenerMesa)
                .sorted(Comparator.comparing(Mesa::id, this::compararMesaId))
                .toList();

        List<Cuenta> cuentasActivas = cuentasActivasDeGrupo(grupoIds);
        Set<String> cuentasActivasIds = cuentasActivas.stream()
                .map(Cuenta::id)
                .collect(Collectors.toSet());

        if (cuentasActivasIds.size() > 1) {
            throw new IllegalArgumentException("No se pueden unir mesas con cuentas activas distintas");
        }

        for (Mesa mesa : mesasDelGrupo) {
            mesaRepository.update(mesa.id(), new Mesa(mesa.id(), mesa.capacidad(), List.copyOf(grupoIds)));
        }

        if (!cuentasActivas.isEmpty()) {
            Cuenta cuentaActiva = cuentasActivas.getFirst();
            Cuenta cuentaActualizada = new Cuenta(
                    cuentaActiva.id(),
                    mesasDelGrupo,
                    cuentaActiva.payed(),
                    cuentaActiva.reserva(),
                    cuentaActiva.fechaCreacion(),
                    cuentaActiva.fechaPago(),
                    cuentaActiva.password(),
                    cuentaActiva.metodoPago()
            );
            cuentaRepository.update(cuentaActiva.id(), cuentaActualizada);
        }

        return obtenerGrupoMesas(mesaIdOrigen);
    }

    public List<Mesa> separarMesa(String mesaId) {
        List<Mesa> grupoMesas = obtenerGrupoMesas(mesaId);
        if (grupoMesas.size() <= 1) {
            return grupoMesas;
        }

        Set<String> grupoIds = grupoMesas.stream().map(Mesa::id).collect(Collectors.toSet());
        if (!cuentasActivasDeGrupo(grupoIds).isEmpty()) {
            throw new IllegalArgumentException("No se puede separar una agrupacion con una cuenta activa");
        }

        for (Mesa mesa : grupoMesas) {
            mesaRepository.update(mesa.id(), new Mesa(mesa.id(), mesa.capacidad(), List.of(mesa.id())));
        }

        return obtenerGrupoMesas(mesaId);
    }

    public List<Pedido> obtenerPedidosActivosDeMesa(String mesaId) {
        Optional<Cuenta> cuentaActiva = obtenerCuentaActivaDeMesa(mesaId);

        if (cuentaActiva.isEmpty()) {
            return List.of();
        }

        return pedidoRepository.findByCuenta(cuentaActiva.get());
    }

    public List<Orden> obtenerOrdenesActivasDeMesa(String mesaId) {
        List<Pedido> pedidos = obtenerPedidosActivosDeMesa(mesaId);
        List<String> pedidosIds = pedidos.stream()
                .map(Pedido::id)
                .filter(id -> id != null && !id.isBlank())
                .toList();
        return ordenRepository.findByPedidosIds(pedidosIds);
    }

    public Cuenta validarAccesoMesa(String mesaId, String password) {
        Cuenta cuentaActiva = obtenerCuentaActivaDeMesa(mesaId)
                .orElseThrow(() -> new IllegalArgumentException("La mesa no tiene cuenta activa"));

        // Aseguramos que si la mesa es parte de un grupo, validamos contra la cuenta del grupo
        // (obtenerCuentaActivaDeMesa ya busca en el grupo, pero aquí confirmamos la lógica)

        String passwordGuardada = cuentaActiva.password() == null ? "" : cuentaActiva.password().trim();
        String passwordRecibida = password == null ? "" : password.trim();

        if (!passwordGuardada.equals(passwordRecibida)) {
            throw new IllegalArgumentException("La contrasena no es correcta");
        }

        return cuentaActiva;
    }

    public List<MesaVista> obtenerVistaMesas() {
        List<Mesa> mesas = mesaRepository.findAll().stream()
                .sorted(Comparator.comparing(Mesa::id, this::compararMesaId))
                .toList();

        List<String> mesaIds = mesas.stream().map(Mesa::id).toList();
        List<Cuenta> cuentasActivas = cuentaRepository.findActivasByMesaIds(mesaIds);

        java.util.Map<String, Cuenta> cuentaPorMesaId = new java.util.HashMap<>();
        for (Cuenta cuenta : cuentasActivas) {
            if (cuenta == null || cuenta.mesas() == null) continue;
            for (Mesa mesa : cuenta.mesas()) {
                if (mesa != null && mesa.id() != null) {
                    cuentaPorMesaId.put(mesa.id(), cuenta);
                }
            }
        }

        List<MesaVista> vista = new ArrayList<>();
        for (Mesa mesa : mesas) {
            Cuenta cuentaActiva = cuentaPorMesaId.get(mesa.id());
            List<String> grupoIds = (cuentaActiva != null && cuentaActiva.mesas() != null && !cuentaActiva.mesas().isEmpty())
                    ? cuentaActiva.mesas().stream().map(Mesa::id).toList()
                    : grupoIdsDe(mesa);

            vista.add(new MesaVista(
                    mesa.id(),
                    mesa.capacidad(),
                    grupoIds,
                    cuentaActiva != null ? cuentaActiva.id() : null,
                    cuentaActiva
            ));
        }

        return vista;
    }

    public record MesaVista(
            String id,
            int capacidad,
            List<String> grupoMesaIds,
            String cuentaActivaId,
            Cuenta cuentaActiva
    ) {}

    private String generarPassword() {
        int pin = RANDOM.nextInt(9000) + 1000;
        return String.valueOf(pin);
    }

    private List<Mesa> obtenerGrupoMesas(String mesaId) {
        Mesa mesa = obtenerMesa(mesaId);
        return grupoIdsDe(mesa).stream()
                .map(id -> mesa.id().equals(id) ? mesa : obtenerMesa(id))
                .sorted(Comparator.comparing(Mesa::id, this::compararMesaId))
                .toList();
    }

    private List<String> grupoIdsDe(Mesa mesa) {
        if (mesa == null) {
            return List.of();
        }

        return mesa.mesasUnidas() == null || mesa.mesasUnidas().isEmpty()
                ? List.of(mesa.id())
                : mesa.mesasUnidas();
    }

    private List<Cuenta> cuentasActivasDeGrupo(Set<String> grupoIds) {
        if (grupoIds == null || grupoIds.isEmpty()) {
            return List.of();
        }

        return cuentaRepository.findActivasByMesaIds(List.copyOf(grupoIds));
    }

    private int compararMesaId(String left, String right) {
        try {
            return Integer.compare(Integer.parseInt(left), Integer.parseInt(right));
        } catch (NumberFormatException e) {
            return left.compareTo(right);
        }
    }
}
