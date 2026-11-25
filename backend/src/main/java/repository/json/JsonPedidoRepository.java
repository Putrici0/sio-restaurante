package repository.json;

import model.Cuenta;
import model.Pedido;
import model.PedidoEstado;
import repository.interfaces.PedidoRepository;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class JsonPedidoRepository extends JsonRepository<Pedido> implements PedidoRepository {

    public JsonPedidoRepository(JsonDataStore store) {
        super(store, "pedidos", Pedido.class);
    }

    @Override protected String idDe(Pedido p) { return p.id(); }

    @Override protected Pedido conId(Pedido p, String id) { return new Pedido(id, p.cuenta(), p.pedidoEstado(), p.fechaPedido()); }

    @Override
    public List<Pedido> findByCuenta(Cuenta cuenta) {
        if (cuenta == null || cuenta.id() == null) return List.of();
        return findByCuentaIds(List.of(cuenta.id()));
    }

    @Override
    public List<Pedido> findByCuentaIds(List<String> cuentaIds) {
        Set<String> ids = new HashSet<>(cuentaIds == null ? List.of() : cuentaIds);
        return filtrar(p -> p.cuenta() != null && ids.contains(p.cuenta().id()));
    }

    @Override public List<Pedido> findByEstado(PedidoEstado estado) { return filtrar(p -> p.pedidoEstado() == estado); }
}
