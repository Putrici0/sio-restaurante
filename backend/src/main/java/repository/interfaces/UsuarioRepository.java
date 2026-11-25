package repository.interfaces;

import model.Rol;
import model.Usuario;

import java.util.List;
import java.util.Optional;

public interface UsuarioRepository extends Repository<Usuario, String> {
    Optional<Usuario> findByUsername(String username);
    List<Usuario> findByRol(Rol rol);
}
