package util;

import com.google.cloud.firestore.Firestore;
import config.FirebaseConfig;
import config.FirestoreClientProvider;
import model.Cuenta;
import model.Mesa;
import model.Notificacion;
import model.Orden;
import repository.firestore.FirestoreCuentaRepository;
import repository.firestore.FirestoreNotificacionRepository;
import repository.firestore.FirestoreOrdenRepository;
import repository.firestore.FirestorePedidoRepository;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public final class ExportadorOrdenesNotificacionesCsv {

    private ExportadorOrdenesNotificacionesCsv() {}

    public static void main(String[] args) {
        FirebaseConfig.init();
        Firestore db = FirestoreClientProvider.getFirestore();
        exportar(db);
    }

    public static void exportar(Firestore db) {
        System.out.println("Iniciando exportacion de ordenes y notificaciones...");

        try {
            FirestoreCuentaRepository cuentaRepository = new FirestoreCuentaRepository(db);
            FirestorePedidoRepository pedidoRepository = new FirestorePedidoRepository(db);
            FirestoreOrdenRepository ordenRepository =
                    new FirestoreOrdenRepository(db, pedidoRepository, cuentaRepository);
            FirestoreNotificacionRepository notificacionRepository =
                    new FirestoreNotificacionRepository(db);

            List<Orden> ordenes = ordenRepository.findAll().stream()
                    .filter(orden -> orden.id() != null && !orden.id().isBlank())
                    .toList();

            Map<String, List<Notificacion>> notificacionesPorOrdenId =
                    notificacionRepository.findAll().stream()
                            .filter(notificacion -> notificacion.ordenId() != null)
                            .filter(notificacion -> !notificacion.ordenId().isBlank())
                            .collect(Collectors.groupingBy(
                                    Notificacion::ordenId,
                                    LinkedHashMap::new,
                                    Collectors.collectingAndThen(
                                            Collectors.toList(),
                                            lista -> lista.stream()
                                                    .sorted(Comparator.comparing(Notificacion::fecha))
                                                    .toList()
                                    )
                            ));

            File dirPublic = new File("frontend/public");

            if (!dirPublic.exists()) {
                dirPublic = new File("../frontend/public");
            }

            if (!dirPublic.exists()) {
                dirPublic.mkdirs();
            }

            File csvFile = new File(dirPublic, "ordenes_notificaciones.csv");

            try (PrintWriter writer = new PrintWriter(
                    new OutputStreamWriter(
                            new FileOutputStream(csvFile),
                            StandardCharsets.UTF_8
                    )
            )) {
                writer.write('\uFEFF');
                writer.println("sep=;");
                writer.println(
                        "ordenId;" +
                                "pedidoId;" +
                                "cuentaId;" +
                                "mesa;" +
                                "plato;" +
                                "precio;" +
                                "estadoOrden;" +
                                "fechaCreacionOrden;" +
                                "notificacionId;" +
                                "tipoNotificacion;" +
                                "fechaCreacionNotificacion;" +
                                "nombreItemNotificacion;" +
                                "categoriaItemNotificacion;" +
                                "enCurso;" +
                                "fechaEnCursoNotificacion;" +
                                "leida;" +
                                "camareroUid;" +
                                "camareroNombre"
                );

                ordenes.stream()
                        .sorted(Comparator.comparing(Orden::fecha))
                        .forEach(orden -> {
                            List<Notificacion> notificaciones = notificacionesPorOrdenId.get(orden.id());

                            if (notificaciones == null || notificaciones.isEmpty()) {
                                writer.println(filaCsvOrdenSinNotificacion(orden));
                                return;
                            }

                            notificaciones.forEach(notificacion ->
                                    writer.println(filaCsvOrdenConNotificacion(orden, notificacion))
                            );
                        });
            }

            System.out.println("CSV generado correctamente en: " + csvFile.getAbsolutePath());
        } catch (Exception e) {
            System.err.println("Error exportando ordenes y notificaciones: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private static String filaCsvOrdenSinNotificacion(Orden orden) {
        return String.join(";",
                csv(orden.id()),
                csv(orden.pedido() != null ? orden.pedido().id() : ""),
                csv(obtenerCuentaId(orden)),
                csv(obtenerMesa(orden)),
                csv(obtenerNombrePlato(orden)),
                csv(obtenerPrecio(orden)),
                csv(orden.ordenEstado().name()),
                csv(formatearInstant(orden.fecha())),
                csv(""),
                csv(""),
                csv(""),
                csv(""),
                csv(""),
                csv(""),
                csv(""),
                csv(""),
                csv(""),
                csv("")
        );
    }

    private static String filaCsvOrdenConNotificacion(Orden orden, Notificacion notificacion) {
        return String.join(";",
                csv(orden.id()),
                csv(orden.pedido() != null ? orden.pedido().id() : ""),
                csv(obtenerCuentaId(orden)),
                csv(obtenerMesa(orden)),
                csv(obtenerNombrePlato(orden)),
                csv(obtenerPrecio(orden)),
                csv(orden.ordenEstado().name()),
                csv(formatearInstant(orden.fecha())),
                csv(notificacion.id()),
                csv(notificacion.tipo().name()),
                csv(formatearInstant(notificacion.fecha())),
                csv(notificacion.nombreItem()),
                csv(notificacion.categoriaItem()),
                csv(String.valueOf(notificacion.enCurso())),
                csv(formatearInstant(notificacion.fechaEnCurso())),
                csv(String.valueOf(notificacion.leida())),
                csv(notificacion.camareroUid()),
                csv(notificacion.camareroNombre())
        );
    }

    private static String obtenerCuentaId(Orden orden) {
        if (orden.pedido() == null || orden.pedido().cuenta() == null) {
            return "";
        }

        return orden.pedido().cuenta().id();
    }

    private static String obtenerMesa(Orden orden) {
        if (orden.pedido() == null || orden.pedido().cuenta() == null) {
            return "";
        }

        Cuenta cuenta = orden.pedido().cuenta();

        if (cuenta.mesas() == null) {
            return "";
        }

        return cuenta.mesas().stream()
                .map(Mesa::id)
                .collect(Collectors.joining(", "));
    }

    private static String obtenerNombrePlato(Orden orden) {
        if (orden.plato() == null) {
            return "SIN_PLATO";
        }

        return repararTexto(orden.plato().nombre());
    }

    private static String obtenerPrecio(Orden orden) {
        if (orden.precio() == null) {
            return "";
        }

        return String.format(java.util.Locale.US, "%.2f", orden.precio().doubleValue());
    }

    private static String formatearInstant(Instant instant) {
        return instant != null ? instant.toString() : "";
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

        if (texto.contains("Ãƒ") || texto.contains("Ã‚") || texto.contains("ï¿½")) {
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
