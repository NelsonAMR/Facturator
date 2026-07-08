export interface IExchangeRateAdapter {
	obtenerTipoCambioActual(): Promise<number | null>;
}
