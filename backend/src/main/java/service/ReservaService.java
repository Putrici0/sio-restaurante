package service;

import dto.ReservaRequest;
import model.Reserva;
import repository.firestore.FirestoreReservaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public class ReservaService {

    private final FirestoreReservaRepository repository;

    public ReservaService(FirestoreReservaRepository repository) {
        this.repository = repository;
    }

    public Reserva create(ReservaRequest request) {
        validate(request);

        Reserva reserva = new Reserva(
                null,
                request.nombre.trim(),
                request.telefono != null ? request.telefono.trim() : "",
                request.email != null ? request.email.trim() : "",
                Instant.parse(request.fecha.trim()),
                request.hora != null ? request.hora.trim() : "",
                request.capacidad,
                request.nota != null ? request.nota.trim() : "",
                request.estado != null ? request.estado.trim() : "Pendiente",
                Instant.now()
        );

        return repository.save(reserva);
    }

    public List<Reserva> findAll() {
        return repository.findAll();
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

        Reserva actualizada = new Reserva(
                id,
                request.nombre.trim(),
                request.telefono != null ? request.telefono.trim() : original.telefono(),
                request.email != null ? request.email.trim() : original.email(),
                Instant.parse(request.fecha.trim()),
                request.hora != null ? request.hora.trim() : original.hora(),
                request.capacidad,
                request.nota != null ? request.nota.trim() : original.nota(),
                request.estado != null ? request.estado.trim() : original.estado(),
                original.fechaCreacion()
        );

        return repository.update(id, actualizada);
    }

    public void delete(String id) {
        repository.deleteById(id);
    }

    private void validate(ReservaRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("El cuerpo de la petición no puede ser nulo");
        }
        if (request.nombre == null || request.nombre.isBlank()) {
            throw new IllegalArgumentException("El nombre es obligatorio");
        }
        if (request.fecha == null || request.fecha.isBlank()) {
            throw new IllegalArgumentException("La fecha es obligatoria");
        }
        if (request.capacidad == null) {
            throw new IllegalArgumentException("La capacidad es obligatoria");
        }
        if (request.capacidad <= 0) {
            throw new IllegalArgumentException("El número de comensales debe ser mayor que 0");
        }
        if ((request.telefono == null || request.telefono.isBlank())
                && (request.email == null || request.email.isBlank())) {
            throw new IllegalArgumentException("Indica un teléfono o un correo de contacto");
        }

        try {
            Instant.parse(request.fecha.trim());
        } catch (Exception e) {
            throw new IllegalArgumentException("La fecha debe tener formato ISO-8601 válido");
        }
    }
}
