import com.fasterxml.jackson.databind.ObjectMapper;
import controller.AuthController;
import controller.CuentaController;
import controller.EstadisticasController;
import controller.MesaController;
import controller.NotificacionController;
import controller.OrdenController;
import controller.PedidoController;
import controller.PlatoController;
import controller.ReservaController;
import io.javalin.Javalin;
import io.javalin.json.JavalinJackson;
import repository.json.JsonCuentaRepository;
import repository.json.JsonDataStore;
import repository.json.JsonMesaRepository;
import repository.json.JsonNotificacionRepository;
import repository.json.JsonOrdenRepository;
import repository.json.JsonPedidoRepository;
import repository.json.JsonPlatoRepository;
import repository.json.JsonReservaRepository;
import repository.json.JsonUsuarioRepository;
import service.CuentaService;
import service.MesaApplicationService;
import service.MesaService;
import service.OrdenService;
import service.PedidoService;
import service.PlatoService;
import service.PlatosMasPedidosService;
import service.ReservaService;
import service.application.EstadisticasApplicationService;
import service.application.HistorialCuentasApplicationService;
import service.application.NotificacionApplicationService;
import service.application.OrdenApplicationService;
import service.application.PagoApplicationService;
import service.application.PedidoApplicationService;
import util.ApiError;

import java.nio.file.Path;

/** Arranque del backend de SIGO-RSH (Restaurante Sakura Hanami) en http://localhost:7070. */
public class Main {

    public static void main(String[] args) {
        // Todos los datos de la demo viven en un unico fichero JSON (ver JsonDataStore)
        Path ficheroDatos = Path.of(System.getProperty("sio.datos", "data/sio-restaurante.json"));
        JsonDataStore store = new JsonDataStore(ficheroDatos);
        System.out.println("Datos SIGO-RSH: " + ficheroDatos.toAbsolutePath());

        ObjectMapper objectMapper = JsonDataStore.crearMapper();

        JsonPlatoRepository platoRepository = new JsonPlatoRepository(store);
        JsonMesaRepository mesaRepository = new JsonMesaRepository(store);
        JsonReservaRepository reservaRepository = new JsonReservaRepository(store);
        JsonCuentaRepository cuentaRepository = new JsonCuentaRepository(store);
        JsonPedidoRepository pedidoRepository = new JsonPedidoRepository(store);
        JsonOrdenRepository ordenRepository = new JsonOrdenRepository(store);
        JsonNotificacionRepository notificacionRepository = new JsonNotificacionRepository(store);
        JsonUsuarioRepository usuarioRepository = new JsonUsuarioRepository(store);

        PlatoService platoService = new PlatoService(platoRepository);
        MesaService mesaService = new MesaService(mesaRepository);
        ReservaService reservaService = new ReservaService(reservaRepository);
        CuentaService cuentaService = new CuentaService(cuentaRepository, mesaRepository);
        PedidoService pedidoService = new PedidoService(pedidoRepository, cuentaRepository);
        OrdenService ordenService = new OrdenService(ordenRepository, pedidoRepository, platoRepository);

        MesaApplicationService mesaApplicationService = new MesaApplicationService(
                mesaRepository,
                cuentaRepository,
                pedidoRepository,
                ordenRepository
        );

        PedidoApplicationService pedidoApplicationService = new PedidoApplicationService(
                pedidoRepository,
                cuentaRepository,
                ordenRepository,
                platoRepository,
                mesaApplicationService
        );

        OrdenApplicationService ordenApplicationService = new OrdenApplicationService(
                ordenRepository,
                pedidoRepository,
                platoRepository,
                pedidoApplicationService,
                cuentaRepository
        );

        PagoApplicationService pagoApplicationService = new PagoApplicationService(
                cuentaRepository,
                mesaRepository,
                pedidoRepository,
                ordenRepository
        );

        NotificacionApplicationService notificacionApplicationService =
                new NotificacionApplicationService(notificacionRepository, cuentaRepository);

        HistorialCuentasApplicationService historialCuentasApplicationService =
                new HistorialCuentasApplicationService(cuentaRepository, pedidoRepository, ordenRepository);

        PlatoController platoController = new PlatoController(
                platoService,
                new PlatosMasPedidosService(ordenRepository, platoRepository)
        );
        MesaController mesaController = new MesaController(mesaService, mesaApplicationService);
        ReservaController reservaController = new ReservaController(reservaService);
        CuentaController cuentaController = new CuentaController(
                cuentaService,
                pagoApplicationService,
                historialCuentasApplicationService
        );
        PedidoController pedidoController = new PedidoController(pedidoService, pedidoApplicationService);
        OrdenController ordenController = new OrdenController(ordenService, ordenApplicationService);
        NotificacionController notificacionController = new NotificacionController(notificacionApplicationService);
        AuthController authController = new AuthController(usuarioRepository);

        EstadisticasController estadisticasController = new EstadisticasController(
                new EstadisticasApplicationService(cuentaRepository, ordenRepository, platoRepository, mesaRepository)
        );

        Javalin app = Javalin.create(config -> {
            config.jsonMapper(new JavalinJackson(objectMapper, false));
            config.bundledPlugins.enableCors(cors -> cors.addRule(rule -> rule.anyHost()));

            config.routes.get("/", ctx -> ctx.result("API de SIGO-RSH (Sakura Hanami) funcionando"));
            config.routes.get("/health", ctx -> ctx.result("OK"));

            config.routes.apiBuilder(platoController.routes());
            config.routes.apiBuilder(mesaController.routes());
            config.routes.apiBuilder(reservaController.routes());
            config.routes.apiBuilder(cuentaController.routes());
            config.routes.apiBuilder(pedidoController.routes());
            config.routes.apiBuilder(ordenController.routes());
            config.routes.apiBuilder(notificacionController.routes());
            config.routes.apiBuilder(estadisticasController.routes());
            config.routes.apiBuilder(authController.routes());

            config.routes.exception(IllegalArgumentException.class, (e, ctx) -> {
                ctx.status(400);
                ctx.json(new ApiError(e.getMessage()));
            });

            config.routes.exception(Exception.class, (e, ctx) -> {
                e.printStackTrace();
                ctx.status(500);
                ctx.json(new ApiError("Error interno del servidor"));
            });
        });

        app.start(7070);
    }
}
