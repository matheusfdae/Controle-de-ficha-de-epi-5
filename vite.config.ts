import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { enviarComo, iniciarLogin, renovarAcesso, verificarLogin } from "./supabase/functions/_shared/microsoft";
import { EMAIL, montarEmail } from "./supabase/functions/_shared/emailConvocacao";
import { calcularEstoque, estadosDoRelatorio, montarEmailEstoque, montarEmailReposicao } from "./supabase/functions/_shared/relatorioEstoque";
import { calcularPendentes, montarEmailPendentes } from "./supabase/functions/_shared/relatorioPendentes";
import { montarEmailIntegracao, normalizarPessoas } from "./supabase/functions/_shared/emailIntegracao";
import { ErroAssistente, normalizarConversa, perguntarAssistente } from "./supabase/functions/_shared/assistente";
import {
  agendarEnvios, cancelarLote, ErroWhatsApp, lerLote, listarLotes, numeroWhatsApp, validarEnvios,
} from "./supabase/functions/_shared/whatsapp";
import {
  consultarColaborador, consultarColaboradorPorCpf, cpfValido, escolherCadastro, SeniorError,
  buscarEtapa, postoEscalaDoColaborador, type PedidoEtapa, type SeniorConfig,
} from "./supabase/functions/_shared/senior";

/**
 * Só no `npm run dev`: atende a busca da Senior aqui no PC, sem Edge Function.
 * O IP do PC está liberado na Senior Cloud; o projeto Supabase de dev não está.
 * Credenciais em .env.local (SENIOR_WS_URL, SENIOR_WS_USER, SENIOR_WS_PASSWORD),
 * que não vai para o git nem para o navegador.
 */
/**
 * Só no `npm run dev`: login por código da conta do Microsoft 365 e envio da
 * convocação daqui do PC (modelo delegado, igual à produção). A autorização
 * fica em ms-conta.local (fora do git); MS_CLIENT_SECRET do .env.local só se o
 * app no Azure exigir.
 */
