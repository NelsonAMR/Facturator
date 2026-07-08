export interface DesgloseFiscal {
	montoIngresado: number;
	monedaIngreso: "USD" | "MXN";
	tipoCambio: number | null;
	subtotalMXN: number;
	iva: number;
	retencionISR: number;
	totalMXN: number;
}

export interface FacturaLog extends DesgloseFiscal {
	folioInterno: string;
	clienteId: string;
	razonSocial: string;
	residenciaFiscal: string;
	createdAt: string;
}
