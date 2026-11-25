package util;

import com.google.cloud.firestore.Firestore;
import model.Cuenta;
import model.Mesa;
import model.Orden;
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
import java.util.stream.Collectors;

public final class SincronizadorEstadisticas {

    private SincronizadorEstadisticas() {}

    private record ClavePago(
            String cuentaId,
            Instant fechaPago,
            String metodoPago
    ) {}

    public static void sincronizar(Firestore db) {

        System.out.println("🔄 Iniciando sincronización de estadísticas desde Firestore...");

        try {

            FirestoreCuentaRepository cuentaRepository =
                    new FirestoreCuentaRepository(db);

            FirestorePedidoRepository pedidoRepository =
                    new FirestorePedidoRepository(db);

            FirestoreOrdenRepository ordenRepository =
                    new FirestoreOrdenRepository(
                            db,
                            pedidoRepository,
                            cuentaRepository
                    );

            List<Orden> ordenesPagadas = ordenRepository.findByPagada(true)
                    .stream()
                    .filter(o -> o.pedido() != null)
                    .filter(o -> o.pedido().cuenta() != null)
                    .filter(o -> o.pedido().cuenta().id() != null)
                    .filter(o -> o.fechaPago().isPresent())
                    .filter(o -> o.metodoPago().isPresent())
                    .toList();

            Map<String, List<Orden>> ordenesPorCuenta =
                    ordenesPagadas.stream()
                            .collect(Collectors.groupingBy(
                                    o -> o.pedido().cuenta().id(),
                                    LinkedHashMap::new,
                                    Collectors.toList()
                            ));

            Map<ClavePago, List<Orden>> pagosAgrupados =
                    ordenesPagadas.stream()
                            .collect(Collectors.groupingBy(
                                    o -> new ClavePago(
                                            o.pedido().cuenta().id(),
                                            o.fechaPago().orElse(o.fecha()),
                                            o.metodoPago()
                                                    .map(Enum::name)
                                                    .orElse("")
                                    ),
                                    LinkedHashMap::new,
                                    Collectors.toList()
                            ));

            File dirPublic = new File("frontend/public");

            if (!dirPublic.exists()) {
                dirPublic = new File("../frontend/public");
            }

            if (!dirPublic.exists()) {
                dirPublic.mkdirs();
            }

            File csvFile = new File(dirPublic, "ganancias.csv");

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
                                "tipoPagoCuenta;" +
                                "fechaPago;" +
                                "metodoPago;" +
                                "totalPago;" +
                                "numeroOrdenes;" +
                                "ordenIds;" +
                                "ordenes"
                );

                pagosAgrupados.entrySet()
                        .stream()
                        .sorted(Comparator.comparing(e -> e.getKey().fechaPago()))
                        .forEach(entry -> {

                            ClavePago clave = entry.getKey();
                            List<Orden> ordenesPago = entry.getValue();

                            BigDecimal totalPago =
                                    ordenesPago.stream()
                                            .map(Orden::precio)
                                            .reduce(BigDecimal.ZERO, BigDecimal::add);

                            List<Orden> ordenesCuenta =
                                    ordenesPorCuenta.getOrDefault(
                                            clave.cuentaId(),
                                            List.of()
                                    );

                            long numeroPagosCuenta =
                                    ordenesCuenta.stream()
                                            .filter(o -> o.fechaPago().isPresent())
                                            .map(o ->
                                                    o.fechaPago().get().toString()
                                                            + "|"
                                                            + o.metodoPago()
                                                            .map(Enum::name)
                                                            .orElse("")
                                            )
                                            .distinct()
                                            .count();

                            String tipoPagoCuenta =
                                    numeroPagosCuenta > 1
                                            ? "PARCIAL"
                                            : "COMPLETO";

                            String mesa = obtenerMesa(
                                    clave.cuentaId(),
                                    cuentaRepository
                            );

                            String ordenIds =
                                    ordenesPago.stream()
                                            .map(Orden::id)
                                            .collect(Collectors.joining(" | "));

                            String ordenes =
                                    ordenesPago.stream()
                                            .map(o -> {

                                                String nombre =
                                                        o.plato() != null
                                                                ? o.plato().nombre()
                                                                : "SIN_PLATO";

                                                nombre = repararTexto(nombre);

                                                return nombre
                                                        + " ("
                                                        + o.precio()
                                                        + " euros)";
                                            })
                                            .collect(Collectors.joining(" | "));

                            writer.println(
                                    csv(clave.cuentaId()) + ";" +
                                            csv(mesa) + ";" +
                                            csv(tipoPagoCuenta) + ";" +
                                            csv(clave.fechaPago().toString()) + ";" +
                                            csv(clave.metodoPago()) + ";" +
                                            csv(String.format(java.util.Locale.US, "%.2f", totalPago.doubleValue())) + ";" +
                                            csv(String.valueOf(ordenesPago.size())) + ";" +
                                            csv(ordenIds) + ";" +
                                            csv(ordenes)
                            );
                        });
            }

            System.out.println(
                    "✅ CSV generado correctamente en: "
                            + csvFile.getAbsolutePath()
            );

        } catch (Exception e) {

            System.err.println(
                    "❌ Error sincronizando estadísticas: "
                            + e.getMessage()
            );

            e.printStackTrace();
        }
    }

    private static String obtenerMesa(
            String cuentaId,
            FirestoreCuentaRepository cuentaRepository
    ) {

        try {

            return cuentaRepository.findById(cuentaId)
                    .map(Cuenta::mesas)
                    .orElse(List.of())
                    .stream()
                    .map(Mesa::id)
                    .collect(Collectors.joining(", "));

        } catch (Exception e) {

            return "";
        }
    }

    private static String csv(String valor) {

        if (valor == null) {
            return "";
        }

        String limpio = repararTexto(valor)
                .replace("\n", " ")
                .replace("\r", " ")
                .trim();

        limpio = limpio.replace("\"", "\"\"");

        return "\"" + limpio + "\"";
    }

    private static String repararTexto(String texto) {

        if (texto == null) {
            return "";
        }

        if (
                texto.contains("Ã") ||
                        texto.contains("Â") ||
                        texto.contains("�")
        ) {
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