function emailLocal(env: Record<string, string>): Plugin {
  const ARQ = path.resolve(__dirname, "ms-conta.local");
  type Estado = { tenantId?: string; clientId?: string; deviceCode?: string; refreshToken?: string; conta?: string | null; caixa?: string };
  const ler = (): Estado => { try { return JSON.parse(fs.readFileSync(ARQ, "utf8")); } catch { return {}; } };
  const gravar = (e: Estado) => fs.writeFileSync(ARQ, JSON.stringify(e), { mode: 0o600 });
  const app = (e: Estado) => ({ tenantId: e.tenantId!, clientId: e.clientId!, clientSecret: env.MS_CLIENT_SECRET || undefined });
  const lerCorpo = async (req: AsyncIterable<unknown>) => { let t = ""; for await (const p of req) t += p; return JSON.parse(t || "{}"); };
  return {
    name: "email-local",
    apply: "serve",
    configureServer(server) {
      const responder = (res: import("http").ServerResponse, status: number, corpo: unknown) => {
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(corpo));
      };
      server.middlewares.use("/__email/microsoft", async (req, res) => {
        try {
          const { acao, tenant_id, client_id, caixa } = await lerCorpo(req);
          const e = ler();
          if (acao === "status") return responder(res, 200, { conectado: !!e.refreshToken, conta: e.conta ?? null, caixa: e.caixa ?? "", tenant_id: e.tenantId ?? "", client_id: e.clientId ?? "" });
          if (acao === "iniciar") {
            const r = await iniciarLogin({ tenantId: tenant_id, clientId: client_id, clientSecret: env.MS_CLIENT_SECRET || undefined });
            gravar({ ...e, tenantId: tenant_id, clientId: client_id, deviceCode: r.deviceCode, caixa: String(caixa ?? "").trim().toLowerCase() });
            return responder(res, 200, { codigo: r.codigo, url: r.url, expira_em: r.expiraEm, intervalo: r.intervalo });
          }
          if (acao === "verificar") {
            if (!e.deviceCode) return responder(res, 400, { error: "Nenhum login em andamento" });
            const r = await verificarLogin(app(e), e.deviceCode);
            if (r.pendente) return responder(res, 200, { pendente: true });
            gravar({ tenantId: e.tenantId, clientId: e.clientId, caixa: e.caixa, refreshToken: r.refreshToken, conta: r.conta });
            return responder(res, 200, { conectado: true, conta: r.conta });
          }
          if (acao === "desconectar") { gravar({ tenantId: e.tenantId, clientId: e.clientId }); return responder(res, 200, { conectado: false }); }
          responder(res, 400, { error: "Ação inválida" });
        } catch (err) {
          responder(res, 502, { error: err instanceof Error ? err.message : String(err) });
        }
      });
      server.middlewares.use("/__email/enviar-integracao", async (req, res) => {
        try {
          const { destinatarios = [], copia: cc = [], pessoas = [], data, observacao } = await lerCorpo(req);
          const limpa = (l: string[]) => [...new Set(l.map(x => String(x).trim().toLowerCase()))].filter(x => EMAIL.test(x));
          const para = limpa(destinatarios);
          const copia = limpa(cc).filter(x => !para.includes(x));
          if (!para.length) return responder(res, 400, { error: "Informe ao menos um e-mail válido" });
          const lista = normalizarPessoas(pessoas);
          if (!lista.length) return responder(res, 400, { error: "Selecione ao menos um colaborador" });
          const e = ler();
          if (!e.refreshToken) return responder(res, 503, { error: 'Nenhuma conta do Microsoft 365 conectada. Em Configurações > E-mail, clique em "Conectar conta".' });
          const acesso = await renovarAcesso(app(e), e.refreshToken);
          gravar({ ...e, refreshToken: acesso.refreshToken });
          const m = montarEmailIntegracao(lista, { data, observacao });
          await enviarComo(acesso.accessToken, { para, copia, assunto: m.assunto, html: m.html, anexos: [m.anexo] }, e.caixa || null);
          responder(res, 200, { enviado: true, colaboradores: lista.length, destinatarios: para.length, copia: copia.length });
        } catch (err) {
          responder(res, 502, { error: err instanceof Error ? err.message : String(err) });
        }
      });
      // Relatório de estoque: no localhost a tela manda os dados que ela já lê (itens + tamanhos).
      server.middlewares.use("/__email/enviar-relatorio-estoque", async (req, res) => {
        try {
          const { destinatarios = [], copia: cc = [], ufs = [], itens = [], tamanhos = [], minimos = [] } = await lerCorpo(req);
          const limpa = (l: string[]) => [...new Set(l.map(x => String(x).trim().toLowerCase()))].filter(x => EMAIL.test(x));
          const para = limpa(destinatarios);
          const copia = limpa(cc).filter(x => !para.includes(x));
          if (!para.length) return responder(res, 400, { error: "Informe ao menos um e-mail válido" });
          const e = ler();
          if (!e.refreshToken) return responder(res, 503, { error: 'Nenhuma conta do Microsoft 365 conectada. Em Configurações > E-mail, clique em "Conectar conta".' });
          const estados = estadosDoRelatorio(ufs, tamanhos);
          const m = montarEmailEstoque(calcularEstoque(itens, tamanhos, estados, minimos), estados);
          const acesso = await renovarAcesso(app(e), e.refreshToken);
          gravar({ ...e, refreshToken: acesso.refreshToken });
          await enviarComo(acesso.accessToken, { para, copia, assunto: m.assunto, html: m.html, anexos: [m.anexo] }, e.caixa || null);
          responder(res, 200, { enviado: true, itens: m.itens, alerta: m.alerta, destinatarios: para.length, copia: copia.length });
        } catch (err) {
          responder(res, 502, { error: err instanceof Error ? err.message : String(err) });
        }
      });
      // Fichas pendentes (um estado): no localhost a tela manda as fichas, itens e links que ela já lê.
      server.middlewares.use("/__email/enviar-relatorio-pendentes", async (req, res) => {
        try {
          const { destinatarios = [], copia: cc = [], uf = "", fichas = [], itens = [], tokens = [] } = await lerCorpo(req);
          const limpa = (l: string[]) => [...new Set(l.map(x => String(x).trim().toLowerCase()))].filter(x => EMAIL.test(x));
          const para = limpa(destinatarios);
          const copia = limpa(cc).filter(x => !para.includes(x));
          if (!para.length) return responder(res, 400, { error: "Informe ao menos um e-mail válido" });
          const e = ler();
          if (!e.refreshToken) return responder(res, 503, { error: 'Nenhuma conta do Microsoft 365 conectada. Em Configurações > E-mail, clique em "Conectar conta".' });
          const m = montarEmailPendentes(calcularPendentes(fichas, itens, tokens, [uf]), [uf]);
          const acesso = await renovarAcesso(app(e), e.refreshToken);
          gravar({ ...e, refreshToken: acesso.refreshToken });
          await enviarComo(acesso.accessToken, { para, copia, assunto: m.assunto, html: m.html, anexos: [m.anexo] }, e.caixa || null);
          responder(res, 200, { enviado: true, fichas: m.fichas, antigas: m.antigas, sem_itens: m.semItens, destinatarios: para.length, copia: copia.length });
        } catch (err) {
          responder(res, 502, { error: err instanceof Error ? err.message : String(err) });
        }
      });
      // Pedido de reposição: a tela manda os alertas pendentes e marca como enviados depois.
      server.middlewares.use("/__email/enviar-reposicao-estoque", async (req, res) => {
        try {
          const { destinatarios = [], copia: cc = [], alertas = [], itens = [], tamanhos = [], minimos = [] } = await lerCorpo(req);
          const limpa = (l: string[]) => [...new Set(l.map(x => String(x).trim().toLowerCase()))].filter(x => EMAIL.test(x));
          const para = limpa(destinatarios);
          const copia = limpa(cc).filter(x => !para.includes(x));
          if (!para.length) return responder(res, 400, { error: "Informe ao menos um e-mail válido" });
          const ufs = [...new Set(alertas.map((a: { uf: string }) => a.uf))] as string[];
          const linhas = calcularEstoque(itens, tamanhos, ufs, minimos)
            .filter(l => alertas.some((a: { epi_id: string; uf: string }) => a.epi_id === l.item.id && a.uf === l.uf) && l.saldo <= l.minimo);
          if (!linhas.length) return responder(res, 200, { enviado: false, itens: 0, motivo: "os itens já foram repostos" });
          const e = ler();
          if (!e.refreshToken) return responder(res, 503, { error: 'Nenhuma conta do Microsoft 365 conectada. Em Configurações > E-mail, clique em "Conectar conta".' });
          const m = montarEmailReposicao(linhas);
          const acesso = await renovarAcesso(app(e), e.refreshToken);
          gravar({ ...e, refreshToken: acesso.refreshToken });
          await enviarComo(acesso.accessToken, { para, copia, assunto: m.assunto, html: m.html }, e.caixa || null);
          responder(res, 200, { enviado: true, itens: linhas.length, destinatarios: para.length, copia: copia.length });
        } catch (err) {
          responder(res, 502, { error: err instanceof Error ? err.message : String(err) });
        }
      });
      server.middlewares.use("/__email/enviar-convocacao", async (req, res) => {
        try {
          const { destinatarios = [], copia: cc = [], ufs = [], lista = [] } = await lerCorpo(req);
          const para = [...new Set((destinatarios as string[]).map(x => String(x).trim().toLowerCase()))].filter(x => EMAIL.test(x));
          if (!para.length) return responder(res, 400, { error: "Informe ao menos um e-mail válido" });
          const copia = [...new Set((cc as string[]).map(x => String(x).trim().toLowerCase()))].filter(x => EMAIL.test(x) && !para.includes(x));
          const e = ler();
          if (!e.refreshToken) return responder(res, 503, { error: 'Nenhuma conta do Microsoft 365 conectada. Em Configurações > E-mail, clique em "Conectar conta".' });
          const acesso = await renovarAcesso(app(e), e.refreshToken);
          gravar({ ...e, refreshToken: acesso.refreshToken });
          const m = montarEmail(lista, ufs);
          await enviarComo(acesso.accessToken, { para, copia, assunto: m.assunto, html: m.html, anexos: [m.anexo] }, e.caixa || null);
          responder(res, 200, { enviado: true, colaboradores: lista.length, destinatarios: para.length, copia: copia.length });
        } catch (err) {
          responder(res, 502, { error: err instanceof Error ? err.message : String(err) });
        }
      });
    },
  };
}

