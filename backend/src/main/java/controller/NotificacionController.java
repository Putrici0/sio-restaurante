package controller;

import io.javalin.apibuilder.EndpointGroup;
import service.application.NotificacionApplicationService;

import java.util.Map;

import static io.javalin.apibuilder.ApiBuilder.*;

/**
 * Avisos "llamar al camarero".
 * POST /notificaciones/atencion/{cuentaId}   el cliente llama al camarero
 * GET  /notificaciones/atencion/{cuentaId}   ¿hay un aviso pendiente para esa mesa?
 * GET  /notificaciones/pendientes            avisos que ve el personal de sala
 * POST /notificaciones/{id}/atendida         el camarero marca el aviso como atendido
 */
public class NotificacionController {

    private final NotificacionApplicationService service;

    public NotificacionController(NotificacionApplicationService service) {
        this.service = service;
    }

    public EndpointGroup routes() {
        return () -> path("notificaciones", () -> {
            path("pendientes", () -> get(ctx -> ctx.json(service.pendientes())));

            path("atencion/{cuentaId}", () -> {
                post(ctx -> ctx.status(201).json(service.llamarCamarero(ctx.pathParam("cuentaId"))));
                get(ctx -> ctx.json(Map.of("pendiente", service.hayAvisoPendiente(ctx.pathParam("cuentaId")))));
            });

            path("{id}/atendida", () -> post(ctx -> ctx.json(service.marcarAtendida(ctx.pathParam("id")))));
        });
    }
}
