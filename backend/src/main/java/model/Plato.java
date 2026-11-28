package model;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

/**
 * Plato o bebida de la carta.
 * alergenos: alérgenos declarados (claves de {@link #ALERGENOS}); null = el restaurante no ha
 * indicado la información (se muestra «consulta al personal», nunca «sin alérgenos»).
 */
public record Plato(String id, String nombre, Categoria categoria, String descripcion, BigDecimal precio,
                    boolean estaActivo, String imagen, List<String> alergenos) {

    /** Alérgenos que usa la carta de Sakura Hanami. */
    public static final Set<String> ALERGENOS = Set.of(
            "gluten", "crustaceos", "pescado", "cacahuetes", "soja", "leche", "moluscos", "sesamo");

    public Plato {
        alergenos = alergenos == null ? null : List.copyOf(alergenos);
    }

    /** Plato sin información de alérgenos (compatibilidad con el código anterior). */
    public Plato(String id, String nombre, Categoria categoria, String descripcion, BigDecimal precio,
                 boolean estaActivo, String imagen) {
        this(id, nombre, categoria, descripcion, precio, estaActivo, imagen, null);
    }
}
