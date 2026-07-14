export interface IExchangeRateAdapter {
	/**
	 * @param fechaPago Fecha del pago en formato YYYY-MM-DD.
	 * Si se omite, usa el tipo de cambio oportuno (más reciente).
	 */
	obtenerTipoCambioActual(fechaPago?: string): Promise<number | null>;
}
