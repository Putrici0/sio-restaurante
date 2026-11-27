package service.domain;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;

/**
 * Reglas del buffet libre a la carta de Sakura Hanami.
 * - Se cobra una tarifa por comensal, como en la carta real de Sakura Hanami:
 *   Menú Sakura en los almuerzos de lunes a jueves y Menú Deluxe en las cenas,
 *   viernes, fines de semana y festivos.
 * - Niños de 100 a 130 cm pagan la tarifa infantil; los de menos de 100 cm, gratis.
 * - Bebidas y postres se cobran aparte.
 * - Los platos se piden por rondas, con un máximo de platos por comensal en cada ronda.
 */
public final class BuffetLibre {

    public static final ZoneId ZONA = ZoneId.of("Atlantic/Canary");
    public static final String TARIFA_ALMUERZO = "buffet-almuerzo";
    public static final String TARIFA_CENA = "buffet-cena";
    public static final String TARIFA_ALMUERZO_INFANTIL = "buffet-almuerzo-infantil";
    public static final String TARIFA_CENA_INFANTIL = "buffet-cena-infantil";
    /** Altura máxima con tarifa infantil, en cm (por debajo de 100 cm no pagan y no se cuentan). */
    public static final int ALTURA_MAXIMA_INFANTIL_CM = 130;
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

    /** Menú Deluxe: cenas, viernes, sábados y domingos (el Menú Sakura solo es de lunes a jueves a mediodía). */
    private static boolean esTarifaNoche(Instant momento) {
        DayOfWeek dia = momento.atZone(ZONA).getDayOfWeek();
        boolean viernesOFinDeSemana = dia == DayOfWeek.FRIDAY || dia == DayOfWeek.SATURDAY || dia == DayOfWeek.SUNDAY;
        return "Cena".equals(turno(momento)) || viernesOFinDeSemana;
    }

    public static int maximoPlatosPorRonda(int comensales) {
        return Math.max(1, comensales) * PLATOS_POR_COMENSAL_Y_RONDA;
    }
}
