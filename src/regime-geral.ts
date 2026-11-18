// Ferramentas da calculadora RTC do regime geral (CBS, IBS e Imposto Seletivo).
// Repositório: https://github.com/ReceitaFederal/calculadora-rtc-regime-regular
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { chamarTexto, seg, texto, urlBase } from "./http.js";

const ENV = "RTC_API_URL";
const PILOTO = "https://piloto-cbs.tributos.gov.br/servico/calculadora-consumo/api";
const base = () => `${urlBase(ENV, PILOTO)}/calculadora`;

const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
export const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD")
  .optional()
  .describe("Data de vigência (AAAA-MM-DD). Padrão: hoje.");
const codigo = (nome: string, digitos: string) =>
  z.string().regex(new RegExp(`^\\d{${digitos}}$`), `${nome} deve ter ${digitos} dígitos`);

const item = z.looseObject({
  numero: z.number().int().describe("Número do item"),
  ncm: z.string().optional().describe("NCM (8 dígitos) para mercadorias"),
  nbs: z.string().optional().describe("NBS (9 dígitos) para serviços"),
  cst: z.string().describe("CST do IBS/CBS (3 dígitos), ex.: 000, 200"),
  cClassTrib: z.string().describe("Classificação tributária (6 dígitos), ex.: 000001"),
  baseCalculo: z.number().optional(),
  quantidade: z.number().optional(),
  unidade: z.string().optional(),
  impostoSeletivo: z.looseObject({}).optional().describe("Grupo do IS: cst, cClassTrib, baseCalculo, quantidade, unidade, impostoInformado"),
  aliquotasNominais: z
    .looseObject({})
    .optional()
    .describe("Obrigatório a partir de 2027 e proibido antes: { cbs, ibsEstadual, ibsMunicipal, impostoSeletivo?: { adValorem } }"),
});

const operacao = z.looseObject({
  id: z.string().describe("Identificador livre da operação"),
  versao: z.string().default("1.0.0"),
  dhFatoGerador: z.string().describe("Data/hora do fato gerador ISO 8601, ex.: 2027-03-10T10:00:00-03:00"),
  municipio: z.number().int().describe("Código IBGE do município (7 dígitos)"),
  uf: z.string().length(2).optional(),
  itens: z.array(item).min(1),
});

const ro = { readOnlyHint: true, openWorldHint: true };

