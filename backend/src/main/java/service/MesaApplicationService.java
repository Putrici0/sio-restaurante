package service;

import model.*;
import repository.interfaces.CuentaRepository;
import repository.interfaces.MesaRepository;
import repository.interfaces.OrdenRepository;
import repository.interfaces.PedidoRepository;
import repository.interfaces.PlatoRepository;
import service.domain.BuffetLibre;
import java.math.BigDecimal;

import java.security.SecureRandom;
import java.time.Instant;
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
    private final PlatoRepository platoRepository;

    private static final SecureRandom RANDOM = new SecureRandom();

    public MesaApplicationService(
            MesaRepository mesaRepository,
            CuentaRepository cuentaRepository,
            PedidoRepository pedidoRepository,
            OrdenRepository ordenRepository,
            PlatoRepository platoRepository
    ) {
        this.mesaRepository = mesaRepository;
        this.cuentaRepository = cuentaRepository;
        this.pedidoRepository = pedidoRepository;
        this.ordenRepository = ordenRepository;
        this.platoRepository = platoRepository;
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

    /**
     * Apertura explicita de sesion: crea la cuenta para la mesa (o su grupo).
     * Las reservas no se asignan automaticamente; el personal decide que mesa abrir.
     */
    public Cuenta ocuparMesa(String mesaId) {
        return ocuparMesa(mesaId, obtenerMesa(mesaId).capacidad());
    }

    public Cuenta ocuparMesa(String mesaId, int comensales) {
        return ocuparMesa(mesaId, comensales, 0);
    }

    /**
     * Abre la sesion de la mesa para un numero de comensales (de los que 'ninos' son niños
     * con tarifa infantil) y carga en la cuenta la tarifa del buffet por cada uno.
     */
    public Cuenta ocuparMesa(String mesaId, int comensales, int ninos) {
        if (comensales < 1) {
            throw new IllegalArgumentException("Indica cuántos comensales se sientan en la mesa");
        }
        if (ninos < 0 || ninos >= comensales) {
            throw new IllegalArgumentException("En la mesa tiene que haber al menos un adulto");
        }
        if (estaOcupada(mesaId)) {
            throw new IllegalArgumentException("La mesa ya está ocupada o forma parte de un grupo ocupado");
        }

        Mesa mesaActual = obtenerMesa(mesaId);
        List<String> idsGrupo = grupoIdsDe(mesaActual);

        List<Mesa> grupoMesas = new ArrayList<>();
        for (String id : idsGrupo) {
            if (estaOcupada(id)) {
                throw new IllegalArgumentException("La mesa " + id + " del grupo ya está ocupada");
            }
            Mesa mesa = obtenerMesa(id);
            if (mesa.sucia()) {
                throw new IllegalArgumentException("La mesa " + id + " está sucia. Márcala como limpia antes de abrirla");
            }
            grupoMesas.add(mesa);
        }

        int capacidad = grupoMesas.stream().mapToInt(Mesa::capacidad).sum();
        if (comensales > capacidad + 2) {
            throw new IllegalArgumentException("La mesa " + mesaId + " es para " + capacidad + " comensales");
        }

        Instant ahora = Instant.now();
        Cuenta cuenta = cuentaRepository.save(new Cuenta(
                null, grupoMesas, false, Optional.empty(), ahora, Optional.empty(),
                generarPassword(), Optional.empty(), false, comensales
        ));
        cargarTarifaBuffet(cuenta, comensales, ninos, ahora);
        return cuenta;
    }

    /** Una linea "Buffet libre" por adulto y una "Buffet infantil" por niño, ya servidas (no pasan por cocina). */
    private void cargarTarifaBuffet(Cuenta cuenta, int comensales, int ninos, Instant ahora) {
        Plato adulto = platoRepository.findById(BuffetLibre.tarifaDelTurno(ahora)).orElse(null);
        if (adulto == null) {
            return;
        }
        // Si la carta no tiene tarifa infantil, los niños pagan la de adulto
        Plato infantil = platoRepository.findById(BuffetLibre.tarifaInfantilDelTurno(ahora)).orElse(adulto);
        Pedido cubiertos = pedidoRepository.save(new Pedido(null, cuenta, PedidoEstado.Listo, ahora));
        for (int i = 0; i < comensales; i++) {
            Plato tarifa = i < comensales - ninos ? adulto : infantil;
            ordenRepository.save(new Orden(null, cubiertos, tarifa,
                    tarifa.precio() == null ? BigDecimal.ZERO : tarifa.precio(),
                    OrdenEstado.Entregado, ahora, "", false, Optional.empty(), Optional.empty()));
        }
    }

    /**
     * Cierre explicito de sesion: la mesa deja de admitir pedidos y pasa a
     * "pendiente de cobro" hasta que se registre el pago.
     */
    public Cuenta cerrarSesionMesa(String mesaId) {
        Cuenta cuentaActiva = obtenerCuentaActivaDeMesa(mesaId)
                .orElseThrow(() -> new IllegalArgumentException("La mesa no tiene una sesión abierta"));

        if (cuentaActiva.cobroSolicitado()) {
            return cuentaActiva;
        }

        return cuentaRepository.update(cuentaActiva.id(), cuentaActiva.conCobroSolicitado(true));
    }

    /** Reabre una sesion cerrada por error (de "pendiente de cobro" vuelve a "ocupada"). */
    public Cuenta reabrirSesionMesa(String mesaId) {
        Cuenta cuentaActiva = obtenerCuentaActivaDeMesa(mesaId)
                .orElseThrow(() -> new IllegalArgumentException("La mesa no tiene una sesión abierta"));

        if (!cuentaActiva.cobroSolicitado()) {
            return cuentaActiva;
        }

        return cuentaRepository.update(cuentaActiva.id(), cuentaActiva.conCobroSolicitado(false));
    }

    /** El personal confirma que la mesa esta limpia y vuelve a estar libre. */
    public List<Mesa> limpiarMesa(String mesaId) {
        List<Mesa> grupo = obtenerGrupoMesas(mesaId);
        for (Mesa mesa : grupo) {
            if (mesa.sucia()) {
                mesaRepository.update(mesa.id(), mesa.conSucia(false));
            }
        }
        return obtenerGrupoMesas(mesaId);
    }

    /** Marca como sucias (y separa) las mesas de una sesion que acaba de terminar. */
    public void marcarMesasSucias(List<Mesa> mesas) {
        if (mesas == null) return;
        for (Mesa mesa : mesas) {
            if (mesa == null || mesa.id() == null || mesa.id().isBlank()) continue;
            Mesa actual = mesaRepository.findById(mesa.id()).orElse(mesa);
            mesaRepository.update(actual.id(), actual.conMesasUnidas(List.of(actual.id())).conSucia(true));
        }
    }

    /**
     * Termina la sesion sin cobro (clientes que se marchan sin consumir):
     * cancela lo pendiente, cierra la cuenta y deja la mesa sucia.
     */
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
                cuentaActiva.metodoPago(),
                true,
                cuentaActiva.comensales()
        );

        Cuenta resultado = cuentaRepository.update(cuentaActiva.id(), cuentaLiberada);
        marcarMesasSucias(cuentaActiva.mesas());
        return resultado;
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
            mesaRepository.update(mesa.id(), mesa.conMesasUnidas(List.copyOf(grupoIds)));
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
                    cuentaActiva.metodoPago(),
                    cuentaActiva.cobroSolicitado(),
                    cuentaActiva.comensales()
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
            mesaRepository.update(mesa.id(), mesa.conMesasUnidas(List.of(mesa.id())));
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
                    cuentaActiva,
                    estadoDe(mesa, cuentaActiva)
            ));
        }

        return vista;
    }

    public record MesaVista(
            String id,
            int capacidad,
            List<String> grupoMesaIds,
            String cuentaActivaId,
            Cuenta cuentaActiva,
            EstadoMesa estado
    ) {}

    /** Estados de mesa definidos en SIGO-RSH. */
    public enum EstadoMesa { LIBRE, OCUPADA, PENDIENTE_COBRO, SUCIA }

    private EstadoMesa estadoDe(Mesa mesa, Cuenta cuentaActiva) {
        if (cuentaActiva != null) {
            return cuentaActiva.cobroSolicitado() ? EstadoMesa.PENDIENTE_COBRO : EstadoMesa.OCUPADA;
        }
        return mesa.sucia() ? EstadoMesa.SUCIA : EstadoMesa.LIBRE;
    }

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
