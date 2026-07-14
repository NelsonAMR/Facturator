import "dotenv/config";
import * as p from "@clack/prompts";
import { Command } from "commander";
import type { Cliente } from "./domain/entities/Cliente.js";
import type { FacturaLog } from "./domain/entities/Factura.js";
import type {
	EmitirFacturaPayload,
	Quincena,
} from "./domain/ports/billing.port.js";
import { calcularDesgloseFiscal } from "./domain/services/calcularFactura.js";
import { BanxicoExchangeRateAdapter } from "./infrastructure/adapters/banxico-rate.adapter.js";
import { JsonClienteRepository } from "./infrastructure/adapters/json-cliente.repository.js";
import { LocalStorageAdapter } from "./infrastructure/adapters/local-storage.adapter.js";
import { PuppeteerSatAdapter } from "./infrastructure/adapters/puppeteer-sat.adapter.js";

const CLAVE_PROD_SERV_DEFAULT = "81112100";
const CLAVE_UNIDAD_DEFAULT = "E48";

const mxnFormatter = new Intl.NumberFormat("es-MX", {
	style: "currency",
	currency: "MXN",
});

const usdFormatter = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
});

function formatearNota(factura: FacturaLog, cliente: Cliente): string {
	const montoFormateado =
		factura.monedaIngreso === "USD"
			? usdFormatter.format(factura.montoIngresado)
			: mxnFormatter.format(factura.montoIngresado);

	const lineas = [
		`Folio:          ${factura.folioInterno}`,
		`Cliente:        ${cliente.razonSocial}`,
		`RFC:            ${cliente.rfc}`,
		`Residencia:     ${cliente.residenciaFiscal}`,
		`Fecha de pago:  ${factura.fechaPago}`,
		`Descripción:    ${factura.descripcion}`,
		"",
		`Monto ingresado: ${montoFormateado} ${factura.monedaIngreso}`,
	];

	if (factura.tipoCambio !== null) {
		lineas.push(
			`Tipo de cambio:  ${mxnFormatter.format(factura.tipoCambio)} MXN/USD`,
		);
	}

	lineas.push(
		"",
		`Subtotal MXN:    ${mxnFormatter.format(factura.subtotalMXN)}`,
		`IVA (16%):       ${mxnFormatter.format(factura.iva)}`,
		`Retención ISR:   ${mxnFormatter.format(factura.retencionISR)}`,
		`Total MXN:       ${mxnFormatter.format(factura.totalMXN)}`,
	);

	return lineas.join("\n");
}

function validarMonto(valor: string | undefined): string | undefined {
	if (!valor) {
		return "Ingresa un monto válido mayor a 0";
	}

	const monto = Number(valor);

	if (Number.isNaN(monto) || monto <= 0) {
		return "Ingresa un monto válido mayor a 0";
	}
}

function validarFecha(valor: string | undefined): string | undefined {
	if (!valor) {
		return "Ingresa la fecha en formato YYYY-MM-DD";
	}

	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
	if (!match) {
		return "Formato inválido. Usa YYYY-MM-DD (ej. 2026-07-08)";
	}

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(year, month - 1, day);

	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return "Fecha inválida";
	}

	const hoy = new Date();
	hoy.setHours(23, 59, 59, 999);
	if (date > hoy) {
		return "La fecha de pago no puede ser futura";
	}
}

function validarDescripcion(valor: string | undefined): string | undefined {
	if (!valor?.trim()) {
		return "Ingresa una descripción del concepto";
	}
}

