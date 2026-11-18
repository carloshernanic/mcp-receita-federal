#!/usr/bin/env node
// Servidor MCP (stdio) para as calculadoras open source da Receita Federal.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registrarDanfse } from "./danfse.js";
import { registrarRegimeGeral } from "./regime-geral.js";
import { registrarSimples } from "./simples.js";

const server = new McpServer({ name: "mcp-receita-federal", version: "0.1.0" });
registrarRegimeGeral(server);
registrarSimples(server);
registrarDanfse(server);

await server.connect(new StdioServerTransport());
