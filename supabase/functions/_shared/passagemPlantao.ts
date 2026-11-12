// deno-lint-ignore-file
// E-mail da passagem de plantão da Movimentação Diária: resumo no corpo e o
// relatório do dia em PDF anexo (função avisar-movimentacao e, no localhost,
// o vite.config.ts). Puro: testado no vitest.

import { dataBr, limparEmails } from './avisoMovimentacao.ts';
import { resumo, type RelatorioPdf } from './relatorioMovimentacaoPdf.ts';

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/**
 * Destinatários: os e-mails da passagem (Configurações → E-mail); sem eles, os
 * do aviso de divergência. Cópia: e-mail da Senior de quem entrega e de quem
 * recebe, se tiver e não estiver já no "para".
 */
export function destinatariosPassagem(cfg: { emails_passagem?: string[] | null; emails_divergencia?: string[] | null } | null,
  copiaSenior: (string | null | undefined)[]) {
  const proprios = limparEmails(cfg?.emails_passagem);
  const para = proprios.length ? proprios : limparEmails(cfg?.emails_divergencia);
  const copia = limparEmails(copiaSenior.filter(Boolean) as string[]).filter(e => !para.includes(e));
  return { para, copia };
}

export function montarEmailPassagem(r: RelatorioPdf, link?: string | null) {
  const p = r.passagem;
  const s = resumo(r.lancamentos);
  const assunto = `Passagem de plantão — ${r.fiscal.nome} — ${dataBr(r.data)}`;
  const linha = (rotulo: string, valor: unknown, cor?: string) =>
    `<tr><td style="padding:6px 10px;color:#555;white-space:nowrap;vertical-align:top">${esc(rotulo)}</td><td style="padding:6px 10px;font-weight:600${cor ? `;color:${cor}` : ''}">${esc(valor)}</td></tr>`;
  const quando = p ? new Date(p.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '';
  const lista = r.lancamentos.map(l => {
    const cob = l.cobertura_nome ? `${esc(l.cobertura_nome)}${l.cobertura_reserva ? ' <span style="color:#b91c1c;font-weight:700">(RESERVA)</span>' : ''}` : '<em>ninguém cobriu</em>';
    const st = l.status === 'ok' ? '' : ' <span style="color:#b45309;font-weight:700">DIVERGENTE</span>';
    return `<li style="margin:3px 0">${esc(l.posto)} — ${esc(l.motivo)}: ${esc(l.falta_nome)}${l.falta_reserva ? ' <span style="color:#b91c1c;font-weight:700">(RESERVA)</span>' : ''} → ${cob}${st}</li>`;
  }).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Segoe UI,Arial,sans-serif;color:#1f2937">
<div style="max-width:640px;margin:0 auto;padding:20px">
  <div style="background:#fff;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden">
    <div style="background:#1d4ed8;color:#fff;padding:14px 18px">
      <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.9">Controle de Movimentação Diária</div>
      <div style="font-size:19px;font-weight:700;margin-top:2px">Passagem de plantão — ${dataBr(r.data)}</div>
    </div>
    <div style="padding:16px 18px">
      <p style="margin:0 0 12px">O fiscal <strong>${esc(r.fiscal.nome)}</strong> passou o plantão${p?.recebe_nome ? ` para <strong>${esc(p.recebe_nome)}</strong>` : ''}.
      O relatório com os lançamentos do dia está <strong>anexo em PDF</strong>.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;background:#fafafa;border-radius:8px">
        ${p ? linha('Passagem', `${p.codigo} — ${quando}`) : ''}
        ${linha('Entrega', `${r.fiscal.nome} (${r.fiscal.matricula})`)}
        ${linha('Recebe', p?.recebe_nome ? `${p.recebe_nome}${p.recebe_matricula ? ` (${p.recebe_matricula})` : ''}` : 'não informado')}
        ${linha('Lançamentos', `${s.total} — ${s.ok} OK, ${s.divergentes} divergente(s)`)}
        ${s.descobertos ? linha('Sem cobertura', s.descobertos, '#b45309') : ''}
        ${s.coberturasReserva ? linha('Coberto por reserva', s.coberturasReserva, '#b91c1c') : ''}
        ${p?.observacao ? linha('Observações', p.observacao) : ''}
      </table>
      ${lista ? `<ul style="font-size:13px;padding-left:18px;margin:14px 0 0">${lista}</ul>` : '<p style="font-size:13px;color:#6b7280;margin:14px 0 0">Nenhum lançamento neste dia.</p>'}
      ${link ? `<p style="margin:16px 0 0"><a href="${esc(link)}" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:9px 14px;border-radius:6px;display:inline-block">Abrir no sistema</a></p>` : ''}
    </div>
  </div>
  <p style="font-size:11px;color:#6b7280;text-align:center;margin-top:10px">E-mail automático do sistema. Não responda.</p>
</div></body></html>`;
  return { assunto, html };
}
