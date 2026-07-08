import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Cliente } from "../../domain/entities/Cliente.js";
import type { IClienteRepository } from "../../domain/ports/cliente-repository.port.js";

interface ClientesFile {
	clientes: Cliente[];
}

const CLIENTES_PATH = join(process.cwd(), "data", "clientes.json");

export class JsonClienteRepository implements IClienteRepository {
	async obtenerTodos(): Promise<Cliente[]> {
		const raw = await readFile(CLIENTES_PATH, "utf-8");
		const data = JSON.parse(raw) as ClientesFile;

		return data.clientes;
	}

	async obtenerPorId(id: string): Promise<Cliente | null> {
		const clientes = await this.obtenerTodos();

		return clientes.find((c) => c.id === id) ?? null;
	}
}
