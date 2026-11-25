package repository.json;

import model.Orden;
import model.OrdenEstado;
import model.Pedido;
import repository.interfaces.OrdenRepository;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class JsonOrdenRepository extends JsonRepository<Orden> implements OrdenRepository {

    public JsonOrdenRepository(JsonDataStore store) {
        super(store, "ordenes", Orden.class);
    }

    @Override protected String idDe(Orden o) { return o.id(); }

    @Override
    protected Orden conId(Orden o, String id) {
        return new Orden(id, o.pedido(), o.plato(), o.precio(), o.ordenEstado(), o.fecha(), o.detalles(),
                o.pagada(), o.fechaPago(), o.metodoPago());
    }

    @Override
    public List<Orden> findByPedido(Pedido pedido) {
        if (pedido == null || pedido.id() == null) return List.of();
        return findByPedidosIds(List.of(pedido.id()));
    }

    @Override
    public List<Orden> findByPedidosIds(List<String> pedidosIds) {
        Set<String> ids = new HashSet<>(pedidosIds == null ? List.of() : pedidosIds);
        return filtrar(o -> o.pedido() != null && ids.contains(o.pedido().id()));
    }

    @Override public List<Orden> findByEstado(OrdenEstado estado) { return filtrar(o -> o.ordenEstado() == estado); }

    @Override
    public List<Orden> findByEstadoAndPagada(OrdenEstado estado, boolean pagada) {
        return filtrar(o -> o.ordenEstado() == estado && o.pagada() == pagada);
    }

    @Override public List<Orden> findByPagada(boolean pagada) { return filtrar(o -> o.pagada() == pagada); }
}
