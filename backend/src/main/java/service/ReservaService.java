package service;

import dto.ReservaRequest;
import model.Reserva;
import repository.interfaces.ReservaRepository;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/** Reservas online y gestion de reservas por el personal (sin asignacion automatica de mesa). */
public class ReservaService {

    private static final Set<String> ESTADOS = Set.of("Pendiente", "Confirmado", "Cancelado", "Finalizado");

    private final ReservaRepository repository;

    public ReservaService(ReservaRepository repository) {
        this.repository = repository;
    }

    public Reserva create(ReservaRequest request) {
        validate(request);
        return repository.save(new Reserva(
                null,
                request.nombre.trim(),
                limpiar(request.telefono),
                limpiar(request.email),
                request.fecha.trim(),
                request.hora.trim(),
                request.comensales,
                limpiar(request.nota),
                estadoValido(request.estado, "Pendiente"),
                "personal".equals(request.origen) ? "personal" : "web",
                Instant.now()
        ));
    }

    public List<Reserva> findAll() {
        return repository.findAll();
    }

    public List<Reserva> findByFecha(String fecha) {
        return repository.findByFecha(fecha);
    }

    public PagedResult<Reserva> findPage(int limit, String cursor) {
        List<Reserva> items = repository.findPage(limit, cursor);
        String nextCursor = items.size() == limit ? items.get(items.size() - 1).id() : null;
        return new PagedResult<>(items, nextCursor, limit);
    }

    public Optional<Reserva> findById(String id) {
        return repository.findById(id);
    }

    public Reserva update(String id, ReservaRequest request) {
        validate(request);
        Reserva original = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("La reserva no existe"));
        return repository.update(id, new Reserva(
                id,
                request.nombre.trim(),
                limpiar(request.telefono),
                limpiar(request.email),
                request.fecha.trim(),
                request.hora.trim(),
                request.comensales,
                limpiar(request.nota),
                estadoValido(request.estado, original.estado()),
                original.origen(),
                original.fechaCreacion()
        ));
    }

    public Reserva cambiarEstado(String id, String estado) {
        Reserva r = repository.findById(id).orElseThrow(() -> new IllegalArgumentException("La reserva no existe"));
        if (estado == null || !ESTADOS.contains(estado)) {
            throw new IllegalArgumentException("Estado de reserva no válido");
        }
        return repository.update(id, new Reserva(r.id(), r.nombre(), r.telefono(), r.email(), r.fecha(), r.hora(),
                r.comensales(), r.nota(), estado, r.origen(), r.fechaCreacion()));
    }

    public void delete(String id) {
        repository.deleteById(id);
    }

    private void validate(ReservaRequest request) {
        if (request == null) throw new IllegalArgumentException("El cuerpo de la petición no puede ser nulo");
        if (request.nombre == null || request.nombre.isBlank()) throw new IllegalArgumentException("El nombre es obligatorio");
        if (request.comensales == null || request.comensales <= 0) {
            throw new IllegalArgumentException("El número de comensales debe ser mayor que 0");
        }
        if ((request.telefono == null || request.telefono.isBlank()) && (request.email == null || request.email.isBlank())) {
            throw new IllegalArgumentException("Indica un teléfono o un correo de contacto");
        }
        try {
            LocalDate.parse(request.fecha == null ? "" : request.fecha.trim());
            LocalTime.parse(request.hora == null ? "" : request.hora.trim());
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("La fecha (yyyy-MM-dd) y la hora (HH:mm) son obligatorias");
        }
    }

    private String estadoValido(String estado, String porDefecto) {
        return estado != null && ESTADOS.contains(estado.trim()) ? estado.trim() : porDefecto;
    }

    private String limpiar(String valor) {
        return valor == null ? "" : valor.trim();
    }
}
