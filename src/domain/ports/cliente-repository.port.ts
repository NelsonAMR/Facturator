import type { Cliente } from "../entities/Cliente.js";

export interface IClienteRepository {
	obtenerTodos(): Promise<Cliente[]>;
	obtenerPorId(id: string): Promise<Cliente | null>;
}
