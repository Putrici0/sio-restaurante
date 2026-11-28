package dto;

public class PlatoRequest {
    public String nombre;
    public String categoria;
    public String descripcion;
    public String precio;
    public Boolean estaActivo;
    public String imagen;
    /** Alérgenos declarados; si no se envía, al editar se conservan los que ya tenía el plato. */
    public java.util.List<String> alergenos;
}