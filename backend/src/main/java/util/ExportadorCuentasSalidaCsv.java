package util;

import com.google.cloud.firestore.Firestore;
import config.FirebaseConfig;
import config.FirestoreClientProvider;
import model.Cuenta;
import model.Mesa;
import model.Orden;
import model.OrdenEstado;
import model.Pedido;
import repository.firestore.FirestoreCuentaRepository;
import repository.firestore.FirestoreOrdenRepository;
import repository.firestore.FirestorePedidoRepository;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;

public final class ExportadorCuentasSalidaCsv {

    private ExportadorCuentasSalidaCsv() {}

    public static void main(String[] args) {
        FirebaseConfig.init();
        Firestore db = FirestoreClientProvider.getFirestore();
        exportar(db);
    }

    public static void exportar(Firestore db) {
        System.out.println("Iniciando exportacion de cuentas y pagos...");

        try {
            FirestoreCuentaRepository cuentaRepository = new FirestoreCuentaRepository(db);
            FirestorePedidoRepository pedidoRepository = new FirestorePedidoRepository(db);
            FirestoreOrdenRepository ordenRepository =
                    new FirestoreOrdenRepository(db, pedidoRepository, cuentaRepository);

            List<Cuenta> cuentas = cuentaRepository.findAll().stream()
                    .filter(cuenta -> cuenta.id() != null && !cuenta.id().isBlank())
                    .sorted(Comparator.comparing(Cuenta::fechaCreacion))
                    .toList();

            Map<String, CuentaExportRow> filasPorCuenta = construirFilas(cuentas, pedidoRepository, ordenRepository);

            File dirPublic = new File("frontend/public");

            if (!dirPublic.exists()) {
                dirPublic = new File("../frontend/public");
            }

            if (!dirPublic.exists()) {
                dirPublic.mkdirs();
            }

            File csvFile = new File(dirPublic, "cuentas_salida.csv");

            try (PrintWriter writer = new PrintWriter(
                    new OutputStreamWriter(
                            new FileOutputStream(csvFile),
                            StandardCharsets.UTF_8
                    )
            )) {
                writer.write('\uFEFF');
                writer.println("sep=;");
                writer.println(
                        "cuentaId;" +
                                "mesa;" +
                                "fechaCreacionCuenta;" +
                                "cuentaPagada;" +
                                "fechaPagoCuenta;" +
                                "totalCuenta;" +
                                "numeroPedidos;" +
                                "numeroOrdenes;" +
                                "numeroOrdenesPagadas;" +
                                "fechaUltimoPagoOrden;" +
                                "ultimoPagoOrdenIds;" +
                                "totalUltimoPagoOrden"
                );

                cuentas.forEach(cuenta -> writer.println(
                        filasPorCuenta.getOrDefault(cuenta.id(), CuentaExportRow.vacia(cuenta)).toCsv()
                ));
            }

            System.out.println("CSV generado correctamente en: " + csvFile.getAbsolutePath());
        } catch (Exception e) {
            System.err.println("Error exportando cuentas y pagos: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private static Map<String, CuentaExportRow> construirFilas(
            List<Cuenta> cuentas,
            FirestorePedidoRepository pedidoRepository,
            FirestoreOrdenRepository ordenRepository
    ) {
        Map<String, Cuenta> cuentasPorId = cuentas.stream()
                .collect(Collectors.toMap(Cuenta::id, cuenta -> cuenta, (a, b) -> a, LinkedHashMap::new));

        List<Pedido> pedidos = pedidoRepository.findByCuentaIds(List.copyOf(cuentasPorId.keySet()));
        Map<String, List<Pedido>> pedidosPorCuentaId = pedidos.stream()
                .filter(pedido -> pedido.cuenta() != null)
                .filter(pedido -> pedido.cuenta().id() != null && !pedido.cuenta().id().isBlank())
                .collect(Collectors.groupingBy(
                        pedido -> pedido.cuenta().id(),
                        LinkedHashMap::new,
                        Collectors.toList()
                ));

        List<String> pedidoIds = pedidos.stream()
                .map(Pedido::id)
                .filter(Objects::nonNull)
                .filter(id -> !id.isBlank())
                .toList();

        Map<String, List<Orden>> ordenesPorCuentaId = ordenRepository.findByPedidosIds(pedidoIds).stream()
                .filter(orden -> orden.pedido() != null)
                .filter(orden -> orden.pedido().cuenta() != null && orden.pedido().cuenta().id() != null)
                .collect(Collectors.groupingBy(
                        orden -> orden.pedido().cuenta().id(),
                        LinkedHashMap::new,
                        Collectors.toList()
                ));

        Map<String, CuentaExportRow> filas = new LinkedHashMap<>();
        for (Cuenta cuenta : cuentas) {
            List<Pedido> pedidosCuenta = pedidosPorCuentaId.getOrDefault(cuenta.id(), List.of());
            List<Orden> ordenesCuenta = ordenesPorCuentaId.getOrDefault(cuenta.id(), List.of());
            filas.put(cuenta.id(), construirFila(cuenta, pedidosCuenta, ordenesCuenta));
        }
        return filas;
    }

    private static CuentaExportRow construirFila(Cuenta cuenta, List<Pedido> pedidos, List<Orden> ordenes) {
        List<Orden> ordenesActivas = ordenes.stream()
                .filter(orden -> orden.ordenEstado() != OrdenEstado.Cancelado)
                .toList();

        BigDecimal totalCuenta = ordenesActivas.stream()
                .map(Orden::precio)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<Orden> ordenesPagadas = ordenesActivas.stream()
                .filter(Orden::pagada)
                .filter(orden -> orden.fechaPago().isPresent())
                .toList();

        Optional<Instant> fechaUltimoPago = ordenesPagadas.stream()
                .map(Orden::fechaPago)
                .flatMap(Optional::stream)
                .max(Comparator.naturalOrder());

        List<Orden> ordenesUltimoPago = fechaUltimoPago
                .map(fecha -> ordenesPagadas.stream()
                        .filter(orden -> fecha.equals(orden.fechaPago().orElse(null)))
                        .sorted(Comparator.comparing(Orden::id, Comparator.nullsLast(String::compareTo)))
                        .toList())
                .orElse(List.of());

        BigDecimal totalUltimoPago = ordenesUltimoPago.stream()
                .map(Orden::precio)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        String ordenIdsUltimoPago = ordenesUltimoPago.stream()
                .map(Orden::id)
                .filter(Objects::nonNull)
                .collect(Collectors.joining(", "));

        return new CuentaExportRow(
                cuenta,
                pedidos.size(),
                ordenesActivas.size(),
                ordenesPagadas.size(),
                totalCuenta,
                fechaUltimoPago.orElse(null),
                ordenIdsUltimoPago,
                totalUltimoPago
        );
    }

    private record CuentaExportRow(
            Cuenta cuenta,
            int numeroPedidos,
            int numeroOrdenes,
            int numeroOrdenesPagadas,
            BigDecimal totalCuenta,
            Instant fechaUltimoPagoOrden,
            String ultimoPagoOrdenIds,
            BigDecimal totalUltimoPagoOrden
    ) {
        static CuentaExportRow vacia(Cuenta cuenta) {
            return new CuentaExportRow(
                    cuenta,
                    0,
                    0,
                    0,
                    BigDecimal.ZERO,
                    null,
                    "",
                    BigDecimal.ZERO
            );
        }

        String toCsv() {
            return String.join(";",
                    csv(cuenta.id()),
                    csv(obtenerMesa(cuenta)),
                    csv(formatearInstant(cuenta.fechaCreacion())),
                    csv(String.valueOf(cuenta.payed())),
                    csv(formatearInstant(cuenta.fechaPago().orElse(null))),
                    csv(formatearDecimal(totalCuenta)),
                    csv(String.valueOf(numeroPedidos)),
                    csv(String.valueOf(numeroOrdenes)),
                    csv(String.valueOf(numeroOrdenesPagadas)),
                    csv(formatearInstant(fechaUltimoPagoOrden)),
                    csv(ultimoPagoOrdenIds),
                    csv(formatearDecimal(totalUltimoPagoOrden))
            );
        }
    }

    private static String obtenerMesa(Cuenta cuenta) {
        if (cuenta == null || cuenta.mesas() == null) {
            return "";
        }

        return cuenta.mesas().stream()
                .map(Mesa::id)
                .filter(Objects::nonNull)
                .collect(Collectors.joining(", "));
    }

    private static String formatearInstant(Instant instant) {
        return instant != null ? instant.toString() : "";
    }

    private static String formatearDecimal(BigDecimal valor) {
        if (valor == null) {
            return "";
        }

        return String.format(java.util.Locale.US, "%.2f", valor.doubleValue());
    }

    private static String csv(String valor) {
        if (valor == null) {
            return "\"\"";
        }

        String limpio = repararTexto(valor)
                .replace("\n", " ")
                .replace("\r", " ")
                .trim()
                .replace("\"", "\"\"");

        return "\"" + limpio + "\"";
    }

    private static String repararTexto(String texto) {
        if (texto == null) {
            return "";
        }

        if (texto.contains("ÃƒÆ’") || texto.contains("Ãƒâ€š") || texto.contains("Ã¯Â¿Â½")) {
            try {
                return new String(
                        texto.getBytes(StandardCharsets.ISO_8859_1),
                        StandardCharsets.UTF_8
                );
            } catch (Exception e) {
                return texto;
            }
        }

        return texto;
    }
}
