import { mkdir } from "node:fs/promises";
import { join } from "node:path";

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
 * Semestre: meses 01–06 → Q1, meses 07–12 → Q2.
 */
export async function resolveBillingOutputPaths(
	outputBillingPath: string,
	folioInterno: string,
	date: Date = new Date(),
): Promise<BillingOutputPaths> {
	const year = String(date.getFullYear());
	const monthNumber = date.getMonth() + 1;
	const month = pad2(monthNumber);
	const quincena = monthNumber <= 6 ? "Q1" : "Q2";
	const directory = join(outputBillingPath, year, `${month}_${quincena}`);

	await mkdir(directory, { recursive: true });

	return {
		directory,
		xmlPath: join(directory, `${folioInterno}.xml`),
		pdfPath: join(directory, `${folioInterno}.pdf`),
	};
}
