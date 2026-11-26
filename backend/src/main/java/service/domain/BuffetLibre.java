package service.domain;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;

/**
 * Reglas del buffet libre a la carta de Sakura Hanami.
 * - Se cobra una tarifa por comensal: la de mediodía de lunes a viernes, y la de noche
 *   en cenas, sábados y domingos (como en los buffets japoneses a la carta reales).
 * - Niños de 3 a 10 años pagan la tarifa infantil del mismo turno; menores de 3, gratis.
 * - Bebidas y postres se cobran aparte.
 * - Los platos se piden por rondas, con un máximo de platos por comensal en cada ronda.
 */
public final class BuffetLibre {

    public static final ZoneId ZONA = ZoneId.of("Atlantic/Canary");
    public static final String TARIFA_ALMUERZO = "buffet-almuerzo";
    public static final String TARIFA_CENA = "buffet-cena";
    public static final String TARIFA_ALMUERZO_INFANTIL = "buffet-almuerzo-infantil";
    public static final String TARIFA_CENA_INFANTIL = "buffet-cena-infantil";
    /** Edad máxima con tarifa infantil (los menores de 3 años no pagan y no se cuentan). */
    public static final int EDAD_MAXIMA_INFANTIL = 10;
    public static final int PLATOS_POR_COMENSAL_Y_RONDA = 5;
    /** Las cenas empiezan a partir de esta hora (antes es turno de almuerzo). */
    public static final int HORA_INICIO_CENA = 18;

    private BuffetLibre() {
    }

    public static String turno(Instant momento) {
        return momento.atZone(ZONA).getHour() >= HORA_INICIO_CENA ? "Cena" : "Almuerzo";
    }

    public static String tarifaDelTurno(Instant momento) {
        return esTarifaNoche(momento) ? TARIFA_CENA : TARIFA_ALMUERZO;
    }

    public static String tarifaInfantilDelTurno(Instant momento) {
        return esTarifaNoche(momento) ? TARIFA_CENA_INFANTIL : TARIFA_ALMUERZO_INFANTIL;
    }

    public static boolean esTarifaInfantil(String platoId) {
        return TARIFA_ALMUERZO_INFANTIL.equals(platoId) || TARIFA_CENA_INFANTIL.equals(platoId);
    }

    /** Noche, sábados y domingos se aplica la tarifa de noche. */
    private static boolean esTarifaNoche(Instant momento) {
        DayOfWeek dia = momento.atZone(ZONA).getDayOfWeek();
        boolean finDeSemana = dia == DayOfWeek.SATURDAY || dia == DayOfWeek.SUNDAY;
        return "Cena".equals(turno(momento)) || finDeSemana;
    }

    public static int maximoPlatosPorRonda(int comensales) {
        return Math.max(1, comensales) * PLATOS_POR_COMENSAL_Y_RONDA;
    }
}
