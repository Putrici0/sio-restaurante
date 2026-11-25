package repository.json;

import model.Cuenta;
import model.Mesa;
import repository.interfaces.CuentaRepository;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

public class JsonCuentaRepository extends JsonRepository<Cuenta> implements CuentaRepository {

    public JsonCuentaRepository(JsonDataStore store) {
        super(store, "cuentas", Cuenta.class);
    }

    @Override protected String idDe(Cuenta c) { return c.id(); }

    @Override
    protected Cuenta conId(Cuenta c, String id) {
        return new Cuenta(id, c.mesas(), c.payed(), c.reserva(), c.fechaCreacion(), c.fechaPago(),
                c.password(), c.metodoPago(), c.cobroSolicitado(), c.comensales());
    }

    @Override
    public Optional<Cuenta> findByMesa(Mesa mesa) {
        if (mesa == null) return Optional.empty();
        return findActivasByMesaIds(List.of(mesa.id())).stream().findFirst();
    }

    @Override
    public List<Cuenta> findActivasByMesaIds(List<String> mesaIds) {
        Set<String> ids = new HashSet<>(mesaIds == null ? List.of() : mesaIds);
        return filtrar(c -> !c.payed() && c.mesas().stream().anyMatch(m -> m != null && ids.contains(m.id())));
    }

    @Override public List<Cuenta> findByEstaPagada(boolean pagada) { return filtrar(c -> c.payed() == pagada); }
}
