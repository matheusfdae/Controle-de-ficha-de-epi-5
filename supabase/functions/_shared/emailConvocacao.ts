// deno-lint-ignore-file
// Monta o e-mail da convocação de troca de uniforme (HTML + planilha Excel).
// Sem dependências: usado pela Edge Function enviar-convocacao-uniforme e,
// no localhost, pelo vite.config.ts.
import {
  dataBrasilia, formatarData, situacaoTexto, ConvocacaoUniforme, MESES_TROCA, DIAS_AVISO,
} from './convocacaoUniforme.ts';
import { base64, gerarXlsx } from './xlsx.ts';

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function montarEmail(lista: ConvocacaoUniforme[], ufs: string[]) {
  const hoje = dataBrasilia(new Date());
  const vencidos = lista.filter(t => t.situacao === 'vencido').length;
  const linhas = lista.map(t => `<tr>
      <td>${esc(t.nome)}</td><td>${esc(t.matricula)}</td><td>${esc(t.funcao)}</td>
      <td>${esc(t.posto)}</td><td>${esc(t.uf)}</td><td>${esc(formatarData(t.dataAssinatura))}</td>
      <td>${esc(formatarData(t.dataTroca))}</td>
      <td style="color:${t.situacao === 'vencido' ? '#b91c1c' : '#b45309'};font-weight:600">${esc(situacaoTexto(t))}</td></tr>`).join('');
  const th = 'style="background:#1d4ed8;color:#fff;text-align:left;padding:6px 8px"';
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#111">
    <h2 style="color:#1d4ed8;margin:0 0 6px">Convocação para troca de uniforme</h2>
    <p style="margin:0 0 12px">${formatarData(hoje)} · Estados: ${esc(ufs.join(', '))} ·
      <strong>${lista.length}</strong> colaborador(es) — ${vencidos} vencido(s) e ${lista.length - vencidos} vencendo em até ${DIAS_AVISO} dias.<br>
      Troca a cada ${MESES_TROCA} meses, contados da assinatura da última ficha de uniforme.</p>
    ${lista.length === 0 ? '<p>Nenhum colaborador para convocar.</p>' : `
    <table cellspacing="0" cellpadding="6" style="border-collapse:collapse;border:1px solid #cbd5e1;font-size:12px">
      <thead><tr><th ${th}>Colaborador</th><th ${th}>Matrícula</th><th ${th}>Função</th>
      <th ${th}>Posto</th><th ${th}>UF</th><th ${th}>Assinada em</th><th ${th}>Troca em</th><th ${th}>Situação</th></tr></thead>
      <tbody>${linhas}</tbody></table>`}
    <p style="color:#64748b;font-size:11px;margin-top:16px">Enviado automaticamente pelo sistema de Fichas de EPI/Uniforme — Grupo 5 Estrelas. A planilha segue em anexo.</p>
  </div>`;
  // Planilha Excel (.xlsx) anexa.
  const xlsx = gerarXlsx('Convocação',
    ['Colaborador', 'Matrícula', 'Função', 'Posto', 'UF', 'Ficha', 'Assinada em', 'Troca em', 'Situação', 'Itens de uniforme'],
    lista.map(t => [t.nome, t.matricula, t.funcao, t.posto, t.uf, t.fichaNumero ?? '',
      formatarData(t.dataAssinatura), formatarData(t.dataTroca), situacaoTexto(t), t.itens.join(', ')]),
    [36, 12, 24, 30, 6, 8, 13, 13, 24, 60]);
  return {
    assunto: `Convocação troca de uniforme — ${lista.length} colaborador(es) — ${formatarData(hoje)}`,
    html,
    anexo: {
      nome: `convocacao-uniforme-${hoje}.xlsx`,
      tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      base64: base64(xlsx),
    },
  };
}

