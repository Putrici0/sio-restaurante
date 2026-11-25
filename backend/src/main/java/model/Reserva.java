package model;

import java.time.Instant;

/**
 * Reserva online: fecha (yyyy-MM-dd), hora (HH:mm), comensales y datos de contacto.
 * No lleva mesa asignada: el personal la gestiona manualmente al recibir al cliente.
 * Estados: Pendiente, Confirmado, Cancelado, Finalizado. Origen: web o personal.
 */
public record Reserva(
        String id,
        String nombre,
        String telefono,
        String email,
        String fecha,
        String hora,
        int comensales,
        String nota,
        String estado,
        String origen,
        Instant fechaCreacion
) { }
