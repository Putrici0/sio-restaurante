package controller;

import io.javalin.apibuilder.EndpointGroup;
import model.Usuario;
import repository.interfaces.UsuarioRepository;
import util.ApiError;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;

import static io.javalin.apibuilder.ApiBuilder.path;
import static io.javalin.apibuilder.ApiBuilder.post;

/**
 * Acceso del personal (demo): POST /auth/login {usuario, password}.
 * Las cuentas del personal estan en el JSON de datos con la contrasena en SHA-256.
 */
public class AuthController {

    private final UsuarioRepository usuarioRepository;

    public AuthController(UsuarioRepository usuarioRepository) {
        this.usuarioRepository = usuarioRepository;
    }

    public EndpointGroup routes() {
        return () -> path("auth/login", () -> post(ctx -> {
            @SuppressWarnings("unchecked")
            Map<String, Object> body = ctx.bodyAsClass(Map.class);
            String username = String.valueOf(body.getOrDefault("usuario", "")).trim();
            String password = String.valueOf(body.getOrDefault("password", ""));

            Usuario usuario = usuarioRepository.findByUsername(username).orElse(null);
            if (usuario == null || !sha256(password).equalsIgnoreCase(usuario.passwordHash())) {
                ctx.status(401).json(new ApiError("Usuario o contraseña incorrectos"));
                return;
            }
            ctx.json(Map.of(
                    "id", usuario.id(),
                    "usuario", usuario.username(),
                    "nombre", usuario.nombre(),
                    "rol", usuario.rol().name()
            ));
        }));
    }

    public static String sha256(String texto) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(texto.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
