export interface SatEnvConfig {
	/** Opcional: solo si se usa login CIEC (ya no es el flujo por defecto). */
	rfc?: string;
	password?: string;
	efirmaCerPath: string;
	efirmaKeyPath: string;
	efirmaPassword: string;
	outputBillingPath: string;
}

function requireEnv(name: string): string {
	const value = process.env[name]?.trim();

	if (!value) {
		throw new Error(`Variable de entorno requerida ausente o vacía: ${name}`);
	}

	return value;
}

function optionalEnv(name: string): string | undefined {
	const value = process.env[name]?.trim();
	return value || undefined;
}

function assertFileExtension(
	path: string,
	extension: string,
	envName: string,
): void {
	const normalized = path.toLowerCase();

	if (!normalized.endsWith(extension)) {
		throw new Error(
			`${envName} debe ser una ruta completa a un archivo ${extension}, recibido: ${path}`,
		);
	}
}

export function loadSatEnv(): SatEnvConfig {
	const efirmaCerPath = requireEnv("SAT_EFIRMA_CER_PATH");
	const efirmaKeyPath = requireEnv("SAT_EFIRMA_KEY_PATH");

	assertFileExtension(efirmaCerPath, ".cer", "SAT_EFIRMA_CER_PATH");
	assertFileExtension(efirmaKeyPath, ".key", "SAT_EFIRMA_KEY_PATH");

	return {
		rfc: optionalEnv("SAT_RFC"),
		password: optionalEnv("SAT_PASSWORD"),
		efirmaCerPath,
		efirmaKeyPath,
		efirmaPassword: requireEnv("SAT_EFIRMA_PASSWORD"),
		outputBillingPath: requireEnv("OUTPUT_BILLING_PATH"),
	};
}
