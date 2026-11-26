package controller;

import dto.ReservaRequest;
import io.javalin.apibuilder.EndpointGroup;
import model.Reserva;
import service.MesaApplicationService;
import service.ReservaService;
import util.ApiError;

import java.util.Optional;

import static io.javalin.apibuilder.ApiBuilder.*;

public class ReservaController {

    private final ReservaService service;
    private final MesaApplicationService mesaApplicationService;

    public ReservaController(ReservaService service, MesaApplicationService mesaApplicationService) {
        this.service = service;
        this.mesaApplicationService = mesaApplicationService;
    }

    public EndpointGroup routes() {
        return () -> {
            path("reservas", () -> {

                post(ctx -> {
                    ReservaRequest request = ctx.bodyAsClass(ReservaRequest.class);
                    Reserva creada = service.create(request);
                    ctx.status(201).json(creada);
                });

                get(ctx -> {
                    String fecha = ctx.queryParam("fecha");
                    if (fecha != null && !fecha.isBlank()) {
                        ctx.json(service.findByFecha(fecha.trim()));
                        return;
                    }
                    if (!paginationRequested(ctx.queryParam("limit"), ctx.queryParam("cursor"))) {
                        ctx.json(service.findAll());
                        return;
                    }

                    int limit = parseLimit(ctx.queryParam("limit"));
                    String cursor = normalizeCursor(ctx.queryParam("cursor"));
                    ctx.json(service.findPage(limit, cursor));
                });

                path("{id}", () -> {

                    // El cliente con reserva ha llegado: se abre la mesa elegida y la reserva se da por cumplida
                    path("llegada", () -> post(ctx -> {
                        @SuppressWarnings("unchecked")
                        java.util.Map<String, Object> body = ctx.bodyAsClass(java.util.Map.class);
                        Object mesaId = body.get("mesaId");
                        if (mesaId == null || mesaId.toString().isBlank()) {
                            throw new IllegalArgumentException("Selecciona la mesa para el cliente");
                        }
                        Reserva reserva = service.findById(ctx.pathParam("id"))
                                .orElseThrow(() -> new IllegalArgumentException("La reserva no existe"));
                        if (!"Pendiente".equals(reserva.estado()) && !"Confirmado".equals(reserva.estado())) {
                            throw new IllegalArgumentException("La reserva ya está " + reserva.estado().toLowerCase());
                        }
                        int ninos = body.get("ninos") instanceof Number n ? n.intValue() : 0;
                        mesaApplicationService.ocuparMesa(mesaId.toString(), reserva.comensales(), ninos);
                        ctx.json(service.cambiarEstado(reserva.id(), "Finalizado"));
                    }));

                    path("estado", () -> post(ctx -> {
                        @SuppressWarnings("unchecked")
                        java.util.Map<String, Object> body = ctx.bodyAsClass(java.util.Map.class);
                        Object estado = body.get("estado");
                        ctx.json(service.cambiarEstado(ctx.pathParam("id"), estado == null ? null : estado.toString()));
                    }));

                    get(ctx -> {
                        String id = ctx.pathParam("id");
                        Optional<Reserva> reserva = service.findById(id);

                        if (reserva.isPresent()) {
                            ctx.json(reserva.get());
                        } else {
                            ctx.status(404).json(new ApiError("Reserva no encontrada"));
                        }
                    });

                    put(ctx -> {
                        String id = ctx.pathParam("id");

                        if (service.findById(id).isEmpty()) {
                            ctx.status(404).json(new ApiError("Reserva no encontrada"));
                            return;
                        }

                        ReservaRequest request = ctx.bodyAsClass(ReservaRequest.class);
                        Reserva actualizada = service.update(id, request);
                        ctx.json(actualizada);
                    });

                    delete(ctx -> {
                        String id = ctx.pathParam("id");

                        if (service.findById(id).isEmpty()) {
                            ctx.status(404).json(new ApiError("Reserva no encontrada"));
                            return;
                        }

                        service.delete(id);
                        ctx.status(204);
                    });
                });
            });
        };
    }

    private boolean paginationRequested(String limitParam, String cursorParam) {
        return (limitParam != null && !limitParam.isBlank())
                || (cursorParam != null && !cursorParam.isBlank());
    }

    private int parseLimit(String limitParam) {
        if (limitParam == null || limitParam.isBlank()) {
            return 50;
        }

        int parsed;
        try {
            parsed = Integer.parseInt(limitParam.trim());
        } catch (NumberFormatException e) {
            return 50;
        }
        return Math.max(1, Math.min(parsed, 100));
    }

    private String normalizeCursor(String cursorParam) {
        return (cursorParam == null || cursorParam.isBlank()) ? null : cursorParam.trim();
    }
}
