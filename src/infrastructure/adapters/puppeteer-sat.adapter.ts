import { mkdir, readdir, rename, stat } from "node:fs/promises";
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
	SAT_FORM_TIMEOUT_MS,
	SAT_LOGIN_TIMEOUT_MS,
	SAT_SELECTORS,
	SAT_TIMEOUT_MS,
	type SatFieldHints,
} from "./sat-selectors.js";

export class PuppeteerSatAdapter implements IBillingAdapter {
	async emitirFactura(
		payload: EmitirFacturaPayload,
	): Promise<EmitirFacturaResult> {
		const env = loadSatEnv();
		const output = await resolveBillingOutputPaths(
			env.outputBillingPath,
			payload.folioInterno,
			payload.quincena,
		);

		await mkdir(output.directory, { recursive: true });

		let browser: Browser | null = null;

		try {
			browser = await this.launchBrowser();
			const page = await browser.newPage();
			await this.configureDownloads(page, output.directory);

			await this.login(page, env);
			await this.navegarAFacturacion(page);
			await this.llenarReceptor(page, payload.receptor);
			await this.llenarConcepto(page, payload);

			await this.confirmarTimbradoManual();

			await this.sellarConEfirma(page, env);
			await this.esperarDescargaYGuardar(page, output.directory, payload);

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
		const client = await page.target().createCDPSession();
		await client.send("Page.setDownloadBehavior", {
			behavior: "allow",
			downloadPath: downloadDir,
		});
	}

	private async login(page: Page, env: SatEnvConfig): Promise<void> {
		try {
			await page.goto(SAT_SELECTORS.urls.generaFactura, {
				waitUntil: "networkidle2",
				timeout: SAT_LOGIN_TIMEOUT_MS,
			});

			if (await this.estaAutenticado(page)) {
				return;
			}

			// Asegura estar en login CIEC (o ya en e.firma) antes de continuar.
			await page
				.waitForSelector(
					`${SAT_SELECTORS.login.formCiec}, ${SAT_SELECTORS.login.botonEfirma}, ${SAT_SELECTORS.login.efirmaFormMarker}`,
					{ timeout: SAT_LOGIN_TIMEOUT_MS },
				)
				.catch(() => {
					throw new Error(
						"No se encontró la pantalla de login del SAT tras abrir GeneraFactura.",
					);
				});

			await this.cambiarALoginEfirma(page);
			await this.completarFormularioEfirma(page, env);

			await page.waitForFunction(
				() => {
					const href = window.location.href;
					return (
						href.includes("facturaelectronica.sat.gob.mx") &&
						!href.includes("cfdiau.sat.gob.mx")
					);
				},
				{ timeout: SAT_LOGIN_TIMEOUT_MS },
			);

			if (!page.url().includes("GeneraFactura")) {
				await page.goto(SAT_SELECTORS.urls.generaFactura, {
					waitUntil: "networkidle2",
					timeout: SAT_LOGIN_TIMEOUT_MS,
				});
			}

			if (await this.estaEnLoginCiec(page)) {
				throw new Error(
					"El login con e.firma no completó la sesión; sigue en la pantalla de autenticación.",
				);
			}

			await page.waitForSelector(SAT_SELECTORS.login.postLoginMarker, {
				timeout: SAT_LOGIN_TIMEOUT_MS,
			});

			await this.esperarFormularioListo(page);
		} catch (error) {
			throw this.wrapError("login SAT con e.firma", error);
		}
	}

	private async estaAutenticado(page: Page): Promise<boolean> {
		const href = page.url();
		if (
			href.includes("cfdiau.sat.gob.mx") ||
			href.includes("login") ||
			(await this.estaEnLoginCiec(page))
		) {
			return false;
		}

		if (!href.includes("facturaelectronica.sat.gob.mx")) {
			return false;
		}

		const marker = await page.$(SAT_SELECTORS.login.postLoginMarker);
		return Boolean(marker);
	}

	private async estaEnLoginCiec(page: Page): Promise<boolean> {
		const form = await page.$(SAT_SELECTORS.login.formCiec);
		const rfc = await page.$(SAT_SELECTORS.login.rfcInput);
		const boton = await page.$(SAT_SELECTORS.login.botonEfirma);
		return Boolean(form || (rfc && boton));
	}

	/**
	 * En la pantalla CIEC, hace clic en #buttonFiel para ir al formulario e.firma
	 * (cfdiau / SATx509Custom). Los file inputs están ocultos; se espera el marcador visible.
	 */
	private async cambiarALoginEfirma(page: Page): Promise<void> {
		const yaEnEfirma = await page.$(SAT_SELECTORS.login.efirmaFormMarker);
		if (yaEnEfirma) {
			return;
		}

		const boton = await this.waitForElement(
			page,
			SAT_SELECTORS.login.botonEfirma,
			"login.botonEfirma (#buttonFiel)",
		);

		await Promise.all([
			boton.click(),
			page
				.waitForSelector(SAT_SELECTORS.login.efirmaFormMarker, {
					timeout: SAT_LOGIN_TIMEOUT_MS,
					visible: true,
				})
				.catch(() => null),
		]);

		const formVisible = await page.$(SAT_SELECTORS.login.efirmaFormMarker);
		if (!formVisible) {
			await page
				.waitForSelector(SAT_SELECTORS.login.efirmaFormMarker, {
					timeout: SAT_LOGIN_TIMEOUT_MS,
					visible: true,
				})
				.catch(() => {
					throw new Error(
						"Se hizo clic en #buttonFiel pero no apareció el formulario de e.firma (#privateKeyPassword / #txtCertificate).",
					);
				});
		}
	}

	/**
	 * Rellena e.firma según el DOM real del SAT:
	 * - #fileCertificate / #filePrivateKey (display:none) ← uploadFile
	 * - #privateKeyPassword ← contraseña
	 * - #rfc se llena solo al parsear el .cer (disabled)
	 * - #submit llama firmar(event) y hace POST de #certform
	 */
	private async completarFormularioEfirma(
		page: Page,
		env: SatEnvConfig,
	): Promise<void> {
		await this.waitForElement(
			page,
			SAT_SELECTORS.login.efirmaFormMarker,
			"login.efirmaFormMarker",
		);

		const cerInput = await this.waitForHiddenFileInput(
			page,
			SAT_SELECTORS.login.cerInput,
			"login.cerInput (#fileCertificate)",
		);
		const keyInput = await this.waitForHiddenFileInput(
			page,
			SAT_SELECTORS.login.keyInput,
			"login.keyInput (#filePrivateKey)",
		);

		await cerInput.uploadFile(env.efirmaCerPath);
		await this.dispatchFileChange(cerInput);
		await keyInput.uploadFile(env.efirmaKeyPath);
		await this.dispatchFileChange(keyInput);

		// El JS del SAT parsea el .cer y rellena #rfc; sin eso firmar() falla.
		await page
			.waitForFunction(
				(selector) => {
					const rfc = document.querySelector(
						selector,
					) as HTMLInputElement | null;
					return Boolean(rfc?.value && rfc.value.trim().length >= 12);
				},
				{ timeout: SAT_TIMEOUT_MS },
				SAT_SELECTORS.login.rfcEfirma,
			)
			.catch(() => {
				throw new Error(
					"Tras subir el .cer, el SAT no rellenó el RFC. Verifica SAT_EFIRMA_CER_PATH y que el certificado sea válido.",
				);
			});

		await this.waitAndType(
			page,
			SAT_SELECTORS.login.passwordInput,
			env.efirmaPassword,
			"login.passwordInput",
		);

		// Asegura que un error previo no haya dejado #submit disabled.
		await page.evaluate((selector) => {
			const btn = document.querySelector(selector) as HTMLInputElement | null;
			if (btn) {
				btn.disabled = false;
			}
		}, SAT_SELECTORS.login.submitButton);

		await this.waitAndClick(
			page,
			SAT_SELECTORS.login.submitButton,
			"login.submitButton (#submit / Enviar)",
		);
	}

	/**
	 * Espera a que FormsBuilder pinte el formulario en #groupcontainer
	 * (el shell llega con el contenedor vacío y #loadAjax / #myModal activos).
	 */
	private async esperarFormularioListo(page: Page): Promise<void> {
		await page
			.waitForFunction(
				(loadSel, modalesSel, groupSel) => {
					const loading = document.querySelector(loadSel) as HTMLElement | null;
					if (loading) {
						const style = getComputedStyle(loading);
						const visible =
							style.display !== "none" &&
							style.visibility !== "hidden" &&
							loading.classList.contains("overlay");
						if (visible) {
							return false;
						}
					}

					// Bootstrap: modal visible ⇒ clase .in / .show (position:fixed).
					for (const modal of document.querySelectorAll(modalesSel)) {
						if (
							modal.classList.contains("in") ||
							modal.classList.contains("show")
						) {
							return false;
						}
					}

					const group = document.querySelector(groupSel);
					if (!group) {
						return false;
					}

					const controls = group.querySelectorAll(
						"input:not([type='hidden']), select, textarea",
					);
					return controls.length >= 3;
				},
				{ timeout: SAT_FORM_TIMEOUT_MS },
				SAT_SELECTORS.formulario.loadAjax,
				SAT_SELECTORS.formulario.modalesCarga,
				SAT_SELECTORS.formulario.groupContainer,
			)
			.catch(async () => {
				const inventory = await this.dumpFormInventory(page);
				throw new Error(
					`El formulario de GeneraFactura no terminó de cargar en #groupcontainer tras ${SAT_FORM_TIMEOUT_MS}ms.\nCampos detectados:\n${inventory}`,
				);
			});

		await this.expandirPanelesFormulario(page);
	}

	private async expandirPanelesFormulario(page: Page): Promise<void> {
		await page.evaluate((toggleSel) => {
			for (const el of document.querySelectorAll(toggleSel)) {
				if (el instanceof HTMLElement) {
					el.click();
				}
			}
		}, SAT_SELECTORS.formulario.panelToggles);

		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	private async navegarAFacturacion(page: Page): Promise<void> {
		try {
			if (await this.estaEnLoginCiec(page)) {
				throw new Error(
					"Aún en login del SAT; no se puede navegar a facturación.",
				);
			}

			const yaEnGeneraFactura =
				page.url().includes("GeneraFactura") &&
				Boolean(await page.$(SAT_SELECTORS.login.postLoginMarker));

			if (!yaEnGeneraFactura) {
				const nueva = await page.$(SAT_SELECTORS.navegacion.nuevaFactura);
				if (nueva) {
					await Promise.all([
						nueva.click(),
						page
							.waitForNavigation({
								waitUntil: "networkidle2",
								timeout: SAT_FORM_TIMEOUT_MS,
							})
							.catch(() => null),
					]);
				} else {
					await page.goto(SAT_SELECTORS.urls.generaFactura, {
						waitUntil: "networkidle2",
						timeout: SAT_FORM_TIMEOUT_MS,
					});
				}
			}

			await this.esperarFormularioListo(page);
		} catch (error) {
			throw this.wrapError("navegación a facturación", error);
		}
	}

	private async llenarReceptor(
		page: Page,
		receptor: ReceptorPayload,
	): Promise<void> {
		try {
			await this.seleccionarRfcCargadoOtro(page);

			// FAC006 solo aparece tras elegir "Otro".
			await this.fillField(
				page,
				SAT_SELECTORS.receptor.rfc,
				receptor.rfc,
				"receptor.rfc",
				{ requireVisible: true },
			);
			await this.fillField(
				page,
				SAT_SELECTORS.receptor.razonSocial,
				receptor.razonSocial,
				"receptor.razonSocial",
				{ requireVisible: true },
			);

			const esExtranjero = receptor.residenciaFiscal !== "MX";

			if (esExtranjero) {
				await this.marcarExportacion(page);

				await this.fillField(
					page,
					SAT_SELECTORS.receptor.residenciaFiscal,
					receptor.residenciaFiscal === "US"
						? "USA"
						: receptor.residenciaFiscal,
					"receptor.residenciaFiscal",
					{ autocomplete: true, requireVisible: true },
				);

				if (receptor.numRegIdTrib) {
					await this.fillField(
						page,
						SAT_SELECTORS.receptor.numRegIdTrib,
						receptor.numRegIdTrib,
						"receptor.numRegIdTrib",
						{ requireVisible: true },
					);
				}

				if (receptor.pais) {
					await this.fillField(
						page,
						SAT_SELECTORS.receptor.pais,
						receptor.pais,
						"receptor.pais",
						{ optional: true, requireVisible: true },
					);
				}
			}

			// CP y Uso CFDI suelen habilitarse después del RFC.
			await this.fillField(
				page,
				SAT_SELECTORS.receptor.codigoPostal,
				receptor.codigoPostal,
				"receptor.codigoPostal",
				{ requireVisible: true },
			);
			await this.fillField(
				page,
				SAT_SELECTORS.receptor.regimenFiscal,
				receptor.regimenFiscal,
				"receptor.regimenFiscal",
				{ autocomplete: true, requireVisible: true },
			);
			await this.fillField(
				page,
				SAT_SELECTORS.receptor.usoCFDI,
				receptor.usoCFDI,
				"receptor.usoCFDI",
				{ autocomplete: true, requireVisible: true },
			);
		} catch (error) {
			const inventory = await this.dumpFormInventory(page).catch(() => "");
			const base = error instanceof Error ? error.message : String(error);
			throw this.wrapError(
				"llenado de receptor",
				new Error(inventory ? `${base}\nCampos detectados:\n${inventory}` : base),
			);
		}
	}

	/** Marca "Es una Exportación" y elige clave de exportación si aplica. */
	private async marcarExportacion(page: Page): Promise<void> {
		const checkbox = await this.findFieldByHints(
			page,
			SAT_SELECTORS.receptor.esExportacion,
			{ requireVisible: true },
		);
		if (checkbox) {
			await checkbox.evaluate((el) => {
				if (!(el instanceof HTMLInputElement)) {
					return;
				}
				if (!el.checked) {
					el.click();
					el.dispatchEvent(new Event("change", { bubbles: true }));
				}
			});
			await new Promise((resolve) => setTimeout(resolve, 700));
		}

		await this.fillField(
			page,
			SAT_SELECTORS.receptor.claveExportacion,
			"02",
			"receptor.claveExportacion",
			{ optional: true, requireVisible: true },
		);
	}

	/** Elige "Otro" en el autocomplete de clientes frecuentes. */
	private async seleccionarRfcCargadoOtro(page: Page): Promise<void> {
		const campo = await this.findFieldByHints(
			page,
			SAT_SELECTORS.receptor.rfcCargado,
			{ requireVisible: true },
		);
		if (!campo) {
			return;
		}

		await this.setInputValue(campo, "Otro", { typeKeys: true });
		await new Promise((resolve) => setTimeout(resolve, 400));
		await page.keyboard.press("ArrowDown").catch(() => undefined);
		await page.keyboard.press("Enter").catch(() => undefined);
		await campo.evaluate((el) => {
			el.dispatchEvent(new Event("change", { bubbles: true }));
			el.dispatchEvent(new Event("blur", { bubbles: true }));
		});

		await this.waitForField(
			page,
			SAT_SELECTORS.receptor.rfc,
			"receptor.rfc (tras Otro)",
			{ requireVisible: true },
		);
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
				await new Promise((resolve) => setTimeout(resolve, 500));
			}

			await this.fillField(
				page,
				SAT_SELECTORS.concepto.claveProdServ,
				concepto.claveProdServ,
				"concepto.claveProdServ",
			);
			await this.fillField(
				page,
				SAT_SELECTORS.concepto.claveUnidad,
				concepto.claveUnidad,
				"concepto.claveUnidad",
			);
			await this.fillField(
				page,
				SAT_SELECTORS.concepto.descripcion,
				concepto.descripcion,
				"concepto.descripcion",
			);
			await this.fillField(
				page,
				SAT_SELECTORS.concepto.cantidad,
				String(concepto.cantidad),
				"concepto.cantidad",
			);
			await this.fillField(
				page,
				SAT_SELECTORS.concepto.valorUnitario,
				String(concepto.valorUnitario),
				"concepto.valorUnitario",
			);

			const importe = await this.findFieldByHints(
				page,
				SAT_SELECTORS.concepto.importe,
			);
			if (importe) {
				await this.clearAndType(importe, String(concepto.importe));
			}

			await this.fillField(
				page,
				SAT_SELECTORS.concepto.objetoImp,
				concepto.objetoImpuesto ?? "02",
				"concepto.objetoImp",
				{ optional: true },
			);

			const guardar = await page.$(SAT_SELECTORS.concepto.guardarConcepto);
			if (guardar) {
				await guardar.click();
			}
		} catch (error) {
			const inventory = await this.dumpFormInventory(page).catch(() => "");
			const base = error instanceof Error ? error.message : String(error);
			throw this.wrapError(
				"llenado de concepto",
				new Error(inventory ? `${base}\nCampos detectados:\n${inventory}` : base),
			);
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
				"sellado.botonSellar (a.btn-sellar-factura)",
			);

			// Modal "Confirmar sellado" del shell (#ModalConfirmarSellar).
			const modalAparecio = await page
				.waitForSelector(SAT_SELECTORS.sellado.modalConfirmar, {
					timeout: 5_000,
					visible: true,
				})
				.then(() => true)
				.catch(() => false);

			if (modalAparecio) {
				await this.waitAndClick(
					page,
					SAT_SELECTORS.sellado.confirmarEnModal,
					"sellado.confirmarEnModal",
				);
			}

			// Tras confirmar, el SAT pide e.firma (misma UI de login o similar).
			const efirmaVisible = await page
				.waitForSelector(
					`${SAT_SELECTORS.login.efirmaFormMarker}, ${SAT_SELECTORS.sellado.passwordInput}`,
					{ timeout: SAT_TIMEOUT_MS, visible: true },
				)
				.then(() => true)
				.catch(() => false);

			if (!efirmaVisible) {
				throw new Error(
					"Tras Sellar no apareció el formulario de e.firma ni el modal de confirmación esperado.",
				);
			}

			const cerInput = await this.waitForHiddenFileInput(
				page,
				SAT_SELECTORS.sellado.cerInput,
				"sellado.cerInput",
			);
			const keyInput = await this.waitForHiddenFileInput(
				page,
				SAT_SELECTORS.sellado.keyInput,
				"sellado.keyInput",
			);

			await cerInput.uploadFile(env.efirmaCerPath);
			await this.dispatchFileChange(cerInput);
			await keyInput.uploadFile(env.efirmaKeyPath);
			await this.dispatchFileChange(keyInput);

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
		payload: EmitirFacturaPayload,
	): Promise<void> {
		try {
			const before = new Set(
				await readdir(downloadDir).catch(() => [] as string[]),
			);

			const xmlPath = await this.clickAndWaitDownload(
				page,
				SAT_SELECTORS.descarga.xml,
				downloadDir,
				before,
				"descarga.xml",
			);
			await rename(xmlPath, join(downloadDir, `${payload.folioInterno}.xml`));

			const afterXml = new Set(await readdir(downloadDir));
			const pdfPath = await this.clickAndWaitDownload(
				page,
				SAT_SELECTORS.descarga.pdf,
				downloadDir,
				afterXml,
				"descarga.pdf",
			);
			await rename(pdfPath, join(downloadDir, `${payload.folioInterno}.pdf`));
		} catch (error) {
			throw this.wrapError("descarga y guardado de XML/PDF", error);
		}
	}

