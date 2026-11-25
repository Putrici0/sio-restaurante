package model;

/**
 * Categorías de la carta de Sakura Hanami.
 * Entrante, Principal y Postre forman el buffet libre (incluidos en el precio por comensal);
 * las bebidas se cobran aparte y Buffet son las tarifas por comensal (almuerzo y cena).
 */
public enum Categoria {
    Bebida,
    Entrante,
    Principal,
    Postre,
    Buffet;

    /** Platos de cocina incluidos en el buffet libre. */
    public boolean esComida() {
        return this == Entrante || this == Principal || this == Postre;
    }
}
