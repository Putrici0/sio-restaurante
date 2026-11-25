package repository.interfaces;

import model.Reserva;

import java.util.List;

public interface ReservaRepository extends Repository<Reserva, String> {
    List<Reserva> findByFecha(String fecha);
}