function hoyIso(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

async function resolverCliente(
	clienteRepo: JsonClienteRepository,
	clientId?: string,
): Promise<Cliente> {
	if (clientId) {
		const cliente = await clienteRepo.obtenerPorId(clientId);

		if (!cliente) {
			throw new Error(`Cliente "${clientId}" no encontrado.`);
		}

		return cliente;
	}

	const clientes = await clienteRepo.obtenerTodos();

	const seleccion = await p.select({
		message: "Selecciona un cliente",
		options: clientes.map((c) => ({
			value: c.id,
			label: c.razonSocial,
			hint: c.residenciaFiscal !== "MX" ? "Extranjero" : "Nacional",
		})),
	});

	if (p.isCancel(seleccion)) {
		throw new Error("Operación cancelada.");
	}

	const cliente = clientes.find((c) => c.id === seleccion);

	if (!cliente) {
		throw new Error("Cliente no encontrado.");
	}

	return cliente;
}

async function resolverFechaPago(fechaFlag?: string): Promise<string> {
	if (fechaFlag !== undefined) {
		const error = validarFecha(fechaFlag);
		if (error) {
			throw new Error(error);
		}

		return fechaFlag;
	}

	const input = await p.text({
		message: "Fecha del pago (YYYY-MM-DD)",
		placeholder: hoyIso(),
		defaultValue: hoyIso(),
		validate: validarFecha,
	});

	if (p.isCancel(input)) {
		throw new Error("Operación cancelada.");
	}

	return input;
}

async function resolverMonto(
	cliente: Cliente,
	montoFlag?: string,
): Promise<number> {
	if (montoFlag !== undefined) {
		const monto = Number(montoFlag);

		if (Number.isNaN(monto) || monto <= 0) {
			throw new Error("Monto inválido. Debe ser un número mayor a 0.");
		}

		return monto;
	}

	const moneda = cliente.residenciaFiscal !== "MX" ? "USD" : "MXN";

	const input = await p.text({
		message: `Cantidad del pago (${moneda})`,
		validate: validarMonto,
	});

	if (p.isCancel(input)) {
		throw new Error("Operación cancelada.");
	}

	return Number(input);
}

async function resolverDescripcion(descripcionFlag?: string): Promise<string> {
	if (descripcionFlag !== undefined) {
		const error = validarDescripcion(descripcionFlag);
		if (error) {
			throw new Error(error);
		}

		return descripcionFlag.trim();
	}

	const input = await p.text({
		message: "Descripción del concepto",
		placeholder: "Servicios profesionales de desarrollo de software",
		validate: validarDescripcion,
	});

	if (p.isCancel(input)) {
		throw new Error("Operación cancelada.");
	}

	return input.trim();
}

async function resolverQuincena(): Promise<Quincena> {
	const seleccion = await p.select({
		message: "¿A qué quincena corresponde este pago?",
		options: [
			{ value: "Q1" as const, label: "Q1", hint: "Primera quincena" },
			{ value: "Q2" as const, label: "Q2", hint: "Segunda quincena" },
		],
	});

	if (p.isCancel(seleccion)) {
		throw new Error("Operación cancelada.");
	}

	return seleccion;
}

function mapearPayloadEmision(
	cliente: Cliente,
	factura: FacturaLog,
	quincena: Quincena,
): EmitirFacturaPayload {
	return {
		folioInterno: factura.folioInterno,
		receptor: {
			rfc: cliente.rfc,
			razonSocial: cliente.razonSocial,
			codigoPostal: cliente.codigoPostal,
			regimenFiscal: cliente.regimenFiscal,
			usoCFDI: cliente.usoCFDI,
			residenciaFiscal: cliente.residenciaFiscal,
			pais: cliente.pais,
			numRegIdTrib: cliente.numRegIdTrib,
		},
		concepto: {
			descripcion: factura.descripcion,
			cantidad: 1,
			valorUnitario: factura.subtotalMXN,
			importe: factura.subtotalMXN,
			claveProdServ: cliente.claveProdServ ?? CLAVE_PROD_SERV_DEFAULT,
			claveUnidad: cliente.claveUnidad ?? CLAVE_UNIDAD_DEFAULT,
		},
		subtotalMXN: factura.subtotalMXN,
		iva: factura.iva,
		retencionISR: factura.retencionISR,
		totalMXN: factura.totalMXN,
		moneda: "MXN",
		tipoCambio: factura.tipoCambio,
		quincena,
	};
}

async function ejecutarFacturacion(options: {
	clientId?: string;
	montoFlag?: string;
	fechaFlag?: string;
	descripcionFlag?: string;
	dryRun?: boolean;
}): Promise<void> {
	p.intro("Facturator — RESICO");

	const clienteRepo = new JsonClienteRepository();
	const storage = new LocalStorageAdapter();
	const exchangeRate = new BanxicoExchangeRateAdapter();
	const billing = new PuppeteerSatAdapter();

	try {
		const cliente = await resolverCliente(clienteRepo, options.clientId);
		const fechaPago = await resolverFechaPago(options.fechaFlag);
		const monto = await resolverMonto(cliente, options.montoFlag);
		const descripcion = await resolverDescripcion(options.descripcionFlag);

		const desglose = await calcularDesgloseFiscal(
			cliente,
			monto,
			exchangeRate,
			fechaPago,
		);
		const folioInterno = await storage.generarSiguienteFolioInterno();

		const factura: FacturaLog = {
			...desglose,
			folioInterno,
			clienteId: cliente.id,
			razonSocial: cliente.razonSocial,
			residenciaFiscal: cliente.residenciaFiscal,
			fechaPago,
			descripcion,
			createdAt: new Date().toISOString(),
		};

		p.note(formatearNota(factura, cliente), "Desglose Fiscal");

		const quincena = await resolverQuincena();

		if (options.dryRun) {
			p.log.warn("Modo --dry-run: se omite el timbrado en el portal SAT.");
			p.log.info(`Quincena seleccionada: ${quincena}`);
		} else {
			p.log.step("Iniciando precarga en el portal SAT...");
			const payload = mapearPayloadEmision(cliente, factura, quincena);
			await billing.emitirFactura(payload);
			p.log.success("Timbrado completado y archivos guardados.");
		}

		await storage.guardarFacturaLog(factura);

		p.outro(`Factura ${folioInterno} registrada en data/facturas.json`);
	} catch (error) {
		const mensaje =
			error instanceof Error ? error.message : "Error desconocido.";
		p.cancel(mensaje);
		process.exitCode = 1;
	}
}

const program = new Command();

program
	.name("facturator")
	.description("CLI de facturación automatizada para RESICO")
	.option("-c, --client <id>", "ID del cliente")
	.option("-m, --monto <number>", "Cantidad del pago")
	.option("-f, --fecha <YYYY-MM-DD>", "Fecha del pago (para el tipo de cambio)")
	.option("-d, --descripcion <texto>", "Descripción del concepto")
	.option("--dry-run", "Calcula y registra el desglose sin abrir el portal SAT")
	.action(
		async (options: {
			client?: string;
			monto?: string;
			fecha?: string;
			descripcion?: string;
			dryRun?: boolean;
		}) => {
			await ejecutarFacturacion({
				clientId: options.client,
				montoFlag: options.monto,
				fechaFlag: options.fecha,
				descripcionFlag: options.descripcion,
				dryRun: Boolean(options.dryRun),
			});
		},
	);

program.parse();
