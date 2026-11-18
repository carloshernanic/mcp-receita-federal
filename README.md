# mcp-receita-federal

Servidor MCP que dá a assistentes de IA (Claude etc.) acesso às calculadoras open source da Reforma Tributária do Consumo publicadas pela [Receita Federal](https://github.com/ReceitaFederal):

| Repositório | O que o MCP faz | Onde roda |
|---|---|---|
| [calculadora-rtc-regime-regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular) | Calcula CBS, IBS e IS; consulta NCM, NBS, cClassTrib, alíquotas; gera e valida XML | API piloto pública (padrão) ou local |
| [calculadora-rtc-simples-nacional](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional) | Calcula CBS e IBS no Simples; lista atividades | Só local |
| [calculadora-rtc-gerador-danfse](https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse) | Gera o PDF do DANFSe a partir do XML da NFS-e | Só local |

Sem a variável de ambiente, as ferramentas do Simples e do DANFSe respondem com instruções de como configurar.

> Projeto independente, sem vínculo com a Receita Federal. Os resultados da API piloto são simulações; confira antes de usar em documento fiscal.

## Ferramentas

- `rtc_calcular_tributos` — cálculo do regime geral (`modo`: `observabilidade` ou `estrito`)
- `rtc_base_calculo` — base de cálculo unificada (NF-e/NFC-e ou NFS-e)
- `rtc_gerar_xml`, `rtc_validar_xml` — XML do grupo de tributação e validação no XSD
- `rtc_consultar_ncm`, `rtc_consultar_nbs`, `rtc_consultar_classificacao`, `rtc_validar_aplicabilidade`, `rtc_consultar_aliquota`
- `rtc_dados_abertos` — GET em qualquer rota de `/dados-abertos` (CSTs, fundamentações legais, municípios...)
- `rtc_explicar_erro` — explica códigos `REG-xxx` e `VSN-xxx`
- `sn_calcular`, `sn_atividades` — Simples Nacional
- `danfse_gerar_pdf` — salva o PDF do DANFSe (não sobrescreve arquivo existente sem `sobrescrever: true`)

## Como rodar

Requer Node 20+.

```powershell
npm install
npm run build
```

Teste rápido contra a API piloto (sobe o servidor e chama as ferramentas):

```powershell
npm run smoke
```

### No Claude Code

```powershell
claude mcp add receita-federal -- node C:\dev\pessoal\mcp-receita-federal\dist\index.js
```

### No Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "receita-federal": {
      "command": "node",
      "args": ["C:\\dev\\pessoal\\mcp-receita-federal\\dist\\index.js"],
      "env": { "RTC_SIMPLES_URL": "http://localhost:8082/api" }
    }
  }
}
```

## Variáveis de ambiente

| Variável | Padrão | Para quê |
|---|---|---|
| `RTC_API_URL` | `https://piloto-cbs.tributos.gov.br/servico/calculadora-consumo/api` | Calculadora do regime geral (troque por `http://localhost:8080/api` se rodar local) |
| `RTC_SIMPLES_URL` | — | Calculadora do Simples Nacional local, até `/api` |
| `RTC_DANFSE_URL` | — | Gerador de DANFSe local, até `/api` |
| `RTC_TIMEOUT_MS` | `30000` | Tempo máximo de cada chamada |
| `RTC_MAX_CHARS` | `60000` | Tamanho máximo da resposta devolvida ao modelo (listas grandes são cortadas) |

Para rodar as APIs locais, siga o README de cada repositório (Java 21 para as calculadoras, Go ou Docker para o DANFSe). Atenção: o DANFSe e o regime geral usam a porta 8080 por padrão; mude uma delas (`SERVER_PORT` no DANFSe).
