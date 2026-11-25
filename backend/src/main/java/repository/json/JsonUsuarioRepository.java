package repository.json;

import model.Rol;
import model.Usuario;
import repository.interfaces.UsuarioRepository;

import java.util.List;
import java.util.Optional;

public class JsonUsuarioRepository extends JsonRepository<Usuario> implements UsuarioRepository {

    public JsonUsuarioRepository(JsonDataStore store) {
        super(store, "usuarios", Usuario.class);
    }

    @Override protected String idDe(Usuario u) { return u.id(); }

    @Override
    protected Usuario conId(Usuario u, String id) {
        return new Usuario(id, u.username(), u.nombre(), u.passwordHash(), u.rol(), u.fechaCreacion());
    }

    @Override
    public Optional<Usuario> findByUsername(String username) {
        return filtrar(u -> u.username() != null && u.username().equalsIgnoreCase(username)).stream().findFirst();
    }

    @Override public List<Usuario> findByRol(Rol rol) { return filtrar(u -> u.rol() == rol); }
}
