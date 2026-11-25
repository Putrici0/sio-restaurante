package model;

import java.time.Instant;

/** Personal del restaurante (gerente, camarero o cocinero). La contrasena se guarda como hash SHA-256. */
public record Usuario(String id, String username, String nombre, String passwordHash, Rol rol, Instant fechaCreacion) { }
