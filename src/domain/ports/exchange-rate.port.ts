export interface IExchangeRateAdapter {
	/**
	 * Tipo de cambio FIX para efectos fiscales (equivalente a publicación DOF del día).
	 * @param fechaPago Fecha de pago/operación en YYYY-MM-DD.
	 * Si se omite, usa la fecha de hoy. En ambos casos se toma el FIX del
	 * día hábil bancario inmediato anterior (no el FIX determinado ese mismo día).
	 */
	obtenerTipoCambioActual(fechaPago?: string): Promise<number | null>;
}
