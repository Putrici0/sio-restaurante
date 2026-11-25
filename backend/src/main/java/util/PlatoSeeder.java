package util;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import dto.PlatoRequest;
import model.Plato;
import repository.firestore.FirestorePlatoRepository;
import service.PlatoService;

import java.io.InputStream;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

public final class PlatoSeeder {

    private PlatoSeeder() {
    }

    public static void seed(FirestorePlatoRepository platoRepository) {
        try {
            ObjectMapper objectMapper = new ObjectMapper();

            InputStream inputStream = PlatoSeeder.class
                    .getClassLoader()
                    .getResourceAsStream("platos.json");

            if (inputStream == null) {
                throw new IllegalStateException("No se encontró el fichero platos.json en resources");
            }

            List<PlatoRequest> platosBase = objectMapper.readValue(
                    inputStream,
                    new TypeReference<List<PlatoRequest>>() {}
            );

            PlatoService platoService = new PlatoService(platoRepository);

            List<Plato> platosExistentes = platoRepository.findAll();
            Set<String> clavesExistentes = platosExistentes.stream()
                    .map(plato -> normalizarClave(plato.nombre(), plato.categoria().name()))
                    .collect(Collectors.toSet());

            // La carta de Sakura Hanami es la de platos.json: los platos antiguos que no
            // están en ella se desactivan (no se borran, para conservar el histórico).
            Set<String> clavesCarta = platosBase.stream()
                    .map(request -> normalizarClave(request.nombre, request.categoria))
                    .collect(Collectors.toSet());
            for (Plato plato : platosExistentes) {
                String clave = normalizarClave(plato.nombre(), plato.categoria().name());
                if (plato.estaActivo() && !clavesCarta.contains(clave)) {
                    platoRepository.update(plato.id(), new Plato(
                            plato.id(), plato.nombre(), plato.categoria(), plato.descripcion(),
                            plato.precio(), false, plato.imagen()
                    ));
                }
            }

            for (PlatoRequest request : platosBase) {
                String clave = normalizarClave(request.nombre, request.categoria);

                if (!clavesExistentes.contains(clave)) {
                    Plato creado = platoService.create(request);
                    clavesExistentes.add(normalizarClave(creado.nombre(), creado.categoria().name()));
                }
            }

        } catch (Exception e) {
            throw new RuntimeException("Error al cargar los platos iniciales", e);
        }
    }

    private static String normalizarClave(String nombre, String categoria) {
        return nombre.trim().toLowerCase() + "::" + categoria.trim().toLowerCase();
    }
}