package model;

import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.function.Predicate;

/**
 * Mesa física del comedor. sucia = true cuando la sesión terminó y el
 * personal todavía no la ha limpiado; mientras tanto no puede abrirse.
 */
public record Mesa(String id, int capacidad, List<String> mesasUnidas, boolean sucia) {

    /** Orden natural de las mesas por su numero (1, 2, ... 15). */
    public static final Comparator<Mesa> POR_NUMERO = Comparator.comparing(Mesa::id, comparadorIdsMesa());

    public Mesa {
        mesasUnidas = normalizarMesasUnidas(id, mesasUnidas);
    }

    public Mesa(String id, int capacidad, List<String> mesasUnidas) {
        this(id, capacidad, mesasUnidas, false);
    }

    public Mesa(String id, int capacidad) {
        this(id, capacidad, List.of(id), false);
    }

    public Mesa conMesasUnidas(List<String> ids) {
        return new Mesa(id, capacidad, ids, sucia);
    }

    public Mesa conSucia(boolean valor) {
        return new Mesa(id, capacidad, mesasUnidas, valor);
    }

    private static List<String> normalizarMesasUnidas(String id, List<String> mesasUnidas) {
        return java.util.stream.Stream.concat(
                        id != null && !id.isBlank() ? java.util.stream.Stream.of(id) : java.util.stream.Stream.empty(),
                        mesasUnidas == null ? java.util.stream.Stream.empty() : mesasUnidas.stream()
                )
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(Predicate.not(String::isBlank))
                .distinct()
                .sorted(comparadorIdsMesa())
                .toList();
    }

    private static Comparator<String> comparadorIdsMesa() {
        return Comparator
                .comparingInt(Mesa::parseMesaId)
                .thenComparing(Comparator.naturalOrder());
    }

    private static int parseMesaId(String value) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return Integer.MAX_VALUE;
        }
    }
}
