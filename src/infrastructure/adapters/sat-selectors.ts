/**
 * Selectores del portal portalcfdi.facturaelectronica.sat.gob.mx.
 * Validar/ajustar en la primera ejecución con headless: false.
 */
export const SAT_SELECTORS = {
	urls: {
		base: "https://portalcfdi.facturaelectronica.sat.gob.mx/",
		login: "https://portalcfdi.facturaelectronica.sat.gob.mx/",
	},
	login: {
		rfcInput: "#rfc",
		passwordInput: "#password",
		submitButton: "#submit",
		postLoginMarker: "#mainMenu, .menuPrincipal, a[href*='Generacion']",
	},
	navegacion: {
		generacionMenu: "a[href*='Generacion'], #menuGeneracion",
		nuevaFactura: "a[href*='NuevaFactura'], a[href*='nueva'], #btnNuevaFactura",
	},
	receptor: {
		rfc: "#Receptor_Rfc, input[name*='Rfc'][id*='Receptor']",
		razonSocial: "#Receptor_Nombre, input[name*='Nombre'][id*='Receptor']",
		codigoPostal: "#Receptor_DomicilioFiscalReceptor, #Receptor_CodigoPostal",
		regimenFiscal:
			"#Receptor_RegimenFiscalReceptor, select[name*='RegimenFiscal']",
		usoCFDI: "#Receptor_UsoCFDI, select[name*='UsoCFDI']",
		residenciaFiscal:
			"#Receptor_ResidenciaFiscal, select[name*='ResidenciaFiscal']",
		numRegIdTrib: "#Receptor_NumRegIdTrib, input[name*='NumRegIdTrib']",
		pais: "#Receptor_Pais, select[name*='Pais']",
	},
	concepto: {
		nuevoBoton: "#btnNuevoConcepto, button[id*='Concepto']",
		descripcion:
			"#Concepto_Descripcion, textarea[name*='Descripcion'], input[name*='Descripcion']",
		cantidad: "#Concepto_Cantidad, input[name*='Cantidad']",
		valorUnitario: "#Concepto_ValorUnitario, input[name*='ValorUnitario']",
		importe: "#Concepto_Importe, input[name*='Importe']",
		claveProdServ: "#Concepto_ClaveProdServ, input[name*='ClaveProdServ']",
		claveUnidad: "#Concepto_ClaveUnidad, input[name*='ClaveUnidad']",
		guardarConcepto: "#btnGuardarConcepto, button[id*='GuardarConcepto']",
	},
	sellado: {
		botonSellar: "#btnSellar, button[id*='Sellar'], a[id*='Sellar']",
		cerInput:
			"input[type='file'][accept*='.cer'], #Certificate, input[name*='cer']",
		keyInput:
			"input[type='file'][accept*='.key'], #PrivateKey, input[name*='key']",
		passwordInput:
			"#PrivateKeyPassword, input[type='password'][name*='Password'], input[name*='password']",
		confirmarSello: "#btnFirmar, #btnConfirmarSello, button[id*='Firmar']",
	},
	descarga: {
		xml: "a[href*='.xml'], #btnDescargarXml, a[id*='Xml']",
		pdf: "a[href*='.pdf'], #btnDescargarPdf, a[id*='Pdf']",
	},
} as const;

export const SAT_TIMEOUT_MS = 30_000;
export const SAT_LOGIN_TIMEOUT_MS = 120_000;
