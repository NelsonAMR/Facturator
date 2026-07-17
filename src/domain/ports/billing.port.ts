export interface ReceptorPayload {
	rfc: string;
	razonSocial: string;
	codigoPostal: string;
	regimenFiscal: string;
	usoCFDI: string;
	residenciaFiscal: string;
	pais?: string;
	numRegIdTrib?: string;
}

export interface ConceptoPayload {
	descripcion: string;
	cantidad: number;
	valorUnitario: number;
	importe: number;
	claveProdServ: string;
	claveUnidad: string;
	objetoImpuesto?: string;
}

export type Quincena = "Q1" | "Q2";

export interface EmitirFacturaPayload {
	folioInterno: string;
	receptor: ReceptorPayload;
	concepto: ConceptoPayload;
	subtotalMXN: number;
	iva: number;
	retencionISR: number;
	totalMXN: number;
	moneda: string;
	tipoCambio: number | null;
	quincena: Quincena;
}

export interface EmitirFacturaResult {
	success: true;
}

export interface IBillingAdapter {
	emitirFactura(payload: EmitirFacturaPayload): Promise<EmitirFacturaResult>;
}
