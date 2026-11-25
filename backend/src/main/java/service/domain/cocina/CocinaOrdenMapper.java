package service.domain.cocina;

import dto.cocina.CocinaOrden;
import model.Orden;

public class CocinaOrdenMapper {

    public CocinaOrden toCocinaOrden(Orden orden, int posicionCola, Integer etaMinutos) {
        return new CocinaOrden(
                orden.id(),
                orden.pedido(),
                orden.plato(),
                orden.precio(),
                orden.ordenEstado(),
                orden.fecha(),
                orden.detalles(),
                orden.pagada(),
                posicionCola,
                etaMinutos
        );
    }
}
