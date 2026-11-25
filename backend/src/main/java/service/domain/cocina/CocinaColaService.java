package service.domain.cocina;

import model.Orden;

import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Cola de cocina por orden de llegada (FIFO).
 * La orden que antes llegó es la primera en prepararse. Además se estima
 * el tiempo de espera de cada plato para mostrárselo al cliente.
 */
public class CocinaColaService {

    private static final int ETA_MARGEN_PORCENTAJE = 15;

    public List<Orden> ordenarPorLlegada(List<Orden> ordenes) {
        return ordenes.stream()
                .sorted(Comparator
                        .comparing(Orden::fecha, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(Orden::id, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
    }

    /**
     * Reparte la cola (ya ordenada por llegada) entre las líneas de cocina
     * disponibles y calcula cuántos minutos faltan para cada orden.
     */
    public Map<String, Integer> calcularEtaMinutosPorOrden(List<Orden> colaPorLlegada, int lineasCocina) {
        Map<String, Integer> etaPorOrden = new HashMap<>();
        int[] cargaPorLinea = new int[Math.max(1, lineasCocina)];

        for (Orden orden : colaPorLlegada) {
            int linea = 0;
            for (int i = 1; i < cargaPorLinea.length; i++) {
                if (cargaPorLinea[i] < cargaPorLinea[linea]) {
                    linea = i;
                }
            }

            cargaPorLinea[linea] += tiempoEstimadoMinutos(orden);
            int conMargen = (int) Math.ceil(cargaPorLinea[linea] * (1 + ETA_MARGEN_PORCENTAJE / 100.0));

            if (orden.id() != null && !orden.id().isBlank()) {
                etaPorOrden.put(orden.id(), conMargen);
            }
        }

        return etaPorOrden;
    }

    public int tiempoEstimadoMinutos(Orden orden) {
        if (orden == null || orden.plato() == null || orden.plato().categoria() == null) return 10;

        return switch (orden.plato().categoria()) {
            case Entrante -> 6;
            case Principal -> 10;
            case Postre -> 5;
            case Bebida -> 2;
        };
    }
}
