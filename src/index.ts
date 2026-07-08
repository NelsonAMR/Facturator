import "dotenv/config";
import * as p from "@clack/prompts";
import { Command } from "commander";
import type { Cliente } from "./domain/entities/Cliente.js";
import type { FacturaLog } from "./domain/entities/Factura.js";
import { calcularDesgloseFiscal } from "./domain/services/calcularFactura.js";
import { JsonClienteRepository } from "./infrastructure/adapters/json-cliente.repository.js";
import { LocalStorageAdapter } from "./infrastructure/adapters/local-storage.adapter.js";
import { MockExchangeRateAdapter } from "./infrastructure/adapters/mock-rate.adapter.js";

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
		message: `Monto a facturar (${moneda})`,
		validate: validarMonto,
	});

	if (p.isCancel(input)) {
		throw new Error("Operación cancelada.");
	}

	return Number(input);
}

async function ejecutarFacturacion(
	clientId?: string,
	montoFlag?: string,
): Promise<void> {
	p.intro("Facturator — RESICO");

	const clienteRepo = new JsonClienteRepository();
	const storage = new LocalStorageAdapter();
	const exchangeRate = new MockExchangeRateAdapter();

	try {
		const cliente = await resolverCliente(clienteRepo, clientId);
		const monto = await resolverMonto(cliente, montoFlag);
		const desglose = await calcularDesgloseFiscal(cliente, monto, exchangeRate);
		const folioInterno = await storage.generarSiguienteFolioInterno();

		const factura: FacturaLog = {
			...desglose,
			folioInterno,
			clienteId: cliente.id,
			razonSocial: cliente.razonSocial,
			residenciaFiscal: cliente.residenciaFiscal,
			createdAt: new Date().toISOString(),
		};

		p.note(formatearNota(factura, cliente), "Desglose Fiscal");

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
	.option("-m, --monto <number>", "Monto a facturar")
	.action(async (options: { client?: string; monto?: string }) => {
		await ejecutarFacturacion(options.client, options.monto);
	});

program.parse();
