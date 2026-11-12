import { describe, expect, it } from 'vitest';
import {
  diasDeDiferenca, limparEmails, montarEmailDivergencia, motivoDivergencia, type LancamentoAviso,
} from '../../supabase/functions/_shared/avisoMovimentacao';
import { turnoDoHorario } from '../modules/movimentacao/lib/movimentacaoService';

const lanc = (o: Partial<LancamentoAviso> = {}): LancamentoAviso => ({
  id: 'x', codigo: 'MOV-ABC12345', created_at: '2026-11-12T13:30:00Z', data_movimentacao: '2026-11-11', data_lancamento: '2026-11-12',
  empresa: 'MATRIZ', fiscal_nome: 'FISCAL TESTE', fiscal_matricula: '1000001', falta_matricula: '1012008', falta_nome: 'Fulano <b>',
  cobertura_matricula: null, cobertura_nome: null, posto_nome: 'TERRACAP', motivo: 'FALTA', justificativa: null,
  horario: '07:00 AS 19:00', turno: 'DIURNO', cobertura_por_extra: true, ...o,
});

describe('movimentação diária', () => {
  it('conta os dias entre a data informada e o lançamento', () => {
    expect(diasDeDiferenca('2026-11-11', '2026-11-12')).toBe(1);
    expect(diasDeDiferenca('2026-10-31', '2026-11-02')).toBe(2);
    expect(motivoDivergencia('2026-11-11', '2026-11-12')).toBe('lançamento do dia anterior');
    expect(motivoDivergencia('2026-11-09', '2026-11-12')).toBe('lançamento de 3 dias antes');
  });

  it('e-mail traz fiscal, data e o motivo da divergência, com HTML escapado', () => {
    const m = montarEmailDivergencia(lanc(), 'https://sistema/movimentacao');
    expect(m.assunto).toBe('Movimentação DIVERGENTE — FISCAL TESTE — 11/11/2026');
    expect(m.html).toContain('lançamento do dia anterior');
    expect(m.html).toContain('12/11/2026 às 10:30');
    expect(m.html).toContain('Ninguém cobriu');
    expect(m.html).toContain('Fulano &lt;b&gt;');
    expect(m.html).not.toContain('Fulano <b>');
  });

  it('limpa a lista de e-mails', () => {
    expect(limparEmails([' A@X.com ', 'a@x.com', 'ruim', 'b@y.com.br'])).toEqual(['a@x.com', 'b@y.com.br']);
    expect(limparEmails(null)).toEqual([]);
  });

  it('turno pelo horário', () => {
    expect(turnoDoHorario('07:00 AS 19:00')).toBe('DIURNO');
    expect(turnoDoHorario('13:00 AS 01:00')).toBe('DIURNO');
    expect(turnoDoHorario('19:00 AS 07:00')).toBe('NOTURNO');
    expect(turnoDoHorario('22:00 AS 10:00')).toBe('NOTURNO');
    expect(turnoDoHorario('sem horário')).toBeNull();
  });
});
