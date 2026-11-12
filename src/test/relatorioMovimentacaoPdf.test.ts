import { describe, expect, it } from 'vitest';
import { celulas, pdfRelatorioDia, resumo } from '@/modules/movimentacao/lib/relatorioDiaPdf';
import type { LancamentoDoFiscal } from '@/modules/movimentacao/lib/movimentacaoService';

const base: LancamentoDoFiscal = {
  id: '1', codigo: 'MOV-AAAA1111', criado_em: '2026-11-13T10:00:00Z', data: '2026-11-13', data_lancamento: '2026-11-13',
  status: 'ok', empresa: 'MATRIZ', posto: 'TERRACAP SEDE', motivo: 'FALTA', justificativa: null,
  falta_nome: 'FULANO DE TAL', falta_matricula: '1234', falta_reserva: false,
  cobertura_nome: 'CICLANO DA SILVA', cobertura_matricula: '5678', cobertura_reserva: true,
  horario: '07:00 AS 19:00', turno: 'DIURNO', cobertura_por_extra: true, ocorrencias: 1,
};

describe('relatório do dia da movimentação (PDF)', () => {
  it('marca quem é reserva e mostra a data lançada quando difere', () => {
    const c = celulas({ ...base, status: 'divergente', data: '2026-11-11' });
    expect(c[1]).toBe('11/11/2026\nlançado 13/11/2026');
    expect(c[2]).toBe('DIVERGENTE');
    expect(c[5]).toBe('FULANO DE TAL (1234)');
    expect(c[6]).toBe('CICLANO DA SILVA (5678) — RESERVA');
    expect(c[8]).toBe('SIM');
  });

  it('posto descoberto e OK pelo plantão', () => {
    const c = celulas({ ...base, cobertura_nome: null, cobertura_matricula: null, cobertura_reserva: false, ok_pelo_plantao: true });
    expect(c[6]).toBe('Ninguém cobriu');
    expect(c[2]).toBe('OK (plantão)');
  });

  it('resume os lançamentos', () => {
    expect(resumo([base, { ...base, id: '2', status: 'divergente', cobertura_nome: null, cobertura_reserva: false }]))
      .toEqual({ total: 2, ok: 1, divergentes: 1, descobertos: 1, coberturasReserva: 1 });
  });

  it('gera o PDF com várias páginas sem erro', async () => {
    const ls = Array.from({ length: 30 }, (_, i) => ({ ...base, id: String(i), codigo: `MOV-${i}`, justificativa: i % 3 ? null : 'Atestado médico apresentado ao supervisor' }));
    const doc = await pdfRelatorioDia({ fiscal: { nome: 'FISCAL TESTE', matricula: 99, cargo: 'FISCAL' }, data: '2026-11-13', gerado_em: '2026-11-13T12:00:00Z', lancamentos: ls }, false);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    if (process.env.SALVAR_PDF) (await import('node:fs')).writeFileSync(process.env.SALVAR_PDF, Buffer.from(doc.output('arraybuffer')));
  });
});
