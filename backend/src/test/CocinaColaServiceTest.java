import model.Categoria;
import model.Orden;
import model.OrdenEstado;
import model.Plato;
import org.junit.jupiter.api.Test;
import service.domain.cocina.CocinaColaService;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** La cocina atiende por orden de llegada (FIFO) y estima el tiempo de cada plato. */
class CocinaColaServiceTest {

    private final CocinaColaService cola = new CocinaColaService();

    private Orden orden(String id, Categoria categoria, Instant fecha) {
        Plato plato = new Plato("p-" + id, "Plato " + id, categoria, "", BigDecimal.ONE, true, "");
        return new Orden(id, null, plato, BigDecimal.ONE, OrdenEstado.Pendiente, fecha, "");
    }

    @Test
    void ordenaPorHoraDeLlegadaSinPrioridadesPorCategoria() {
        Instant t = Instant.parse("2026-11-25T13:00:00Z");
        List<Orden> ordenadas = cola.ordenarPorLlegada(List.of(
                orden("postre", Categoria.Postre, t.plusSeconds(120)),
                orden("ramen", Categoria.Principal, t),
                orden("gyozas", Categoria.Entrante, t.plusSeconds(60))
        ));
        assertEquals(List.of("ramen", "gyozas", "postre"), ordenadas.stream().map(Orden::id).toList());
    }

    @Test
    void elTiempoEstimadoCreceSegunLaPosicionEnLaCola() {
        Instant t = Instant.parse("2026-11-25T13:00:00Z");
        List<Orden> fila = List.of(orden("a", Categoria.Principal, t), orden("b", Categoria.Principal, t.plusSeconds(10)));
        Map<String, Integer> eta = cola.calcularEtaMinutosPorOrden(fila, 1);
        assertTrue(eta.get("b") > eta.get("a"));
    }
}
