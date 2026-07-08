export interface Cliente {
	id: string;
	tipo: "extranjero" | "nacional";
	razonSocial: string;
	rfc: string;
	residenciaFiscal: string;
	codigoPostal: string;
	regimenFiscal: string;
	usoCFDI: string;
	moneda: "USD" | "MXN";
	email?: string;
	pais?: string;
	numRegIdTrib?: string;
}
