/**
 * Selectores del portal Factura Electrónica SAT (v4.5.x / FormsBuilder MegaPac).
 * view-model confirmados vía inventario DOM en GeneraFactura.
 */
export const SAT_SELECTORS = {
	urls: {
		generaFactura:
			"https://portal.facturaelectronica.sat.gob.mx/Factura/GeneraFactura",
		base: "https://portal.facturaelectronica.sat.gob.mx/Factura/GeneraFactura",
	},
	login: {
		formCiec: "#IDPLogin",
		rfcInput: "#rfc",
		botonEfirma: "#buttonFiel",
		efirmaFormMarker: "#privateKeyPassword, #txtCertificate, #btnCertificate",
		cerInput: "#fileCertificate",
		keyInput: "#filePrivateKey",
		passwordInput: "#privateKeyPassword",
		rfcEfirma: "#rfc",
		submitButton: "#submit",
		postLoginMarker: "#tituloFI, #LogOut, .detalleUsuario",
	},
	formulario: {
		htmlOutput: "#htmlOutput",
		groupContainer: "#groupcontainer",
		loadAjax: "#loadAjax",
		modalesCarga: "#myModal, #ajaxModal, #modalValidando, #modalGuardando",
		panelToggles:
			'#groupcontainer .panel-heading a, #groupcontainer [data-toggle="collapse"], #groupcontainer .panel-title a',
	},
	navegacion: {
		nuevaFactura: 'a[href="/Factura/GeneraFactura"]',
	},
	/**
	 * Receptor — códigos E1350003PFAC* del inventario real.
	 * Orden en UI: cliente → RFC → Nombre → CP → (exportación) → régimen → uso CFDI.
	 */
	receptor: {
		/** Autocomplete clientes frecuentes. */
		rfcCargado: {
			css: "[view-model='E1350003PFAC001Descrip']",
			viewModels: ["E1350003PFAC001Descrip"],
			labels: ["Cliente frecuente", "RFC"],
		},
		rfc: {
			css: "[view-model='E1350003PFAC006']",
			viewModels: ["E1350003PFAC006"],
			labels: ["RFC"],
		},
		razonSocial: {
			css: "[view-model='E1350003PFAC002']",
			viewModels: ["E1350003PFAC002"],
			labels: ["Nombre", "Razón social"],
		},
		/** DomicilioFiscalReceptor (CP). */
		codigoPostal: {
			css: "[view-model='E1350003PFAC005']",
			viewModels: ["E1350003PFAC005"],
			labels: ["Código postal", "Domicilio fiscal"],
		},
		regimenFiscal: {
			css: "[view-model='E1350003PFAC009Descrip']",
			viewModels: ["E1350003PFAC009Descrip"],
			labels: ["Régimen fiscal", "Regimen fiscal"],
		},
		usoCFDI: {
			css: "[view-model='E1350003PUsoFacturaMoralDescrip'], [view-model='E1350003PUsoFacturaFisicaDescrip']",
			viewModels: [
				"E1350003PUsoFacturaMoralDescrip",
				"E1350003PUsoFacturaFisicaDescrip",
			],
			labels: ["Uso CFDI", "Uso de la factura"],
		},
		/** Checkbox paneldinamico="Es una Exportación". */
		esExportacion: {
			css: "[view-model='E1350003PFAC086']",
			viewModels: ["E1350003PFAC086"],
			labels: ["Es una Exportación", "Exportación"],
		},
		claveExportacion: {
			css: "[view-model='E1350006PExportacion']",
			viewModels: ["E1350006PExportacion"],
			labels: ["Exportación"],
		},
		residenciaFiscal: {
			css: "[view-model='E1350003PFAC085Descrip']",
			viewModels: ["E1350003PFAC085Descrip"],
			labels: ["Residencia fiscal"],
		},
		/** NumRegIdTrib: FAC008 está visible; FAC010 aparece tras exportación. */
		numRegIdTrib: {
			css: "[view-model='E1350003PFAC008'], [view-model='E1350003PFAC010'], [view-model='E1350003PFAC101']",
			viewModels: ["E1350003PFAC008", "E1350003PFAC010", "E1350003PFAC101"],
			labels: ["Num. Reg", "Registro", "Tax ID"],
		},
		pais: {
			css: "[view-model='E1350003PFAC075']",
			viewModels: ["E1350003PFAC075"],
			labels: ["País", "Pais"],
		},
	},
	/** Conceptos — E1350010P* confirmados en inventario. */
	concepto: {
		nuevoBoton:
			"#btnMuestraConcepto, #btnNuevoConcepto, a[id*='Concepto'], button[id*='Concepto']",
		descripcion: {
			css: "[view-model='E1350010PDescripcion']",
			viewModels: ["E1350010PDescripcion"],
			labels: ["Descripción"],
		},
		cantidad: {
			css: "[view-model='E1350010PCantidad']",
			viewModels: ["E1350010PCantidad"],
			labels: ["Cantidad"],
		},
		valorUnitario: {
			css: "[view-model='E1350010PValorUnitario']",
			viewModels: ["E1350010PValorUnitario"],
			labels: ["Valor unitario"],
		},
		importe: {
			css: "[view-model='E1350010PImporte']",
			viewModels: ["E1350010PImporte"],
			labels: ["Importe"],
		},
		claveProdServ: {
			css: "[view-model='E1350010PProductoServicio']",
			viewModels: ["E1350010PProductoServicio"],
			labels: ["Producto", "servicio", "Clave"],
		},
		claveUnidad: {
			css: "[view-model='E1350010PClaveUnidad']",
			viewModels: ["E1350010PClaveUnidad"],
			labels: ["Clave de unidad", "Unidad"],
		},
		objetoImp: {
			css: "[view-model='E1350010PObjetoImp']",
			viewModels: ["E1350010PObjetoImp"],
			labels: ["Objeto de impuesto", "ObjetoImp"],
		},
		guardarConcepto:
			"#btnAceptarModal, #tabConceptos #btnAceptarModal, #btnGuardarConcepto, button[id*='Aceptar']",
	},
	sellado: {
		botonSellar: "a.btn-sellar-factura",
		modalConfirmar: "#ModalConfirmarSellar",
		confirmarEnModal: "#ModalConfirmarSellar a.btn-sellar-factura",
		fileDialog: "#fileDialog",
		cerInput:
			"#fileCertificate, input[type='file'][accept*='.cer'], #Certificate",
		keyInput:
			"#filePrivateKey, input[type='file'][accept*='.key'], #PrivateKey",
		passwordInput:
			"#privateKeyPassword, #PrivateKeyPassword, input[type='password'][name*='Password']",
		confirmarSello:
			"#submit, #btnFirmar, #btnConfirmarSello, button[id*='Firmar']",
	},
	descarga: {
		xml: "a[href*='.xml'], #btnDescargarXml, a[id*='Xml'], #linkBajarZip",
		pdf: "a[href*='.pdf'], #btnDescargarPdf, a[id*='Pdf']",
	},
} as const;

/** Pistas para localizar controles FormsBuilder. */
export type SatFieldHints = {
	css: string;
	viewModels: readonly string[];
	labels: readonly string[];
};

export const SAT_TIMEOUT_MS = 30_000;
export const SAT_LOGIN_TIMEOUT_MS = 120_000;
export const SAT_FORM_TIMEOUT_MS = 90_000;
