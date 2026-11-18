// Chamadas HTTP às APIs da Receita e formatação das respostas para o MCP.

const TIMEOUT_MS = Number(process.env.RTC_TIMEOUT_MS) || 30_000;
const MAX_CHARS = Number(process.env.RTC_MAX_CHARS) || 60_000;

export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

type Query = Record<string, string | number | boolean | undefined>;

/** Lê a URL base de uma variável de ambiente, sem barra no final. */
export function urlBase(envVar: string, padrao?: string): string | undefined {
  const valor = process.env[envVar]?.trim() || padrao;
  return valor ? valor.replace(/\/+$/, "") : undefined;
}

export function texto(text: string, isError = false): ToolResult {
  return { content: [{ type: "text", text }], ...(isError ? { isError } : {}) };
}

function cortar(s: string, limite = MAX_CHARS): string {
  if (s.length <= limite) return s;
  return `${s.slice(0, limite)}\n\n[resposta cortada: ${s.length} caracteres no total, mostrando ${limite}. Use filtros mais específicos.]`;
}

/** Codifica um valor informado pelo usuário para uso como segmento de caminho. */
export const seg = (v: string) => encodeURIComponent(v.trim());

export async function chamar(
  base: string,
  caminho: string,
  opts: { query?: Query; method?: "GET" | "POST"; body?: string; contentType?: string } = {},
): Promise<Response> {
  const url = new URL(base + caminho);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  return fetch(url, {
    method: opts.method ?? "GET",
    headers: opts.contentType ? { "Content-Type": opts.contentType } : undefined,
    body: opts.body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

function erroDeRede(e: unknown, base: string, envVar: string): ToolResult {
  const motivo =
    e instanceof Error && e.name === "TimeoutError"
      ? `tempo esgotado (${TIMEOUT_MS} ms)`
      : e instanceof Error
        ? (e.cause instanceof Error ? e.cause.message : e.message)
        : String(e);
  return texto(`Não foi possível acessar ${base}: ${motivo}. Confira se a API está no ar e a variável ${envVar}.`, true);
}

/** Faz a chamada e devolve o corpo como texto (JSON formatado quando possível). */
export async function chamarTexto(
  base: string,
  envVar: string,
  caminho: string,
  opts: Parameters<typeof chamar>[2] = {},
): Promise<ToolResult> {
  let res: Response;
  try {
    res = await chamar(base, caminho, opts);
  } catch (e) {
    return erroDeRede(e, base, envVar);
  }
  const corpo = await res.text();
  if (!res.ok) {
    const msg = res.status === 404 ? "não encontrado (verifique o código e a data de vigência)" : "erro";
    return texto(`HTTP ${res.status} — ${msg}\n${cortar(corpo, 4_000)}`, true);
  }
  const aviso = res.headers.get("x-warning-dados-simulados");
  let saida = corpo;
  try {
    saida = JSON.stringify(JSON.parse(corpo), null, 2);
  } catch {
    // não é JSON (ex.: XML); devolve como veio
  }
  return texto((aviso ? `Aviso da API (dados simulados): ${aviso}\n\n` : "") + cortar(saida));
}

export { erroDeRede };
