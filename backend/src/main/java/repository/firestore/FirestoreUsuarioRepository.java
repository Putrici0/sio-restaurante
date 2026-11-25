package repository.firestore;

import com.google.cloud.firestore.Firestore;
import model.Rol;
import model.Usuario;
import repository.interfaces.UsuarioRepository;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class FirestoreUsuarioRepository extends AbstractFirestoreRepository<Usuario> implements UsuarioRepository {

    public FirestoreUsuarioRepository(Firestore db) {
        super(db, "usuarios");
    }

    @Override
    protected Usuario mapToEntity(String id, Map<String, Object> data) {
        String username = get(data, "username", "");
        if (username.isEmpty()) {
            username = get(data, "nombre", "");
        }

        Instant fechaCreacion = toInstant(data.get("fechaCreacion"));
        if (fechaCreacion == null && data.containsKey("creadoEn")) {
            try {
                fechaCreacion = Instant.parse(data.get("creadoEn").toString());
            } catch (Exception ignored) {}
        }

        Rol mappedRol = Rol.Camarero;
        Object rolObj = data.get("rol");
        if (rolObj != null) {
            String rolStr = rolObj.toString();
            for (Rol r : Rol.values()) {
                if (r.name().equalsIgnoreCase(rolStr)) {
                    mappedRol = r;
                    break;
                }
            }
        }

        return new Usuario(
                id,
                username,
                get(data, "passwordHash", ""),
                mappedRol,
                fechaCreacion
        );
    }

    @Override
    protected Map<String, Object> entityToMap(Usuario usuario) {
        Map<String, Object> map = new HashMap<>();
        map.put("username", usuario.username());
        map.put("passwordHash", usuario.passwordHash());
        map.put("rol", usuario.rol().name());
        map.put("fechaCreacion", toTimestamp(usuario.fechaCreacion()));
        return map;
    }

    @Override
    protected String getEntityId(Usuario usuario) {
        return usuario.id();
    }

    @Override
    protected Usuario createWithId(Usuario usuario, String id) {
        return new Usuario(id, usuario.username(), usuario.passwordHash(), usuario.rol(), usuario.fechaCreacion());
    }

    @Override
    public List<Usuario> findByNombre(String nombre) {
        List<Usuario> res = buscarPorCampo("username", nombre);
        if (res.isEmpty()) {
            res = buscarPorCampo("nombre", nombre);
        }
        return res;
    }

    @Override
    public List<Usuario> findByRol(Rol rol) {
        List<Usuario> res = buscarPorCampo("rol", rol.name());
        if (res.isEmpty()) {
            res = buscarPorCampo("rol", rol.name().toLowerCase());
        }
        return res;
    }
}
