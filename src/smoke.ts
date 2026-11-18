// Teste de fumaça: sobe o servidor por stdio e chama as ferramentas contra a API configurada.
// Uso: npm run smoke
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const env = Object.fromEntries(
  Object.entries(process.env).filter(([k, v]) => v !== undefined && !k.startsWith("RTC_SIMPLES") && !k.startsWith("RTC_DANFSE")),
) as Record<string, string>;
const client = new Client({ name: "smoke", version: "0" });
await client.connect(
  new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("./index.js", import.meta.url))], env }),
);

const operacao = {
  id: "smoke-1",
  versao: "1.0.0",
  dhFatoGerador: "2027-03-10T10:00:00-03:00",
  municipio: 4314902,
  uf: "RS",
  itens: [
    {
      numero: 1, ncm: "10063021", cst: "200", cClassTrib: "200003", baseCalculo: 100, quantidade: 20, unidade: "KG",
      aliquotasNominais: { cbs: 8.8, ibsEstadual: 0.05, ibsMunicipal: 0.05 },
    },
    {
      numero: 2, ncm: "02013000", cst: "200", cClassTrib: "200035", baseCalculo: 80,
      aliquotasNominais: { cbs: 8.8, ibsEstadual: 0.05, ibsMunicipal: 0.05 },
    },
  ],
};

// [ferramenta, argumentos, deve dar erro?, trecho esperado na resposta]
const casos: [string, Record<string, unknown>, boolean, string][] = [
  ["rtc_consultar_ncm", { ncm: "22030000", data: "2027-01-01" }, false, "tributadoPeloImpostoSeletivo"],
  ["rtc_consultar_classificacao", { cClassTrib: "200028", data: "2027-01-01" }, false, "200028"],
  ["rtc_validar_aplicabilidade", { cClassTrib: "200003", ncm: "10063021", data: "2027-01-01" }, false, "\"valido\": true"],
  ["rtc_consultar_aliquota", { esfera: "uf", codigoIbge: 43, data: "2026-06-01" }, false, "aliquotaReferencia"],
  ["rtc_dados_abertos", { caminho: "versao" }, false, "versaoApp"],
  ["rtc_dados_abertos", { caminho: "../../etc" }, true, "caminho relativo"],
  ["rtc_explicar_erro", { codigo: "REG-011" }, false, "NCM não vinculada"],
  ["rtc_calcular_tributos", { operacao }, false, "INCONSISTENCIA_ENTRADA"],
  ["rtc_base_calculo", { dados: { anoFatoGerador: 2027, tipoDocumento: 55, natureza: "bem", vProd: 1000, vDesc: 50 } }, false, "baseRG"],
  ["sn_atividades", {}, true, "RTC_SIMPLES_URL"],
  ["danfse_gerar_pdf", { xml: "<x/>", arquivoPdf: "a.pdf" }, true, "RTC_DANFSE_URL"],
];

const { tools } = await client.listTools();
console.log(`${tools.length} ferramentas: ${tools.map((t) => t.name).join(", ")}\n`);

let falhas = 0;
for (const [nome, args, esperaErro, trecho] of casos) {
  let saida: string;
  let deuErro: boolean;
  try {
    const r = await client.callTool({ name: nome, arguments: args });
    saida = (r.content as { text: string }[]).map((c) => c.text).join("\n");
    deuErro = Boolean(r.isError);
  } catch (e) {
    saida = (e as Error).message;
    deuErro = true;
  }
  const ok = deuErro === esperaErro && saida.includes(trecho);
  if (!ok) falhas++;
  console.log(`${ok ? "OK  " : "FALHOU"} ${nome} ${JSON.stringify(args).slice(0, 60)}`);
  if (!ok) console.log(`   ${saida.slice(0, 500)}`);
}

// Fluxo encadeado: cálculo estrito -> gerar XML -> validar XML
const texto = (r: Awaited<ReturnType<typeof client.callTool>>) => (r.content as { text: string }[])[0].text;
const umItem = { ...operacao, itens: [operacao.itens[0]] };
const calc = await client.callTool({ name: "rtc_calcular_tributos", arguments: { operacao: umItem, modo: "estrito" } });
const json = texto(calc).replace(/^Aviso da API[^\n]*\n\n/, "");
const xml = await client.callTool({ name: "rtc_gerar_xml", arguments: { resultado: JSON.parse(json) } });
const valida = await client.callTool({ name: "rtc_validar_xml", arguments: { xml: texto(xml) } });
const fluxoOk = !calc.isError && !xml.isError && !valida.isError && texto(valida).trim() === "true";
if (!fluxoOk) falhas++;
console.log(`${fluxoOk ? "OK  " : "FALHOU"} fluxo calcular(estrito) -> gerar_xml -> validar_xml`);
if (!fluxoOk) console.log(`   ${[calc, xml, valida].map(texto).join("\n---\n").slice(0, 800)}`);

await client.close();
console.log(`\n${casos.length + 1 - falhas}/${casos.length + 1} passaram`);
process.exit(falhas ? 1 : 0);
