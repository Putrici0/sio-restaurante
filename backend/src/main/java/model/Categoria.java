package model;

/**
 * Categorías de la carta de Sakura Hanami.
 * Entrante y Principal forman el buffet libre (incluidos en el precio por comensal);
 * bebidas y postres se cobran aparte, como en los buffets japoneses reales,
 * y Buffet son las tarifas por comensal (mediodía entre semana y noche/fin de semana).
 */
public enum Categoria {
    Bebida,
    Entrante,
    Principal,
    Postre,
    Buffet;

    /** Platos que prepara la cocina (incluidos los postres). */
    public boolean esComida() {
        return this == Entrante || this == Principal || this == Postre;
    }

    /** Platos incluidos en la tarifa del buffet: cuentan para el límite de platos por ronda. */
    public boolean incluidaEnBuffet() {
        return this == Entrante || this == Principal;
    }
}
