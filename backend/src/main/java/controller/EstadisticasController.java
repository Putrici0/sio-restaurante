package controller;

import io.javalin.apibuilder.EndpointGroup;
import service.application.EstadisticasApplicationService;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;

import static io.javalin.apibuilder.ApiBuilder.get;
import static io.javalin.apibuilder.ApiBuilder.path;

/** GET /estadisticas?desde=yyyy-MM-dd&hasta=yyyy-MM-dd → cuadro de mando gerencial. */
public class EstadisticasController {

    private final EstadisticasApplicationService service;

    public EstadisticasController(EstadisticasApplicationService service) {
        this.service = service;
    }

    public EndpointGroup routes() {
        return () -> path("estadisticas", () -> get(ctx -> {
            LocalDate hoy = LocalDate.now(ZoneId.of("Atlantic/Canary"));
            LocalDate hasta = parse(ctx.queryParam("hasta"), hoy);
            LocalDate desde = parse(ctx.queryParam("desde"), hasta.minusDays(6));
            ctx.json(service.calcular(desde, hasta));
        }));
    }

    private LocalDate parse(String valor, LocalDate porDefecto) {
        if (valor == null || valor.isBlank()) return porDefecto;
        try {
            return LocalDate.parse(valor.trim());
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("Fecha no válida: " + valor);
        }
    }
}
