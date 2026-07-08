import type { FacturaLog } from "../entities/Factura.js";

export interface ILocalStorageAdapter {
	generarSiguienteFolioInterno(): Promise<string>;
	guardarFacturaLog(factura: FacturaLog): Promise<void>;
}
