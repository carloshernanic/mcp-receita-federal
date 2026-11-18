// Ferramentas da calculadora RTC do Simples Nacional e explicação de códigos de erro.
// Repositório: https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { chamarTexto, seg, texto, urlBase } from "./http.js";
import { baseRegimeGeral, data, ENV_REGIME_GERAL } from "./regime-geral.js";

const ENV = "RTC_SIMPLES_URL";
const semUrl = texto(
  `A calculadora do Simples Nacional não tem versão online conhecida. Rode-a localmente ` +
    `(https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional) e defina ${ENV}, ex.: http://localhost:8082/api`,
  true,
);
const base = () => {
  const b = urlBase(ENV);
  return b && `${b}/calculadora`;
};

const decimal = z.string().regex(/^-?\d+(\.\d+)?$/, "decimal como string, ex.: 950.00");
const item = z.looseObject({
  numero: z.number().int(),
  cAtivSN: z.string().optional().describe("Código da atividade do Simples (2 caracteres, ex.: 01). Ver sn_atividades"),
  cClassTrib: z.string().describe("cClassTrib (6 dígitos), obrigatório"),
  baseCalculo: decimal.describe("vProd + vFrete + vSeg + vOutro - vDesc, sem o IS"),
  valorImpostoSeletivo: decimal.default("0.00"),
  pIBSSN: decimal.optional().describe("Alíquota efetiva do IBS no Simples (pontos percentuais)"),
  pCBSSN: decimal.optional().describe("Alíquota efetiva da CBS no Simples (pontos percentuais)"),
});
const operacao = z.looseObject({
  id: z.string(),
  versao: z.string().default("2.0.0"),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Data do fato gerador (AAAA-MM-DD)"),
  tpDoc: z.string().describe("Tipo de documento: 55 (NF-e) ou 65 (NFC-e)"),
  CRT: z.string().describe("1 Simples, 2 Simples com excesso de sublimite, 3 Regime Normal (com tpRegimeIBSCBS=2)"),
  tpRegimeIBSCBS: z.string().optional(),
  tpEnteGov: z.string().optional().describe("Compra governamental: 1 União, 2 Estado, 3 DF, 4 Município"),
  itens: z.array(item).min(1),
});

const ro = { readOnlyHint: true, openWorldHint: true };
const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

export function registrarSimples(server: McpServer) {
  server.registerTool(
    "sn_calcular",
    {
      title: "Calcular CBS e IBS no Simples Nacional",
      description:
        `Calcula CBS e IBS de uma operação do Simples Nacional (NT 2026.005), item a item. Requer ${ENV} (instalação local).`,
      inputSchema: { operacao },
      annotations: ro,
    },
    async ({ operacao }) => {
      const b = base();
      if (!b) return semUrl;
      return chamarTexto(b, ENV, "/observabilidade/simples-nacional", {
        method: "POST",
        body: JSON.stringify(operacao),
        contentType: "application/json",
      });
    },
  );

  server.registerTool(
    "sn_atividades",
    {
      title: "Atividades do Simples Nacional",
      description: `Lista as atividades do Simples vigentes na data, ou detalha uma pelo código. Requer ${ENV}.`,
      inputSchema: {
        codigo: z.string().regex(/^[A-Za-z0-9]{1,4}$/).optional().describe("Código da atividade (cAtivSN); omita para listar"),
        data,
        anexos: z.string().optional().describe("Filtro por anexos, separados por vírgula"),
        tpDoc: z.string().optional(),
        cClassTrib: z.string().optional(),
      },
      annotations: ro,
    },
    async ({ codigo, data, anexos, tpDoc, cClassTrib }) => {
      const b = base();
      if (!b) return semUrl;
      const caminho = codigo ? `/simples-nacional/atividades/${seg(codigo)}` : "/simples-nacional/atividades";
      return chamarTexto(b, ENV, caminho, {
        query: { data: data ?? hoje(), tpDoc, cClassTrib, ...(codigo ? {} : { anexos }) },
      });
    },
  );

  server.registerTool(
    "rtc_explicar_erro",
    {
      title: "Explicar código de erro",
      description: "Explica um código de erro da calculadora: REG-xxx (regime geral) ou VSN-xxx (Simples Nacional).",
      inputSchema: { codigo: z.string().regex(/^(REG|VSN)-\d{3}$/i, "formato REG-011 ou VSN-001") },
      annotations: ro,
    },
    async ({ codigo }) => {
      const c = codigo.toUpperCase();
      if (c.startsWith("REG")) {
        return chamarTexto(baseRegimeGeral(), ENV_REGIME_GERAL, "/observabilidade/erros", { query: { codigo: c } });
      }
      const b = base();
      if (!b) return semUrl;
      return chamarTexto(b, ENV, "/observabilidade/simples-nacional/erros", { query: { codigo: c } });
    },
  );
}
