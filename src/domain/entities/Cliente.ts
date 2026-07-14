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
	claveProdServ?: string;
	claveUnidad?: string;
	objetoImpuesto?: string;
	email?: string;
	pais?: string;
	numRegIdTrib?: string;
}