export function registrarRegimeGeral(server: McpServer) {
  server.registerTool(
    "rtc_calcular_tributos",
    {
      title: "Calcular CBS, IBS e IS (regime geral)",
      description:
        "Calcula CBS, IBS e Imposto Seletivo de uma operação do regime geral (LC 214/2025). " +
        "modo 'observabilidade' (padrão) calcula item a item e reporta erros por item em estadoItem; " +
        "modo 'estrito' falha a operação inteira no primeiro erro e devolve o resultado usado por rtc_gerar_xml.",
      inputSchema: { operacao, modo: z.enum(["observabilidade", "estrito"]).default("observabilidade") },
      annotations: ro,
    },
    ({ operacao, modo }) =>
      chamarTexto(base(), ENV, modo === "estrito" ? "/regime-geral" : "/observabilidade/regime-geral", {
        method: "POST",
        body: JSON.stringify(operacao),
        contentType: "application/json",
      }),
  );

  server.registerTool(
    "rtc_base_calculo",
    {
      title: "Base de cálculo unificada",
      description:
        "Calcula a base de cálculo unificada (baseRG, baseIS, baseSN) aplicando a vigência de cada componente ao ano. " +
        "documento 'nfe': { anoFatoGerador, tipoDocumento: 55|65, natureza: 'bem'|'servico', vProd, vFrete, vSeg, vOutro, vDesc, vIS, vPIS, vCOFINS, vICMS, vFCP }. " +
        "documento 'nfse': { anoFatoGerador, opSimpNac, situacao, vServ, vDescIncond, vISSQN, vPIS, vCOFINS, ... }.",
      inputSchema: {
        documento: z.enum(["nfe", "nfse"]).default("nfe"),
        dados: z.looseObject({ anoFatoGerador: z.number().int() }),
      },
      annotations: ro,
    },
    ({ documento, dados }) =>
      chamarTexto(
        base(),
        ENV,
        documento === "nfse" ? "/base-calculo/base-calculo-unificada-nfse" : "/base-calculo/base-calculo-unificada",
        { method: "POST", body: JSON.stringify(dados), contentType: "application/json" },
      ),
  );

  server.registerTool(
    "rtc_gerar_xml",
    {
      title: "Gerar XML do grupo de tributação",
      description: "Gera o XML dos grupos de tributação a partir do resultado de rtc_calcular_tributos no modo 'estrito'.",
      inputSchema: {
        resultado: z.looseObject({}).describe("Resposta JSON completa do cálculo no modo estrito"),
        tipo: z.enum(["nfe", "nfce", "cte", "cte-simplificado", "bpe", "bpe-tm", "nf3e"]).default("nfe"),
      },
      annotations: ro,
    },
    ({ resultado, tipo }) =>
      chamarTexto(base(), ENV, "/xml/generate", {
        method: "POST",
        query: { tipo },
        body: JSON.stringify(resultado),
        contentType: "application/json",
      }),
  );

  server.registerTool(
    "rtc_validar_xml",
    {
      title: "Validar XML contra o XSD",
      description: "Valida um XML (só o grupo de tributação ou a nota completa) contra o XSD oficial. Retorna true ou o erro com linha e coluna.",
      inputSchema: {
        xml: z.string().min(1).max(5_000_000),
        tipo: z.enum(["nfe", "nfce", "nfse", "cte", "cte-simplificado", "bpe", "bpe-tm", "nf3e"]).default("nfe"),
        subtipo: z.enum(["grupo", "nota"]).default("grupo"),
      },
      annotations: ro,
    },
    ({ xml, tipo, subtipo }) =>
      chamarTexto(base(), ENV, "/xml/validate", {
        method: "POST",
        query: { tipo, subtipo },
        body: xml,
        contentType: "application/xml",
      }),
  );

  server.registerTool(
    "rtc_consultar_ncm",
    {
      title: "Consultar NCM",
      description: "Consulta uma NCM: capítulo, descrição e se é tributada pelo Imposto Seletivo (alíquotas ad valorem/ad rem).",
      inputSchema: { ncm: codigo("NCM", "8"), data },
      annotations: ro,
    },
    ({ ncm, data }) => chamarTexto(base(), ENV, "/dados-abertos/ncm", { query: { ncm, data: data ?? hoje() } }),
  );

  server.registerTool(
    "rtc_consultar_nbs",
    {
      title: "Consultar NBS",
      description: "Consulta um código NBS (serviços) vigente na data.",
      inputSchema: { nbs: codigo("NBS", "9"), data },
      annotations: ro,
    },
    ({ nbs, data }) => chamarTexto(base(), ENV, "/dados-abertos/nbs", { query: { nbs, data: data ?? hoje() } }),
  );

  server.registerTool(
    "rtc_consultar_classificacao",
    {
      title: "Consultar classificação tributária (cClassTrib)",
      description: "Detalha uma cClassTrib: descrição, CST, percentuais de redução, fundamentação legal e documentos aceitos.",
      inputSchema: { cClassTrib: codigo("cClassTrib", "6"), tributo: z.enum(["cbs-ibs", "is"]).default("cbs-ibs"), data },
      annotations: ro,
    },
    ({ cClassTrib, tributo, data }) =>
      chamarTexto(base(), ENV, `/dados-abertos/classificacoes-tributarias/${tributo}/class-trib/${seg(cClassTrib)}`, {
        query: { data: data ?? hoje() },
      }),
  );

  server.registerTool(
    "rtc_validar_aplicabilidade",
    {
      title: "NCM/NBS aceita na cClassTrib?",
      description: "Verifica se uma NCM ou NBS pode ser usada com a cClassTrib na data do fato gerador. Informe ncm ou nbs.",
      inputSchema: { cClassTrib: codigo("cClassTrib", "6"), ncm: codigo("NCM", "8").optional(), nbs: codigo("NBS", "9").optional(), data },
      annotations: ro,
    },
    ({ cClassTrib, ncm, nbs, data }) => {
      if (!ncm === !nbs) return texto("Informe exatamente um dos campos: ncm ou nbs.", true);
      const tipo = ncm ? "ncm" : "nbs";
      return chamarTexto(base(), ENV, `/dados-abertos/classificacoes-tributarias/${tipo}-aplicavel`, {
        query: { cClassTrib, [tipo]: ncm ?? nbs, dataOcorrenciaFatoGerador: data ?? hoje() },
      });
    },
  );

  server.registerTool(
    "rtc_consultar_aliquota",
    {
      title: "Alíquota de referência",
      description:
        "Alíquota de referência da União (CBS), de uma UF ou de um município (IBS). " +
        "Só existem para 2026; a partir de 2027 a API retorna 404 e as alíquotas devem ir em aliquotasNominais.",
      inputSchema: {
        esfera: z.enum(["uniao", "uf", "municipio"]),
        codigoIbge: z.number().int().optional().describe("Código IBGE da UF (2 dígitos) ou do município (7 dígitos)"),
        data,
      },
      annotations: ro,
    },
    ({ esfera, codigoIbge, data }) => {
      if (esfera !== "uniao" && codigoIbge === undefined) return texto("Informe codigoIbge para UF ou município.", true);
      const chave = esfera === "uf" ? "codigoUf" : "codigoMunicipio";
      return chamarTexto(base(), ENV, `/dados-abertos/aliquota-${esfera}`, {
        query: { data: data ?? hoje(), ...(esfera === "uniao" ? {} : { [chave]: codigoIbge }) },
      });
    },
  );

  server.registerTool(
    "rtc_dados_abertos",
    {
      title: "Consulta genérica aos dados abertos",
      description:
        "GET em qualquer rota de /calculadora/dados-abertos. Exemplos de caminho: 'versao', 'ufs', 'ufs/municipios' (siglaUf), " +
        "'situacoes-tributarias/cbs-ibs' (data, siglaDfe), 'situacoes-tributarias/is', 'classificacoes-tributarias/cbs-ibs/{cst}' (data), " +
        "'classificacoes-tributarias/nbs' (nbs, data), 'nbs-aplicaveis' (cClassTrib, data), 'fundamentacoes-legais' (data), " +
        "'dfe/grupos', 'ator/grupos' (data), 'nomenclatura/{siglaDfe}/{cClassTrib}' (data), 'redutores-compra-governamental', " +
        "'transferencias-cbs', 'transferencias-ibs'. Listas grandes podem vir cortadas.",
      inputSchema: {
        caminho: z
          .string()
          .regex(/^[A-Za-z0-9-]+(\/[A-Za-z0-9-]+)*$/, "caminho relativo, só letras, números, '-' e '/'"),
        parametros: z.record(z.string(), z.string()).optional().describe("Query string, ex.: { data: '2027-01-01' }"),
      },
      annotations: ro,
    },
    ({ caminho, parametros }) => chamarTexto(base(), ENV, `/dados-abertos/${caminho}`, { query: parametros }),
  );
}

export { base as baseRegimeGeral, ENV as ENV_REGIME_GERAL };
