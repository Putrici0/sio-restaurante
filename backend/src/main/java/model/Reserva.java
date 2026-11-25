package model;

import java.time.Instant;
import java.util.List;

public record Reserva(
    String id,
    String nombre,
    String telefono,
    Instant fecha,
    String hora,
    int capacidad,
    String zona,
    List<String> mesasIds,
    String nota,
    String estado,
    Instant fechaCreacion
) { }
