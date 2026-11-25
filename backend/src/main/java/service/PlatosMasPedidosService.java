package service;

import model.Categoria;
import model.Orden;
import model.OrdenEstado;
import model.Plato;
import repository.interfaces.OrdenRepository;
import repository.interfaces.PlatoRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Sección "Más pedidos" de la carta digital: ranking de los platos activos
 * más vendidos (órdenes pagadas). Se cachea unos minutos para no recorrer
 * todo el histórico en cada visita a la carta.
 */
public class PlatosMasPedidosService {

    private static final Duration CACHE_TTL = Duration.ofMinutes(5);

    private final OrdenRepository ordenRepository;
    private final PlatoRepository platoRepository;

    private volatile Map<String, Long> cacheConteo;
    private volatile Instant cacheGeneradoEn;

    public PlatosMasPedidosService(OrdenRepository ordenRepository, PlatoRepository platoRepository) {
        this.ordenRepository = ordenRepository;
        this.platoRepository = platoRepository;
    }

    public List<PlatoPopular> obtenerMasPedidos(int limite) {
        Map<String, Long> conteo = conteoPorPlato();
        Map<String, Plato> activos = platoRepository.findAll().stream()
                .filter(Plato::estaActivo)
                .filter(p -> p.categoria() != null && p.categoria().esComida())
                .collect(Collectors.toMap(Plato::id, Function.identity(), (a, b) -> a));

        return conteo.entrySet().stream()
                .filter(e -> activos.containsKey(e.getKey()))
                .sorted(Map.Entry.<String, Long>comparingByValue(Comparator.reverseOrder()))
                .limit(Math.max(1, limite))
                .map(e -> new PlatoPopular(activos.get(e.getKey()), e.getValue()))
                .toList();
    }

    private Map<String, Long> conteoPorPlato() {
        Map<String, Long> actual = cacheConteo;
        Instant generado = cacheGeneradoEn;
        if (actual != null && generado != null && Instant.now().isBefore(generado.plus(CACHE_TTL))) {
            return actual;
        }

        Map<String, Long> conteo = ordenRepository.findByPagada(true).stream()
                .filter(o -> o.ordenEstado() != OrdenEstado.Cancelado)
                .map(Orden::plato)
                .filter(Objects::nonNull)
                .map(Plato::id)
                .filter(Objects::nonNull)
                .collect(Collectors.groupingBy(Function.identity(), Collectors.counting()));

        cacheConteo = conteo;
        cacheGeneradoEn = Instant.now();
        return conteo;
    }

    public record PlatoPopular(Plato plato, long vecesPedido) {}
}
