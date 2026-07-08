import type { Cliente } from "../entities/Cliente.js";
import type { DesgloseFiscal } from "../entities/Factura.js";
import type { IExchangeRateAdapter } from "../ports/exchange-rate.port.js";

const IVA_TASA = 0.16;
const RETENCION_ISR_TASA = 0.0125;

export async function calcularDesgloseFiscal(
	cliente: Cliente,
	monto: number,
	exchangeRateAdapter: IExchangeRateAdapter,
): Promise<DesgloseFiscal> {
	if (cliente.residenciaFiscal !== "MX") {
		const tipoCambio = await exchangeRateAdapter.obtenerTipoCambioActual();

		if (tipoCambio === null) {
			throw new Error("No se pudo obtener el tipo de cambio oficial.");
		}

		const subtotalMXN = monto * tipoCambio;

		return {
			montoIngresado: monto,
			monedaIngreso: "USD",
			tipoCambio,
			subtotalMXN,
			iva: 0,
			retencionISR: 0,
			totalMXN: subtotalMXN,
		};
	}

	const subtotalMXN = monto;
	const iva = subtotalMXN * IVA_TASA;
	const retencionISR = subtotalMXN * RETENCION_ISR_TASA;

	return {
		montoIngresado: monto,
		monedaIngreso: "MXN",
		tipoCambio: null,
		subtotalMXN,
		iva,
		retencionISR,
		totalMXN: subtotalMXN + iva - retencionISR,
	};
}