/**
 * Só no `npm run dev`: convocação pelo WhatsApp agendada no WA-AKG daqui do PC
 * (WAAKG_URL, WAAKG_SESSAO, WAAKG_API_KEY no .env.local). O banco de dev tem
 * fichas reais, então TUDO vai para WAAKG_NUMERO_TESTE (no máximo 3 mensagens);
 * sem esse número, não envia.
 */
function whatsappLocal(env: Record<string, string>): Plugin {
  return {
    name: "whatsapp-local",
    apply: "serve",
    configureServer(server) {
      const { WAAKG_URL: url, WAAKG_SESSAO: sessao, WAAKG_API_KEY: apiKey } = env;
      const conta = { url, sessao, apiKey };
      /** Lê o corpo JSON, chama `fazer` e responde; erros viram { error }. */
      const rota = (caminho: string, fazer: (corpo: any, req: import("http").IncomingMessage) => Promise<unknown>) =>
        server.middlewares.use(caminho, async (req, res) => {
          const responder = (status: number, corpo: unknown) => {
            res.statusCode = status;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify(corpo));
          };
          try {
            if (!url || !sessao || !apiKey) return responder(503, { error: "WhatsApp não configurado no .env.local (WAAKG_URL, WAAKG_SESSAO, WAAKG_API_KEY)" });
            let t = "";
            for await (const p of req) t += p;
            responder(200, await fazer(JSON.parse(t || "{}"), req));
          } catch (err) {
            responder(err instanceof ErroWhatsApp ? 400 : 502, { error: err instanceof Error ? err.message : String(err) });
          }
        });

      rota("/__whatsapp/enviar-convocacao", async corpo => {
        const teste = numeroWhatsApp(env.WAAKG_NUMERO_TESTE);
        if (!teste) throw new ErroWhatsApp("No localhost, informe WAAKG_NUMERO_TESTE no .env.local (celular com DDD): as mensagens vão só para ele");
        const envios = validarEnvios(corpo.envios);
        const desvio = envios.slice(0, 3).map(e => ({ ...e, numero: teste, texto: `[TESTE — seria para ${e.nome}, ${e.numero}]\n\n${e.texto}` }));
        return { ...(await agendarEnvios(conta, desvio, 20)), teste: true };
      });
      // Acompanhamento: { lote } traz as mensagens do lote; sem lote, o resumo dos últimos envios.
      rota("/__whatsapp/lotes", async corpo => (corpo.lote ? lerLote(conta, String(corpo.lote)) : listarLotes(conta)));
      rota("/__whatsapp/cancelar-lote", async corpo => cancelarLote(conta, String(corpo.lote)));
    },
  };
}

