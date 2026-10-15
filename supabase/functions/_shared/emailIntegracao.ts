// deno-lint-ignore-file
// E-mail com a lista de quem participou da integração (admissão), montado
// num modelo fixo: o navegador só manda os dados das pessoas (escapados aqui).
// Sem dependências: usado pela Edge Function enviar-email-integracao, pelo
// vite.config.ts (localhost) e pela prévia na tela.
import { base64, gerarXlsx } from './xlsx.ts';

export interface PessoaIntegracao {
  nome: string;
  matricula?: string | null;
  empresa?: string | null;
  cargo?: string | null;
  posto?: string | null;
  uf?: string | null;
  /** aaaa-mm-dd */
  admissao?: string | null;
  /** Sem ficha / Aguardando assinatura / Assinada */
  fichas?: string | null;
}

export const MAX_PESSOAS_INTEGRACAO = 500;

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const corta = (v: unknown, n = 200) => String(v ?? '').slice(0, n);
const dataBr = (iso?: string | null) => {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/** Limpa e limita o que veio do navegador. */
export function normalizarPessoas(lista: unknown): PessoaIntegracao[] {
  if (!Array.isArray(lista)) return [];
  return lista.slice(0, MAX_PESSOAS_INTEGRACAO).map((p: any) => ({
    nome: corta(p?.nome, 150), matricula: corta(p?.matricula, 20), empresa: corta(p?.empresa, 40),
    cargo: corta(p?.cargo, 100), posto: corta(p?.posto, 150), uf: corta(p?.uf, 2),
    admissao: /^\d{4}-\d{2}-\d{2}$/.test(String(p?.admissao ?? '')) ? String(p.admissao) : '',
    fichas: corta(p?.fichas, 40),
  })).filter(p => p.nome.trim());
}

export function montarEmailIntegracao(pessoas: PessoaIntegracao[], opcoes: { data?: string; observacao?: string } = {}) {
  const data = dataBr(opcoes.data) || dataBr(new Date().toISOString());
  const obs = corta(opcoes.observacao, 1000).trim();
  const th = 'style="background:#1d4ed8;color:#fff;text-align:left;padding:6px 8px"';
  const linhas = pessoas.map(p => `<tr>
      <td>${esc(p.nome)}</td><td>${esc(p.matricula)}</td><td>${esc(p.empresa)}</td><td>${esc(p.cargo)}</td>
      <td>${esc(p.posto)}</td><td>${esc(p.uf)}</td><td>${esc(dataBr(p.admissao))}</td><td>${esc(p.fichas)}</td></tr>`).join('');
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#111">
    <h2 style="color:#1d4ed8;margin:0 0 6px">Integração de novos colaboradores — ${esc(data)}</h2>
    <p style="margin:0 0 12px"><strong>${pessoas.length}</strong> colaborador(es) participaram da integração.</p>
    ${obs ? `<p style="margin:0 0 12px;white-space:pre-line">${esc(obs)}</p>` : ''}
    <table cellspacing="0" cellpadding="6" style="border-collapse:collapse;border:1px solid #cbd5e1;font-size:12px">
      <thead><tr><th ${th}>Colaborador</th><th ${th}>Matrícula</th><th ${th}>Empresa</th><th ${th}>Cargo</th>
      <th ${th}>Posto</th><th ${th}>UF</th><th ${th}>Admissão</th><th ${th}>Fichas de EPI/uniforme</th></tr></thead>
      <tbody>${linhas}</tbody></table>
    <p style="color:#64748b;font-size:11px;margin-top:16px">Enviado pelo sistema de Fichas de EPI/Uniforme — Grupo 5 Estrelas. A planilha segue em anexo.</p>
  </div>`;
  const xlsx = gerarXlsx('Integração',
    ['Colaborador', 'Matrícula', 'Empresa', 'Cargo', 'Posto', 'UF', 'Admissão', 'Fichas de EPI/uniforme'],
    pessoas.map(p => [p.nome, p.matricula, p.empresa, p.cargo, p.posto, p.uf, dataBr(p.admissao), p.fichas]),
    [36, 12, 10, 28, 36, 6, 12, 22]);
  const sufixo = (opcoes.data && /^\d{4}-\d{2}-\d{2}$/.test(opcoes.data)) ? opcoes.data : new Date().toISOString().slice(0, 10);
  return {
    assunto: `Integração de novos colaboradores — ${pessoas.length} colaborador(es) — ${data}`,
    html,
    anexo: {
      nome: `integracao-${sufixo}.xlsx`,
      tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      base64: base64(xlsx),
    },
  };
}
