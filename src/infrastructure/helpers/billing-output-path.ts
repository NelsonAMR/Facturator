import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Quincena } from "../../domain/ports/billing.port.js";

export interface BillingOutputPaths {
	directory: string;
	xmlPath: string;
	pdfPath: string;
}

function pad2(value: number): string {
	return String(value).padStart(2, "0");
}

/**
 * Ruta: {OUTPUT_BILLING_PATH}/{Año}/{Mes}_Q{1|2}/
 * La quincena la elige el usuario en la CLI (Q1 | Q2).
 */
export async function resolveBillingOutputPaths(
	outputBillingPath: string,
	folioInterno: string,
	quincena: Quincena,
	date: Date = new Date(),
): Promise<BillingOutputPaths> {
	const year = String(date.getFullYear());
	const month = pad2(date.getMonth() + 1);
	const directory = join(outputBillingPath, year, `${month}_${quincena}`);

	await mkdir(directory, { recursive: true });

	return {
		directory,
		xmlPath: join(directory, `${folioInterno}.xml`),
		pdfPath: join(directory, `${folioInterno}.pdf`),
	};
}
