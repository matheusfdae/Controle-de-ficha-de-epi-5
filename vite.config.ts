import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
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
          const { num_emp, tip_col = 1, num_cad, cpf } = JSON.parse(texto || "{}");
          const cfg = { baseUrl, user, password, module: env.SENIOR_WS_MODULE || "rubi" };
          if (cpf !== undefined && !cpfValido(String(cpf))) return responder(400, { error: "CPF inválido" });
          const c = cpf !== undefined
            ? escolherCadastro(await consultarColaboradorPorCpf(cfg, String(cpf)))
            : (await consultarColaborador(cfg, { numEmp: Number(num_emp), tipCol: Number(tip_col), numCad: Number(num_cad) }))[0];
          if (!c) return responder(404, { error: "Colaborador não encontrado na Senior" });
          // Posto de trabalho e escala vêm de outra consulta; se falhar, segue sem eles.
          const posto = await postoEscalaDoColaborador(cfg, c).catch(() => null);
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
  plugins: [react(), seniorLocal(loadEnv(mode, process.cwd(), "SENIOR_"))],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