	private async clickAndWaitDownload(
		page: Page,
		selector: string,
		downloadDir: string,
		before: Set<string>,
		label: string,
	): Promise<string> {
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

	/**
	 * Espera inputs type=file ocultos (display:none). Con visible:true nunca aparecen.
	 */
	private async waitForHiddenFileInput(
		page: Page,
		selector: string,
		label: string,
	): Promise<ElementHandle<HTMLInputElement>> {
		try {
			// Sin visible:true — #fileCertificate / #filePrivateKey tienen display:none.
			const handle = await page.waitForSelector(selector, {
				timeout: SAT_TIMEOUT_MS,
			});

			if (!handle) {
				throw new Error(`Elemento nulo para selector: ${selector}`);
			}

			return handle as ElementHandle<HTMLInputElement>;
		} catch (error) {
			throw new Error(
				`SAT file input no encontrado: ${label} (${selector}) tras ${SAT_TIMEOUT_MS}ms. ${error instanceof Error ? error.message : ""}`,
			);
		}
	}

	/** Dispara change para que el jQuery viejo del SAT (1.6) procese el .cer/.key. */
	private async dispatchFileChange(
		input: ElementHandle<HTMLInputElement>,
	): Promise<void> {
		await input.evaluate((el) => {
			el.dispatchEvent(new Event("input", { bubbles: true }));
			el.dispatchEvent(new Event("change", { bubbles: true }));
		});
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

	private async fillField(
		page: Page,
		hints: SatFieldHints,
		value: string,
		label: string,
		options: {
			optional?: boolean;
			autocomplete?: boolean;
			requireVisible?: boolean;
		} = {},
	): Promise<void> {
		const element = await this.waitForField(page, hints, label, options);
		if (!element) {
			return;
		}

		const tagName = await element.evaluate((el) => el.tagName.toLowerCase());

		if (tagName === "select") {
			const matched = await element.evaluate((el, val) => {
				if (!(el instanceof HTMLSelectElement)) {
					return false;
				}

				const exact = Array.from(el.options).find(
					(o) => o.value === val || o.text.trim() === val,
				);
				const partial = Array.from(el.options).find(
					(o) =>
						o.value.startsWith(val) ||
						o.text.includes(val) ||
						o.value.includes(val),
				);
				const option = exact ?? partial;
				if (!option) {
					return false;
				}

				el.value = option.value;
				el.dispatchEvent(new Event("input", { bubbles: true }));
				el.dispatchEvent(new Event("change", { bubbles: true }));
				el.dispatchEvent(new Event("blur", { bubbles: true }));
				return true;
			}, value);

			if (!matched) {
				await this.setInputValue(element, value, { typeKeys: true });
			}
			return;
		}

		await this.setInputValue(element, value, {
			typeKeys: Boolean(options.autocomplete),
		});

		if (options.autocomplete) {
			await new Promise((resolve) => setTimeout(resolve, 300));
			await page.keyboard.press("ArrowDown").catch(() => undefined);
			await page.keyboard.press("Enter").catch(() => undefined);
			await element.evaluate((el) => {
				el.dispatchEvent(new Event("change", { bubbles: true }));
				el.dispatchEvent(new Event("blur", { bubbles: true }));
			});
			await new Promise((resolve) => setTimeout(resolve, 300));
		}
	}

	private async waitForField(
		page: Page,
		hints: SatFieldHints,
		label: string,
		options: { optional?: boolean; requireVisible?: boolean } = {},
	): Promise<ElementHandle<Element> | null> {
		const deadline = Date.now() + SAT_TIMEOUT_MS;

		while (Date.now() < deadline) {
			const found = await this.findFieldByHints(page, hints, {
				requireVisible: options.requireVisible ?? true,
			});
			if (found) {
				return found;
			}
			await new Promise((resolve) => setTimeout(resolve, 300));
		}

		if (options.optional) {
			return null;
		}

		throw new Error(
			`SAT campo no encontrado/visible: ${label} (css=${hints.css}) tras ${SAT_TIMEOUT_MS}ms`,
		);
	}

	/**
	 * Resuelve por CSS exacto (view-model del inventario).
	 * Prefiere controles visibles: FAC006/FAC005/UsoCFDI empiezan ocultos.
	 */
	private async findFieldByHints(
		page: Page,
		hints: SatFieldHints,
		options: { requireVisible?: boolean } = {},
	): Promise<ElementHandle<Element> | null> {
		const requireVisible = options.requireVisible ?? true;
		const candidates = [
			hints.css,
			...hints.viewModels.map(
				(vm) => `[view-model='${vm}'], [temp-model='${vm}']`,
			),
		];

		for (const selector of candidates) {
			const handles = await page.$$(selector);
			for (const handle of handles) {
				const ok = await handle.evaluate((el, mustBeVisible) => {
					if (
						!(
							el instanceof HTMLInputElement ||
							el instanceof HTMLSelectElement ||
							el instanceof HTMLTextAreaElement
						)
					) {
						return false;
					}
					if (el instanceof HTMLInputElement && el.type === "hidden") {
						return false;
					}
					if (mustBeVisible) {
						const style = getComputedStyle(el);
						if (
							style.display === "none" ||
							style.visibility === "hidden" ||
							Number(style.opacity) === 0
						) {
							return false;
						}
						const rect = el.getBoundingClientRect();
						if (rect.width < 1 || rect.height < 1) {
							return false;
						}
					}
					el.scrollIntoView({ block: "center", inline: "nearest" });
					return true;
				}, requireVisible);
				if (ok) {
					return handle;
				}
				await handle.dispose();
			}
		}

		return null;
	}

	private async dumpFormInventory(page: Page): Promise<string> {
		const script = `(() => {
			const root =
				document.querySelector("#groupcontainer") ||
				document.querySelector("#htmlOutput") ||
				document.body;
			const rows = Array.from(root.querySelectorAll("input, select, textarea"))
				.slice(0, 80)
				.map((el) => {
					const style = getComputedStyle(el);
					const rect = el.getBoundingClientRect();
					const visible =
						style.display !== "none" &&
						style.visibility !== "hidden" &&
						rect.width > 0 &&
						rect.height > 0;
					return [
						el.tagName.toLowerCase(),
						"id=" + (el.id || "-"),
						"type=" + (el.type || "-"),
						"view-model=" + (el.getAttribute("view-model") || "-"),
						"paneldinamico=" + (el.getAttribute("paneldinamico") || "-"),
						"visible=" + visible,
					].join(" | ");
				});
			return ["url=" + location.href, "controls=" + rows.length].concat(rows).join("\\n");
		})()`;

		return page.evaluate(script) as Promise<string>;
	}

	/**
	 * Rellena sin depender de click nativo (evita "Node is either not clickable").
	 */
	private async setInputValue(
		element: ElementHandle<Element>,
		value: string,
		options: { typeKeys?: boolean } = {},
	): Promise<void> {
		if (options.typeKeys) {
			await element.evaluate((el) => {
				if (
					el instanceof HTMLInputElement ||
					el instanceof HTMLTextAreaElement
				) {
					el.focus();
					el.value = "";
					el.dispatchEvent(new Event("input", { bubbles: true }));
				}
			});
			try {
				await element.click({ delay: 20 });
			} catch {
				await element.evaluate((el) => {
					if (el instanceof HTMLElement) {
						el.focus();
					}
				});
			}
			await element.type(value, { delay: 25 });
			await element.evaluate((el) => {
				el.dispatchEvent(new Event("input", { bubbles: true }));
				el.dispatchEvent(new Event("change", { bubbles: true }));
				el.dispatchEvent(new Event("blur", { bubbles: true }));
			});
			return;
		}

		await element.evaluate((el, val) => {
			if (
				!(
					el instanceof HTMLInputElement ||
					el instanceof HTMLTextAreaElement ||
					el instanceof HTMLSelectElement
				)
			) {
				return;
			}
			el.focus();
			el.value = val;
			el.dispatchEvent(new Event("input", { bubbles: true }));
			el.dispatchEvent(new Event("change", { bubbles: true }));
			el.dispatchEvent(new Event("blur", { bubbles: true }));
		}, value);
	}

	private async clearAndType(
		element: ElementHandle<Element>,
		value: string,
	): Promise<void> {
		await this.setInputValue(element, value, { typeKeys: true });
	}

	private wrapError(step: string, error: unknown): Error {
		const message = error instanceof Error ? error.message : String(error);
		return new Error(`Error en ${step}: ${message}`);
	}
}
