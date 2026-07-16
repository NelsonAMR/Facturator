import type { IExchangeRateAdapter } from "../../domain/ports/exchange-rate.port.js";

const BANXICO_SERIES_BASE =
	"https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos";

/** Días hacia atrás desde el día hábil anterior, por fines de semana / inhábiles. */
const LOOKBACK_DAYS = 14;

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

function formatIsoDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function parseIsoDate(fechaPago: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaPago);
	if (!match) {
		return null;
	}

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(year, month - 1, day);

	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return null;
	}

	return date;
}

function hoyLocal(): Date {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Para una fecha de operación/pago D, el TC fiscal de referencia (DOF del día)
 * corresponde al FIX Banxico del día hábil bancario inmediato anterior.
 * En SF43718 ese valor está fechado como D-1 (o el último hábil previo).
 */
function buildUrl(fechaPago?: string): string | null {
	const operacion = fechaPago ? parseIsoDate(fechaPago) : hoyLocal();
	if (!operacion) {
		return null;
	}

	// Excluye el FIX determinado el mismo día D (aún no es el DOF de D).
	const end = new Date(operacion);
	end.setDate(end.getDate() - 1);

	const start = new Date(end);
	start.setDate(start.getDate() - LOOKBACK_DAYS);

	return `${BANXICO_SERIES_BASE}/${formatIsoDate(start)}/${formatIsoDate(end)}`;
}

function ultimoDatoValido(datos: BanxicoDato[]): number | null {
	for (let i = datos.length - 1; i >= 0; i--) {
		const value = parseDato(datos[i]?.dato);
		if (value !== null) {
			return value;
		}
	}

	return null;
}

export class BanxicoExchangeRateAdapter implements IExchangeRateAdapter {
	async obtenerTipoCambioActual(fechaPago?: string): Promise<number | null> {
		const token = process.env.BANXICO_TOKEN?.trim();

		if (!token) {
			return null;
		}

		const url = buildUrl(fechaPago);
		if (!url) {
			return null;
		}

		try {
			const response = await fetch(url, {
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

			return ultimoDatoValido(datos);
		} catch {
			return null;
		}
	}
}
