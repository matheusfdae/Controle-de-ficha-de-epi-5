// Aviso por e-mail de lançamento DIVERGENTE do Controle de Movimentação Diária
// (função avisar-movimentacao e, no localhost, o vite.config.ts).
// Um e-mail por lançamento. Puro: testado no vitest.

export interface LancamentoAviso {
  id: string;
  codigo: string;
  created_at: string;
  data_movimentacao: string;
  data_lancamento: string;
  empresa: string;
  fiscal_nome: string;
  fiscal_matricula: string | null;
  falta_matricula: string;
  falta_nome: string;
  cobertura_matricula: string | null;
  cobertura_nome: string | null;
  posto_nome: string;
  motivo: string;
  justificativa: string | null;
  horario: string;
  turno: string;
  cobertura_por_extra: boolean;
}

export const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Dias entre a data informada e o dia do lançamento (positivo = lançou depois). */
export function diasDeDiferenca(dataMov: string, dataLanc: string) {
  const d = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((d(dataLanc) - d(dataMov)) / 86_400_000);
}

/** "do dia anterior", "de 3 dias antes"... */
export function motivoDivergencia(dataMov: string, dataLanc: string) {
  const n = diasDeDiferenca(dataMov, dataLanc);
  if (n === 1) return 'lançamento do dia anterior';
  if (n > 1) return `lançamento de ${n} dias antes`;
  return 'data diferente do dia do lançamento';
}

export function montarEmailDivergencia(l: LancamentoAviso, link?: string | null) {
  const hora = new Date(l.created_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const porque = motivoDivergencia(l.data_movimentacao, l.data_lancamento);
  const assunto = `Movimentação DIVERGENTE — ${l.fiscal_nome} — ${dataBr(l.data_movimentacao)}`;
  const linha = (rotulo: string, valor: unknown) =>
    `<tr><td style="padding:6px 10px;color:#555;white-space:nowrap;vertical-align:top">${esc(rotulo)}</td><td style="padding:6px 10px;font-weight:600">${esc(valor)}</td></tr>`;
  const cobertura = l.cobertura_nome ? `${l.cobertura_nome}${l.cobertura_matricula ? ` (${l.cobertura_matricula})` : ''}` : 'Ninguém cobriu';
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Segoe UI,Arial,sans-serif;color:#1f2937">
<div style="max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#fff;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden">
    <div style="background:#b45309;color:#fff;padding:14px 18px">
      <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.9">Controle de Movimentação Diária</div>
      <div style="font-size:19px;font-weight:700;margin-top:2px">Lançamento DIVERGENTE</div>
    </div>
    <div style="padding:16px 18px">
      <p style="margin:0 0 12px">O lançamento do fiscal <strong>${esc(l.fiscal_nome)}</strong> com a data
      <strong>${dataBr(l.data_movimentacao)}</strong> ficou <strong style="color:#b45309">DIVERGENTE</strong> por ser
      ${esc(porque)}: foi lançado em <strong>${dataBr(l.data_lancamento)} às ${hora}</strong>.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;background:#fafafa;border-radius:8px">
        ${linha('Lançamento', l.codigo)}
        ${linha('Fiscal', `${l.fiscal_nome}${l.fiscal_matricula ? ` (${l.fiscal_matricula})` : ''}`)}
        ${linha('Data informada', dataBr(l.data_movimentacao))}
        ${linha('Lançado em', `${dataBr(l.data_lancamento)} às ${hora}`)}
        ${linha('Empresa', l.empresa)}
        ${linha('Posto', l.posto_nome)}
        ${linha('Motivo', l.motivo)}
        ${linha('Na falta', `${l.falta_nome} (${l.falta_matricula})`)}
        ${linha('Cobertura', cobertura)}
        ${linha('Cobertura por extra', l.cobertura_por_extra ? 'Sim' : 'Não')}
        ${linha('Horário / turno', `${l.horario} — ${l.turno}`)}
        ${l.justificativa ? linha('Justificativa', l.justificativa) : ''}
      </table>
      ${link ? `<p style="margin:16px 0 0"><a href="${esc(link)}" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:9px 14px;border-radius:6px;display:inline-block">Abrir no sistema</a></p>` : ''}
    </div>
  </div>
  <p style="font-size:11px;color:#6b7280;text-align:center;margin-top:10px">E-mail automático do sistema. Não responda.</p>
</div></body></html>`;
  return { assunto, html };
}

export function limparEmails(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  return [...new Set(lista.map(x => String(x).trim().toLowerCase()))].filter(x => EMAIL_VALIDO.test(x));
}
