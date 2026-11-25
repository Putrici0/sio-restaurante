package model;

import java.time.Instant;

/**
 * Reserva online: fecha, hora, número de comensales (capacidad) y datos de contacto.
 * No lleva mesa asignada: el personal la gestiona manualmente al recibir al cliente.
 * Estados: Pendiente, Confirmado, Cancelado, Finalizado.
 */
public record Reserva(
    String id,
    String nombre,
    String telefono,
    String email,
    Instant fecha,
    String hora,
    int capacidad,
    String nota,
    String estado,
    Instant fechaCreacion
) { }
