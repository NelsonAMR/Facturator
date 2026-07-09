import { mkdir, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as p from "@clack/prompts";
import puppeteer, {
	type Browser,
	type ElementHandle,
	type Page,
} from "puppeteer";
import type {
	ConceptoPayload,
	EmitirFacturaPayload,
	EmitirFacturaResult,
	IBillingAdapter,
	ReceptorPayload,
} from "../../domain/ports/billing.port.js";
import { resolveBillingOutputPaths } from "../helpers/billing-output-path.js";
import { loadSatEnv, type SatEnvConfig } from "../helpers/sat-env.js";
import {
	SAT_LOGIN_TIMEOUT_MS,
	SAT_SELECTORS,
	SAT_TIMEOUT_MS,
} from "./sat-selectors.js";

export class PuppeteerSatAdapter implements IBillingAdapter {
	async emitirFactura(
		payload: EmitirFacturaPayload,
	): Promise<EmitirFacturaResult> {
		const env = loadSatEnv();
		const downloadDir = join(tmpdir(), `facturator-sat-${Date.now()}`);
		await mkdir(downloadDir, { recursive: true });

		let browser: Browser | null = null;

		try {
			browser = await this.launchBrowser();
			const page = await browser.newPage();
			await this.configureDownloads(page, downloadDir);

			await this.login(page, env);
			await this.navegarAFacturacion(page);
			await this.llenarReceptor(page, payload.receptor);
			await this.llenarConcepto(page, payload);

			await this.confirmarTimbradoManual();

			await this.sellarConEfirma(page, env);
			await this.esperarDescargaYGuardar(page, downloadDir, env, payload);

			return { success: true };
		} finally {
			if (browser) {
				await browser.close().catch(() => undefined);
			}
		}
	}

	private async launchBrowser(): Promise<Browser> {
		return puppeteer.launch({
			headless: false,
			defaultViewport: null,
			args: ["--start-maximized"],
		});
	}

	private async configureDownloads(
		page: Page,
		downloadDir: string,
	): Promise<void> {
		const client = await page.createCDPSession();
		await client.send("Page.setDownloadBehavior", {
			behavior: "allow",
			downloadPath: downloadDir,
		});
	}

	private async login(page: Page, env: SatEnvConfig): Promise<void> {
		try {
			await page.goto(SAT_SELECTORS.urls.login, {
				waitUntil: "networkidle2",
				timeout: SAT_LOGIN_TIMEOUT_MS,
			});

			await this.waitAndType(
				page,
				SAT_SELECTORS.login.rfcInput,
				env.rfc,
				"login.rfcInput",
			);
			await this.waitAndType(
				page,
				SAT_SELECTORS.login.passwordInput,
				env.password,
				"login.passwordInput",
			);
			await this.waitAndClick(
				page,
				SAT_SELECTORS.login.submitButton,
				"login.submitButton",
			);

			await page.waitForSelector(SAT_SELECTORS.login.postLoginMarker, {
				timeout: SAT_LOGIN_TIMEOUT_MS,
			});
		} catch (error) {
			throw this.wrapError("login SAT", error);
		}
	}

	private async navegarAFacturacion(page: Page): Promise<void> {
		try {
			await this.waitAndClick(
				page,
				SAT_SELECTORS.navegacion.generacionMenu,
				"navegacion.generacionMenu",
			);
			await this.waitAndClick(
				page,
				SAT_SELECTORS.navegacion.nuevaFactura,
				"navegacion.nuevaFactura",
			);
		} catch (error) {
			throw this.wrapError("navegación a facturación", error);
		}
	}

	private async llenarReceptor(
		page: Page,
		receptor: ReceptorPayload,
	): Promise<void> {
		try {
			await this.waitAndType(
				page,
				SAT_SELECTORS.receptor.rfc,
				receptor.rfc,
				"receptor.rfc",
			);
			await this.waitAndType(
				page,
				SAT_SELECTORS.receptor.razonSocial,
				receptor.razonSocial,
				"receptor.razonSocial",
			);
			await this.waitAndType(
				page,
				SAT_SELECTORS.receptor.codigoPostal,
				receptor.codigoPostal,
				"receptor.codigoPostal",
			);
			await this.waitAndSelectOrType(
				page,
				SAT_SELECTORS.receptor.regimenFiscal,
				receptor.regimenFiscal,
				"receptor.regimenFiscal",
			);
			await this.waitAndSelectOrType(
				page,
				SAT_SELECTORS.receptor.usoCFDI,
				receptor.usoCFDI,
				"receptor.usoCFDI",
			);

			if (receptor.residenciaFiscal !== "MX") {
				await this.waitAndSelectOrType(
					page,
					SAT_SELECTORS.receptor.residenciaFiscal,
					receptor.residenciaFiscal,
					"receptor.residenciaFiscal",
				);

				if (receptor.pais) {
					await this.waitAndSelectOrType(
						page,
						SAT_SELECTORS.receptor.pais,
						receptor.pais,
						"receptor.pais",
					);
				}

				if (receptor.numRegIdTrib) {
					await this.waitAndType(
						page,
						SAT_SELECTORS.receptor.numRegIdTrib,
						receptor.numRegIdTrib,
						"receptor.numRegIdTrib",
					);
				}
			}
		} catch (error) {
			throw this.wrapError("llenado de receptor", error);
		}
	}

	private async llenarConcepto(
		page: Page,
		payload: EmitirFacturaPayload,
	): Promise<void> {
		const concepto: ConceptoPayload = payload.concepto;

		try {
			const nuevoBoton = await page.$(SAT_SELECTORS.concepto.nuevoBoton);
			if (nuevoBoton) {
				await nuevoBoton.click();
			}

			await this.waitAndType(
				page,
				SAT_SELECTORS.concepto.claveProdServ,
				concepto.claveProdServ,
				"concepto.claveProdServ",
			);
			await this.waitAndType(
				page,
				SAT_SELECTORS.concepto.claveUnidad,
				concepto.claveUnidad,
				"concepto.claveUnidad",
			);
			await this.waitAndType(
				page,
				SAT_SELECTORS.concepto.descripcion,
				concepto.descripcion,
				"concepto.descripcion",
			);
			await this.waitAndType(
				page,
				SAT_SELECTORS.concepto.cantidad,
				String(concepto.cantidad),
				"concepto.cantidad",
			);
			await this.waitAndType(
				page,
				SAT_SELECTORS.concepto.valorUnitario,
				String(concepto.valorUnitario),
				"concepto.valorUnitario",
			);

			const importeInput = await page.$(SAT_SELECTORS.concepto.importe);
			if (importeInput) {
				await this.clearAndType(importeInput, String(concepto.importe));
			}

			const guardar = await page.$(SAT_SELECTORS.concepto.guardarConcepto);
			if (guardar) {
				await guardar.click();
			}
		} catch (error) {
			throw this.wrapError("llenado de concepto", error);
		}
	}

	private async confirmarTimbradoManual(): Promise<void> {
		const confirmar = await p.confirm({
			message:
				"¿Los datos precargados en el SAT son correctos para proceder al timbrado oficial? (Y/n)",
			initialValue: false,
		});

		if (p.isCancel(confirmar) || !confirmar) {
			throw new Error("Timbrado cancelado por el usuario.");
		}
	}

	private async sellarConEfirma(page: Page, env: SatEnvConfig): Promise<void> {
		try {
			await this.waitAndClick(
				page,
				SAT_SELECTORS.sellado.botonSellar,
				"sellado.botonSellar",
			);

			const cerInput = await this.waitForElement(
				page,
				SAT_SELECTORS.sellado.cerInput,
				"sellado.cerInput",
			);
			const keyInput = await this.waitForElement(
				page,
				SAT_SELECTORS.sellado.keyInput,
				"sellado.keyInput",
			);

			await (cerInput as ElementHandle<HTMLInputElement>).uploadFile(
				env.efirmaCerPath,
			);
			await (keyInput as ElementHandle<HTMLInputElement>).uploadFile(
				env.efirmaKeyPath,
			);

			await this.waitAndType(
				page,
				SAT_SELECTORS.sellado.passwordInput,
				env.efirmaPassword,
				"sellado.passwordInput",
			);

			const confirmarSello = await page.$(SAT_SELECTORS.sellado.confirmarSello);
			if (confirmarSello) {
				await confirmarSello.click();
			}
		} catch (error) {
			throw this.wrapError("sellado con e.firma", error);
		}
	}

	private async esperarDescargaYGuardar(
		page: Page,
		downloadDir: string,
		env: SatEnvConfig,
		payload: EmitirFacturaPayload,
	): Promise<void> {
		try {
			const output = await resolveBillingOutputPaths(
				env.outputBillingPath,
				payload.folioInterno,
			);

			const xmlPath = await this.clickAndWaitDownload(
				page,
				SAT_SELECTORS.descarga.xml,
				downloadDir,
				"descarga.xml",
			);
			await rename(xmlPath, output.xmlPath);

			const pdfPath = await this.clickAndWaitDownload(
				page,
				SAT_SELECTORS.descarga.pdf,
				downloadDir,
				"descarga.pdf",
			);
			await rename(pdfPath, output.pdfPath);
		} catch (error) {
			throw this.wrapError("descarga y guardado de XML/PDF", error);
		}
	}

	private async clickAndWaitDownload(
		page: Page,
		selector: string,
		downloadDir: string,
		label: string,
	): Promise<string> {
		const { readdir, stat } = await import("node:fs/promises");

		const before = new Set(
			await readdir(downloadDir).catch(() => [] as string[]),
		);

		await this.waitAndClick(page, selector, label);

		const deadline = Date.now() + SAT_TIMEOUT_MS;
		while (Date.now() < deadline) {
			const files = await readdir(downloadDir);
			const candidates = files.filter(
				(f) =>
					!before.has(f) && !f.endsWith(".crdownload") && !f.endsWith(".tmp"),
			);

			for (const file of candidates) {
				const fullPath = join(downloadDir, file);
				const info = await stat(fullPath);
				if (info.isFile() && info.size > 0) {
					return fullPath;
				}
			}

			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		throw new Error(
			`SAT selector no encontrado o descarga no completada: ${label} tras ${SAT_TIMEOUT_MS}ms`,
		);
	}

	private async waitForElement(
		page: Page,
		selector: string,
		label: string,
	): Promise<ElementHandle<Element>> {
		try {
			const handle = await page.waitForSelector(selector, {
				timeout: SAT_TIMEOUT_MS,
				visible: true,
			});

			if (!handle) {
				throw new Error(`Elemento nulo para selector: ${selector}`);
			}

			return handle;
		} catch (error) {
			throw new Error(
				`SAT selector no encontrado: ${label} (${selector}) tras ${SAT_TIMEOUT_MS}ms. ${error instanceof Error ? error.message : ""}`,
			);
		}
	}

	private async waitAndClick(
		page: Page,
		selector: string,
		label: string,
	): Promise<void> {
		const element = await this.waitForElement(page, selector, label);
		await element.click();
	}

	private async waitAndType(
		page: Page,
		selector: string,
		value: string,
		label: string,
	): Promise<void> {
		const element = await this.waitForElement(page, selector, label);
		await this.clearAndType(element, value);
	}

	private async waitAndSelectOrType(
		page: Page,
		selector: string,
		value: string,
		label: string,
	): Promise<void> {
		const element = await this.waitForElement(page, selector, label);
		const tagName = await page.evaluate(
			(el) => el.tagName.toLowerCase(),
			element,
		);

		if (tagName === "select") {
			await page.select(selector, value).catch(async () => {
				await this.clearAndType(element, value);
			});
			return;
		}

		await this.clearAndType(element, value);
	}

	private async clearAndType(
		element: ElementHandle<Element>,
		value: string,
	): Promise<void> {
		await element.click();
		await element.evaluate((el) => {
			if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
				el.value = "";
				el.dispatchEvent(new Event("input", { bubbles: true }));
			}
		});
		await element.type(value, { delay: 20 });
	}

	private wrapError(step: string, error: unknown): Error {
		const message = error instanceof Error ? error.message : String(error);
		return new Error(`Error en ${step}: ${message}`);
	}
}
