package util;

/** Error devuelto por la API. Se envia en "error" y en "message" para facilitar su lectura en el frontend. */
public record ApiError(String error, String message) {
    public ApiError(String mensaje) {
        this(mensaje, mensaje);
    }
}
