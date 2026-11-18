// Ferramenta do gerador de DANFSe (PDF da NFS-e).
// Repositório: https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse
import { readFile, stat, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { chamar, erroDeRede, texto, urlBase } from "./http.js";

const ENV = "RTC_DANFSE_URL";
const MAX_XML = 5 * 1024 * 1024; // mesmo limite padrão do serviço

export function registrarDanfse(server: McpServer) {
  server.registerTool(
    "danfse_gerar_pdf",
    {
      title: "Gerar DANFSe (PDF) a partir do XML da NFS-e",
      description:
        `Envia o XML de uma NFS-e ao gerador de DANFSe e salva o PDF no caminho indicado. ` +
        `Informe o XML pelo texto (xml) ou por um arquivo local (arquivoXml). Requer ${ENV} (ex.: http://localhost:8080/api).`,
      inputSchema: {
        xml: z.string().optional().describe("Conteúdo do XML da NFS-e"),
        arquivoXml: z.string().optional().describe("Caminho de um arquivo .xml local"),
        arquivoPdf: z.string().describe("Caminho onde salvar o PDF (deve terminar em .pdf)"),
        situacao: z.enum(["0", "1", "2"]).optional().describe("0 válida, 1 substituída, 2 cancelada"),
        canhoto: z.boolean().default(true),
        sobrescrever: z.boolean().default(false).describe("Permite substituir um PDF que já existe"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ xml, arquivoXml, arquivoPdf, situacao, canhoto, sobrescrever }) => {
      const base = urlBase(ENV);
      if (!base) {
        return texto(
          `O gerador de DANFSe não tem versão online conhecida. Rode-o localmente ` +
            `(https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse) e defina ${ENV}, ex.: http://localhost:8080/api`,
          true,
        );
      }
      if (!xml === !arquivoXml) return texto("Informe exatamente um dos campos: xml ou arquivoXml.", true);

      const destino = resolve(arquivoPdf);
      if (extname(destino).toLowerCase() !== ".pdf") return texto("arquivoPdf deve terminar em .pdf.", true);
      if (!sobrescrever && (await stat(destino).catch(() => null))) {
        return texto(`${destino} já existe. Use sobrescrever: true para substituir.`, true);
      }

      let corpo: Buffer;
      try {
        if (arquivoXml) {
          const origem = resolve(arquivoXml);
          const info = await stat(origem);
          if (info.size > MAX_XML) return texto(`XML maior que ${MAX_XML} bytes.`, true);
          corpo = await readFile(origem);
        } else {
          corpo = Buffer.from(xml!, "utf8");
          if (corpo.length > MAX_XML) return texto(`XML maior que ${MAX_XML} bytes.`, true);
        }
      } catch (e) {
        return texto(`Não foi possível ler o XML: ${(e as Error).message}`, true);
      }

      let res: Response;
      try {
        res = await chamar(base, "/danfse", {
          method: "POST",
          query: { stc: situacao, canhoto },
          body: corpo.toString("utf8"),
          contentType: "application/xml",
        });
      } catch (e) {
        return erroDeRede(e, base, ENV);
      }
      if (!res.ok) return texto(`HTTP ${res.status}\n${(await res.text()).slice(0, 4_000)}`, true);

      const pdf = Buffer.from(await res.arrayBuffer());
      if (pdf.subarray(0, 5).toString() !== "%PDF-") return texto("A resposta do serviço não é um PDF.", true);
      try {
        await writeFile(destino, pdf, { flag: sobrescrever ? "w" : "wx" });
      } catch (e) {
        return texto(`Não foi possível salvar o PDF: ${(e as Error).message}`, true);
      }
      return texto(`PDF salvo em ${destino} (${pdf.length} bytes).`);
    },
  );
}
