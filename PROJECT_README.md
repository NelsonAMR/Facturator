# CLI de Facturación Automatizada para RESICO

## 📌 1. Visión General
Herramienta de línea de comandos (CLI) local desarrollada en Node.js y TypeScript para automatizar la generación, cálculo de tipo de cambio y timbrado de facturas CFDI 4.0 para el régimen RESICO en México (soportando clientes extranjeros con IVA 0% y clientes nacionales con retenciones).

## 🛠️ 2. Stack Tecnológico
- **Runtime:** Node.js (v24+)
- **Lenguaje:** TypeScript
- **Manejador de Paquetes:** PNPM
- **Entorno de Desarrollo (Runner):** `tsx` (Ejecución nativa y ultra rápida de TS sin compilar)
- **Compilador/Bundler (Producción):** `tsup` (Basado en esbuild, empaqueta a JS puro sin configuración)
- **CLI Framework:** `commander` (Flags) + `@clack/prompts` (Modo Interactivo)
- **Automatización:** Puppeteer
- **Almacenamiento:** Sistema de archivos local (JSON para logs + carpetas organizadas por Año/Mes)

## 📐 3. Arquitectura (Clean Architecture + Adapter Pattern)
El sistema está desacoplado para permitir migrar a un SaaS o a una API de pago (como Facturapi/PAC) en el futuro sin reescribir la lógica de negocio.
- **Domain:** Entidades puras (Cliente, Factura) y contratos de puertos (`IBillingAdapter`).
- **Infrastructure:** Implementaciones técnicas (Puppeteer, FileSystem, API Banxico).

## 📊 4. Flujo de Datos y Negocio
1. Selección de cliente (Modo interactivo o mediante `--client <id>`).
2. Consulta automática del Tipo de Cambio (TC) del día en Banxico/DOF.
3. Conversión matemática: $Subtotal_{MXN} = Monto_{USD} \times TC$.
4. Aplicación de reglas fiscales RESICO Extranjero (IVA 0%, Retención ISR 0%).
5. Inyección de credenciales (.env) en el portal del SAT mediante Puppeteer.
6. Confirmación visual previa al timbrado.
7. Descarga y registro local en `data/facturas.json`.