/**
 * Só no `npm run dev`: chat "Tirar dúvidas" respondido daqui do PC, com a chave
 * GEMINI_API_KEY do .env.local (fora do git e do navegador).
 */
function ajudaLocal(env: Record<string, string>): Plugin {
  return {
    name: "ajuda-local",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__ajuda/perguntar", async (req, res) => {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        try {
          if (!env.GEMINI_API_KEY) throw new ErroAssistente("Falta GEMINI_API_KEY no .env.local", 503);
          let t = "";
          for await (const p of req) t += p;
          const corpo = JSON.parse(t || "{}");
          const resposta = await perguntarAssistente(env.GEMINI_API_KEY, normalizarConversa(corpo.conversa), corpo.pagina);
          res.end(JSON.stringify({ resposta }));
        } catch (err) {
          res.statusCode = err instanceof ErroAssistente ? err.status : 502;
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
      });
    },
  };
}

function seniorLocal(env: Record<string, string>): Plugin {
  return {
    name: "senior-local",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__senior/listar-colaboradores", async (req, res) => {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        const { SENIOR_WS_URL: baseUrl, SENIOR_WS_USER: user, SENIOR_WS_PASSWORD: password } = env;
        if (req.method !== "POST" || !baseUrl || !user || !password) {
          res.statusCode = 503;
          return res.end(JSON.stringify({ error: "Senior não configurada no .env.local" }));
        }
        let texto = "";
        for await (const parte of req) texto += parte;
        try {
          const cfg: SeniorConfig = { baseUrl, user, password, module: env.SENIOR_WS_MODULE || "rubi" };
          res.end(JSON.stringify(await buscarEtapa(cfg, JSON.parse(texto || "{}") as PedidoEtapa)));
        } catch (e) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
        }
      });
      server.middlewares.use("/__senior/consultar-colaborador", async (req, res) => {
        const responder = (status: number, corpo: unknown) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(corpo));
        };
        if (req.method !== "POST") return responder(405, { error: "Método não permitido" });
        const { SENIOR_WS_URL: baseUrl, SENIOR_WS_USER: user, SENIOR_WS_PASSWORD: password } = env;
        if (!baseUrl || !user || !password) return responder(503, { error: "Senior não configurada no .env.local" });
        let texto = "";
        for await (const parte of req) texto += parte;
        try {
          const { num_emp, tip_col = 1, num_cad, cpf, sem_posto } = JSON.parse(texto || "{}");
          const cfg = { baseUrl, user, password, module: env.SENIOR_WS_MODULE || "rubi" };
          if (cpf !== undefined && !cpfValido(String(cpf))) return responder(400, { error: "CPF inválido" });
          const c = cpf !== undefined
            ? escolherCadastro(await consultarColaboradorPorCpf(cfg, String(cpf)))
            : (await consultarColaborador(cfg, { numEmp: Number(num_emp), tipCol: Number(tip_col), numCad: Number(num_cad) }))[0];
          if (!c) return responder(404, { error: "Colaborador não encontrado na Senior" });
          // Posto de trabalho e escala vêm de outra consulta; se falhar, segue sem eles.
          const posto = sem_posto ? null : await postoEscalaDoColaborador(cfg, c).catch(() => null);
          responder(200, { colaborador: { ...c, ...posto } });
        } catch (e) {
          if (e instanceof SeniorError) return responder(502, { error: e.message });
          responder(500, { error: e instanceof Error ? e.message : String(e) });
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    // Necessário quando o projeto roda a partir de um compartilhamento de rede
    // (UNC/SMB): os eventos nativos de filesystem não chegam do servidor de
    // arquivos, então o watcher precisa fazer polling.
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
  plugins: [react(), seniorLocal(loadEnv(mode, process.cwd(), "SENIOR_")), emailLocal(loadEnv(mode, process.cwd(), "MS_")), ajudaLocal(loadEnv(mode, process.cwd(), "GEMINI_")), whatsappLocal(loadEnv(mode, process.cwd(), "WAAKG_"))],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
