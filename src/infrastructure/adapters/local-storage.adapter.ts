import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { FacturaLog } from "../../domain/entities/Factura.js";
import type { ILocalStorageAdapter } from "../../domain/ports/local-storage.port.js";

interface FacturasFile {
	facturas: FacturaLog[];
}

const FACTURAS_PATH = join(process.cwd(), "data", "facturas.json");

export class LocalStorageAdapter implements ILocalStorageAdapter {
	async generarSiguienteFolioInterno(): Promise<string> {
		const now = new Date();
		const aa = String(now.getFullYear()).slice(-2);
		const mm = String(now.getMonth() + 1).padStart(2, "0");
		const prefix = `F-${aa}-${mm}`;

		const count = await this.contarFacturasConPrefijo(prefix);
		const secuencia = String(count + 1).padStart(2, "0");

		return `${prefix}-${secuencia}`;
	}

	async guardarFacturaLog(factura: FacturaLog): Promise<void> {
		const data = await this.leerFacturas();
		data.facturas.push(factura);
		await this.escribirFacturas(data);
	}

	private async leerFacturas(): Promise<FacturasFile> {
		try {
			const raw = await readFile(FACTURAS_PATH, "utf-8");
			return JSON.parse(raw) as FacturasFile;
		} catch (error) {
			if (
				error instanceof Error &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return { facturas: [] };
			}

			throw error;
		}
	}

	private async escribirFacturas(data: FacturasFile): Promise<void> {
		await mkdir(dirname(FACTURAS_PATH), { recursive: true });
		await writeFile(
			FACTURAS_PATH,
			`${JSON.stringify(data, null, 2)}\n`,
			"utf-8",
		);
	}

	private async contarFacturasConPrefijo(prefix: string): Promise<number> {
		const data = await this.leerFacturas();

		return data.facturas.filter((f) => f.folioInterno.startsWith(prefix))
			.length;
	}
}
