import { describe, expect, it } from 'vitest';
import { destinatariosPassagem, montarEmailPassagem } from '../../supabase/functions/_shared/passagemPlantao';
import { desenharRelatorio, nomeArquivoRelatorio, type RelatorioPdf } from '../../supabase/functions/_shared/relatorioMovimentacaoPdf';

const rel: RelatorioPdf = {
  fiscal: { nome: 'FISCAL <TESTE>', matricula: '99', cargo: 'FISCAL' },
  data: '2026-11-13', gerado_em: '2026-11-13T21:00:00Z',
  passagem: { codigo: 'PAS-ABC12345', criado_em: '2026-11-13T21:00:00Z', recebe_nome: 'RECEBEDOR', recebe_matricula: '77', observacao: 'Posto X descoberto até 20h' },
  lancamentos: [{
    id: '1', codigo: 'MOV-1', criado_em: '2026-11-13T10:00:00Z', data: '2026-11-13', status: 'divergente',
    posto: 'TERRACAP', motivo: 'FALTA', falta_nome: 'FULANO', cobertura_nome: 'CICLANO', cobertura_reserva: true,
    horario: '07:00 AS 19:00', turno: 'DIURNO', cobertura_por_extra: true,
  }],
};

describe('passagem de plantão', () => {
  it('usa os e-mails da passagem; sem eles, os da divergência; Senior em cópia sem repetir', () => {
    expect(destinatariosPassagem({ emails_passagem: ['A@x.com'], emails_divergencia: ['b@x.com'] }, ['a@x.com', 'c@x.com', null]))
      .toEqual({ para: ['a@x.com'], copia: ['c@x.com'] });
    expect(destinatariosPassagem({ emails_passagem: [], emails_divergencia: ['b@x.com'] }, ['inválido']))
      .toEqual({ para: ['b@x.com'], copia: [] });
    expect(destinatariosPassagem(null, []).para).toEqual([]);
  });

  it('monta o e-mail com resumo, reserva e sem HTML injetado', () => {
    const m = montarEmailPassagem(rel, 'https://app/movimentacao');
    expect(m.assunto).toBe('Passagem de plantão — FISCAL <TESTE> — 13/11/2026');
    expect(m.html).toContain('FISCAL &lt;TESTE&gt;');
    expect(m.html).toContain('RECEBEDOR');
    expect(m.html).toContain('(RESERVA)');
    expect(m.html).toContain('DIVERGENTE');
    expect(m.html).toContain('Posto X descoberto até 20h');
  });

  it('gera o PDF da passagem', async () => {
    const { default: jsPDF } = await import('jspdf');
    const doc = desenharRelatorio(new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }), rel, null);
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(1000);
    expect(nomeArquivoRelatorio(rel)).toBe('Passagem de plantão 13-11-2026 - matrícula 99.pdf');
  });
});
