// deno-lint-ignore-file
// Monta o relatório semanal de fichas pendentes de assinatura (HTML + planilha Excel).
// Uma linha por ficha pendente: há quantos dias está parada, quantos itens tem
// (ficha sem itens = provável ficha em branco, salva por engano) e a situação do
// link de assinatura. Sem dependências: usado pela Edge Function
// enviar-relatorio-pendentes e, no localhost, pelo vite.config.ts.
import { dataBrasilia, formatarData } from './convocacaoUniforme.ts';
import { base64, gerarXlsx } from './xlsx.ts';

export interface FichaPendente {
  id: string; numero: number | null; nome_funcionario: string | null; matricula_snapshot: string | null;
  funcao: string | null; posto_snapshot: string | null; uf: string; empresa: string | null;
  motivo: string | null; created_at: string;
}
export interface ItemDaFicha { ficha_id: string }
export interface TokenAssinatura { ficha_id: string; expira_em: string; usado: boolean; created_at: string }
export type SituacaoLink = 'Sem link' | 'Link válido' | 'Link vencido';

export interface LinhaPendente {
  uf: string; ficha: FichaPendente; criadaEm: string; dias: number; itens: number;
  link: SituacaoLink; linkExpiraEm: string | null;
}

const MOTIVO: Record<string, string> = {
  admissao: 'Admissão', substituicao: 'Substituição', perda_extravio: 'Perda/Extravio',
  demissao: 'Demissão', complemento: 'Complemento',
};
const motivoTexto = (m: string | null) => (m && MOTIVO[m]) || '';

/** Estados do relatório: os pedidos, ou (lista vazia) os que têm ficha pendente. */
export function estadosDosPendentes(pedidos: string[], fichas: FichaPendente[]): string[] {
  if (pedidos.length) return [...pedidos].sort();
  return [...new Set(fichas.map(f => f.uf))].sort();
}

/** Dias corridos entre duas datas YYYY-MM-DD. */
const diasEntre = (de: string, ate: string) =>
  Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

