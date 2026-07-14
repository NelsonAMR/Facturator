import type { IExchangeRateAdapter } from "../../domain/ports/exchange-rate.port.js";

const TC_MOCK = 18.5;

export class MockExchangeRateAdapter implements IExchangeRateAdapter {
	async obtenerTipoCambioActual(_fechaPago?: string): Promise<number | null> {
		return TC_MOCK;
	}
}
