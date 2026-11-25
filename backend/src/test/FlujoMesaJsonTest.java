import model.Cuenta;
import model.Mesa;
import model.MetodoPago;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import repository.json.JsonCuentaRepository;
import repository.json.JsonDataStore;
import repository.json.JsonMesaRepository;
import repository.json.JsonOrdenRepository;
import repository.json.JsonPedidoRepository;
import service.MesaApplicationService;
import service.application.PagoApplicationService;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

/** Ciclo de vida de una mesa sobre el almacén JSON: libre → ocupada → pendiente de cobro → sucia → libre. */
class FlujoMesaJsonTest {

    @TempDir
    Path tmp;

    private JsonDataStore store;
    private MesaApplicationService mesas;
    private PagoApplicationService pagos;
    private JsonMesaRepository mesaRepository;

    @BeforeEach
    void setUp() {
        store = new JsonDataStore(tmp.resolve("datos.json"));
        mesaRepository = new JsonMesaRepository(store);
        JsonCuentaRepository cuentas = new JsonCuentaRepository(store);
        JsonPedidoRepository pedidos = new JsonPedidoRepository(store);
        JsonOrdenRepository ordenes = new JsonOrdenRepository(store);
        mesas = new MesaApplicationService(mesaRepository, cuentas, pedidos, ordenes, new repository.json.JsonPlatoRepository(store));
        pagos = new PagoApplicationService(cuentas, mesaRepository, pedidos, ordenes);
    }

    @Test
    void laMesaRecorreTodosLosEstados() {
        Mesa mesa = mesaRepository.findById("1").orElseThrow();
        assertFalse(mesa.sucia());
        assertTrue(mesas.estaLibre("1"));

        Cuenta sesion = mesas.ocuparMesa("1");
        assertTrue(mesas.estaOcupada("1"));
        assertFalse(sesion.password().isBlank(), "la sesión genera un código para el QR");

        mesas.cerrarSesionMesa("1");
        assertTrue(mesas.obtenerCuentaActivaDeMesa("1").orElseThrow().cobroSolicitado());

        pagos.pagarCuentaCompleta(sesion.id(), MetodoPago.TARJETA);
        assertTrue(mesas.estaLibre("1"));
        assertTrue(mesaRepository.findById("1").orElseThrow().sucia(), "tras cobrar la mesa queda sucia");
        assertThrows(IllegalArgumentException.class, () -> mesas.ocuparMesa("1"), "no se abre una mesa sucia");

        mesas.limpiarMesa("1");
        assertFalse(mesaRepository.findById("1").orElseThrow().sucia());
    }

    @Test
    void losCambiosSePersistenEnElFicheroJson() {
        mesas.ocuparMesa("3");
        store.guardarAhora();

        JsonDataStore recargado = new JsonDataStore(tmp.resolve("datos.json"));
        JsonCuentaRepository cuentas = new JsonCuentaRepository(recargado);
        assertEquals(1, cuentas.findActivasByMesaIds(java.util.List.of("3")).size());
    }
}
