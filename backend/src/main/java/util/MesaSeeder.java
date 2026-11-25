package util;

import model.Mesa;
import repository.firestore.FirestoreMesaRepository;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Comedor de Sakura Hanami: 15 mesas y capacidad para unos 56 comensales.
 * Sincroniza la colección "mesas" con esta distribución.
 */
public final class MesaSeeder {

    private MesaSeeder() {
    }

    private static final List<Mesa> MESAS_COMEDOR = List.of(
            new Mesa("1", 2),
            new Mesa("2", 4),
            new Mesa("3", 2),
            new Mesa("4", 4),
            new Mesa("5", 4),
            new Mesa("6", 4),
            new Mesa("7", 2),
            new Mesa("8", 4),
            new Mesa("9", 2),
            new Mesa("10", 4),
            new Mesa("11", 4),
            new Mesa("12", 4),
            new Mesa("13", 4),
            new Mesa("14", 6),
            new Mesa("15", 6)
    );

    public static void seed(FirestoreMesaRepository mesaRepository) {
        Map<String, Mesa> existentes = mesaRepository.findAll().stream()
                .collect(Collectors.toMap(Mesa::id, Function.identity(), (a, b) -> a));

        Set<String> idsComedor = MESAS_COMEDOR.stream().map(Mesa::id).collect(Collectors.toSet());

        for (Mesa mesa : MESAS_COMEDOR) {
            Mesa actual = existentes.get(mesa.id());
            if (actual == null) {
                mesaRepository.save(mesa);
            } else if (actual.capacidad() != mesa.capacidad()) {
                mesaRepository.update(mesa.id(), new Mesa(mesa.id(), mesa.capacidad(), actual.mesasUnidas(), actual.sucia()));
            }
        }

        // Mesas que no existen en el comedor (versiones anteriores tenían 20)
        for (String id : existentes.keySet()) {
            if (!idsComedor.contains(id)) {
                mesaRepository.deleteById(id);
            }
        }
    }
}
