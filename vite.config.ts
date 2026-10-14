import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { enviarComo, iniciarLogin, renovarAcesso, verificarLogin } from "./supabase/functions/_shared/microsoft";
import { EMAIL, montarEmail } from "./supabase/functions/_shared/emailConvocacao";
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
  plugins: [react(), seniorLocal(loadEnv(mode, process.cwd(), "SENIOR_")), emailLocal(loadEnv(mode, process.cwd(), "MS_"))],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
