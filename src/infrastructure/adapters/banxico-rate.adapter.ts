import type { IExchangeRateAdapter } from "../../domain/ports/exchange-rate.port.js";

const BANXICO_FIX_URL =
	"https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/oportuno";

interface BanxicoDato {
	fecha: string;
	dato: string;
}

interface BanxicoResponse {
	bmx?: {
		series?: Array<{
			idSerie?: string;
			datos?: BanxicoDato[];
		}>;
	};
}

function parseDato(raw: string | undefined): number | null {
	if (!raw || raw === "N/E") {
		return null;
	}

	const value = Number.parseFloat(raw.replace(",", ""));
	return Number.isFinite(value) ? value : null;
}

export class BanxicoExchangeRateAdapter implements IExchangeRateAdapter {
	async obtenerTipoCambioActual(): Promise<number | null> {
		const token = process.env.BANXICO_TOKEN?.trim();

		if (!token) {
			return null;
		}

		try {
			const response = await fetch(BANXICO_FIX_URL, {
				headers: {
					Accept: "application/json",
					"Bmx-Token": token,
				},
			});

			if (!response.ok) {
				return null;
			}

			const body = (await response.json()) as BanxicoResponse;
			const datos = body.bmx?.series?.[0]?.datos;

			if (!datos || datos.length === 0) {
				return null;
			}

			const ultimo = datos[datos.length - 1];
			return parseDato(ultimo?.dato);
		} catch {
			return null;
		}
	}
}