/** Linhas do relatório, das fichas mais antigas para as mais novas em cada estado. */
export function calcularPendentes(
  fichas: FichaPendente[], itens: ItemDaFicha[], tokens: TokenAssinatura[], ufs: string[], agora = new Date(),
): LinhaPendente[] {
  const hoje = dataBrasilia(agora);
  const qtd = new Map<string, number>();
  for (const i of itens) qtd.set(i.ficha_id, (qtd.get(i.ficha_id) ?? 0) + 1);
  // Vale o link mais recente de cada ficha (reenviar gera outro).
  const ultimo = new Map<string, TokenAssinatura>();
  for (const t of tokens) {
    const atual = ultimo.get(t.ficha_id);
    if (!atual || t.created_at > atual.created_at) ultimo.set(t.ficha_id, t);
  }
  return fichas.filter(f => ufs.includes(f.uf)).map(f => {
    const criadaEm = dataBrasilia(f.created_at);
    const t = ultimo.get(f.id);
    const link: SituacaoLink = !t || t.usado ? 'Sem link' : Date.parse(t.expira_em) > agora.getTime() ? 'Link válido' : 'Link vencido';
    return {
      uf: f.uf, ficha: f, criadaEm, dias: Math.max(diasEntre(criadaEm, hoje), 0), itens: qtd.get(f.id) ?? 0,
      link, linkExpiraEm: link === 'Link válido' ? t!.expira_em : null,
    };
  }).sort((a, b) => a.uf.localeCompare(b.uf) || b.dias - a.dias
    || (a.ficha.nome_funcionario ?? '').localeCompare(b.ficha.nome_funcionario ?? '', 'pt-BR'));
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const MAX_LINHAS_EMAIL = 150;
const ANTIGA = 7;

export function montarEmailPendentes(linhas: LinhaPendente[], ufs: string[], agora = new Date()) {
  const hoje = dataBrasilia(agora);
  const antigas = linhas.filter(l => l.dias > ANTIGA).length;
  const semItens = linhas.filter(l => l.itens === 0).length;
  const th = 'style="background:#1d4ed8;color:#fff;text-align:left;padding:6px 8px"';
  const resumo = ufs.map(uf => {
    const doUf = linhas.filter(l => l.uf === uf);
    return `<tr><td><b>${esc(uf)}</b></td><td>${doUf.length}</td>
      <td style="color:#b45309;font-weight:600">${doUf.filter(l => l.dias > ANTIGA).length}</td>
      <td style="color:#b91c1c;font-weight:600">${doUf.filter(l => l.dias > 30).length}</td>
      <td>${doUf.filter(l => l.itens === 0).length}</td></tr>`;
  }).join('');
  const corDias = (d: number) => (d > 30 ? '#b91c1c' : d > ANTIGA ? '#b45309' : '#111');
  const corpo = linhas.slice(0, MAX_LINHAS_EMAIL).map(l => `<tr>
      <td>${esc(l.uf)}</td><td>${esc(l.ficha.numero ?? '')}</td><td>${esc(l.ficha.nome_funcionario)}</td>
      <td>${esc(l.ficha.matricula_snapshot ?? '')}</td><td>${esc(l.ficha.posto_snapshot ?? '')}</td>
      <td>${motivoTexto(l.ficha.motivo)}</td><td>${formatarData(l.criadaEm)}</td>
      <td style="text-align:right;font-weight:600;color:${corDias(l.dias)}">${l.dias}</td>
      <td style="text-align:right${l.itens === 0 ? ';color:#b91c1c;font-weight:600' : ''}">${l.itens === 0 ? 'sem itens' : l.itens}</td>
      <td>${l.link}</td></tr>`).join('');
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#111">
    <h2 style="color:#1d4ed8;margin:0 0 6px">Fichas pendentes de assinatura</h2>
    <p style="margin:0 0 12px">${formatarData(hoje)} · Estados: ${esc(ufs.join(', ') || '—')} ·
      <strong>${linhas.length}</strong> ficha(s) pendente(s)${antigas ? `, ${antigas} há mais de ${ANTIGA} dias` : ''}.</p>
    ${linhas.length === 0 ? '<p>Nenhuma ficha pendente de assinatura.</p>' : `
    <table cellspacing="0" cellpadding="6" style="border-collapse:collapse;border:1px solid #cbd5e1;font-size:12px;margin-bottom:16px">
      <thead><tr><th ${th}>Estado</th><th ${th}>Pendentes</th><th ${th}>Há mais de ${ANTIGA} dias</th><th ${th}>Há mais de 30 dias</th><th ${th}>Sem itens</th></tr></thead>
      <tbody>${resumo}</tbody></table>
    ${semItens ? `<p style="margin:0 0 12px;color:#b91c1c">${semItens} ficha(s) estão sem nenhum item — provavelmente salvas em branco ou em duplicidade. Confira e exclua em Consultar Fichas.</p>` : ''}
    <p style="margin:0 0 6px"><b>Fichas pendentes (mais antigas primeiro)</b></p>
    <table cellspacing="0" cellpadding="6" style="border-collapse:collapse;border:1px solid #cbd5e1;font-size:12px">
      <thead><tr><th ${th}>UF</th><th ${th}>Nº</th><th ${th}>Colaborador</th><th ${th}>Matrícula</th><th ${th}>Posto</th>
        <th ${th}>Motivo</th><th ${th}>Criada em</th><th ${th}>Dias</th><th ${th}>Itens</th><th ${th}>Link de assinatura</th></tr></thead>
      <tbody>${corpo}</tbody></table>
    ${linhas.length > MAX_LINHAS_EMAIL ? `<p>… e mais ${linhas.length - MAX_LINHAS_EMAIL} ficha(s) — veja a planilha.</p>` : ''}`}
    <p style="color:#64748b;font-size:11px;margin-top:16px">Enviado pelo sistema de Fichas de EPI/Uniforme — Grupo 5 Estrelas.
      A planilha em anexo traz todas as fichas pendentes. Para colher a assinatura, abra a ficha em Consultar Fichas
      (tablet, computador ou reenvio do link pelo WhatsApp).</p>
  </div>`;

  const xlsx = gerarXlsx('Pendentes',
    ['UF', 'Nº da ficha', 'Colaborador', 'Matrícula', 'Função', 'Posto', 'Empresa', 'Motivo', 'Criada em',
      'Dias pendente', 'Itens', 'Link de assinatura', 'Link vale até'],
    linhas.map(l => [
      l.uf, l.ficha.numero ?? '', l.ficha.nome_funcionario ?? '', l.ficha.matricula_snapshot ?? '', l.ficha.funcao ?? '',
      l.ficha.posto_snapshot ?? '', l.ficha.empresa ?? '', motivoTexto(l.ficha.motivo), formatarData(l.criadaEm),
      l.dias, l.itens, l.link, l.linkExpiraEm ? formatarData(dataBrasilia(l.linkExpiraEm)) : '',
    ]),
    [6, 10, 36, 12, 24, 28, 24, 14, 12, 10, 8, 16, 12]);
  return {
    assunto: `Fichas pendentes de assinatura${ufs.length === 1 ? ` — ${ufs[0]}` : ''} — ${formatarData(hoje)} — ${linhas.length} ficha(s)`,
    html,
    anexo: {
      nome: `fichas-pendentes-${ufs.length === 1 ? `${ufs[0].toLowerCase()}-` : ''}${hoje}.xlsx`,
      tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      base64: base64(xlsx),
    },
    fichas: linhas.length,
    antigas,
    semItens,
  };
}
