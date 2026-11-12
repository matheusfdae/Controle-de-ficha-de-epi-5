import { describe, expect, it } from 'vitest';
import type { Movimentacao } from '@/modules/movimentacao/lib/movimentacaoService';
import {
  coberturas, faixasAtraso, indicadores, porDiaSemana, porFiscal, porMes, porMotivo, porPosto, reincidentes,
} from '@/modules/movimentacao/lib/gerencial';

let n = 0;
const mov = (o: Partial<Movimentacao> = {}): Movimentacao => ({
  id: `id${++n}`, codigo: `MOV-${n}`, created_at: '2026-11-12T13:00:00Z',
  data_movimentacao: '2026-11-12', data_lancamento: '2026-11-12', status: 'ok', empresa: 'MATRIZ', uf: 'DF',
  fiscal_nome: 'FISCAL A', fiscal_matricula: '100', falta_matricula: '200', falta_nome: 'JOAO',
  cobertura_matricula: '300', cobertura_nome: 'MARIA', posto_id: null, posto_nome: 'Terracap', motivo: 'FALTA',
  justificativa: null, horario: '07:00 AS 19:00', turno: 'DIURNO', cobertura_por_extra: true,
  ocorrencias_plantao: null, email_avisado_em: null, ...o,
});

const dados = [
  mov(),
  mov({ data_movimentacao: '2026-11-09', status: 'divergente', fiscal_nome: 'FISCAL B', fiscal_matricula: '101', email_avisado_em: '2026-11-12T14:00:00Z' }),
  mov({ data_movimentacao: '2026-11-11', status: 'divergente', fiscal_nome: 'FISCAL B', fiscal_matricula: '101', posto_nome: ' terracap ', turno: 'NOTURNO' }),
  mov({ motivo: 'TREINAMENTO', falta_matricula: '201', falta_nome: 'ANA', cobertura_matricula: null, cobertura_nome: null, cobertura_por_extra: false, posto_nome: 'Detran' }),
  mov({ data_movimentacao: '2026-10-05', data_lancamento: '2026-10-05' }),
];

describe('painel gerencial da movimentação', () => {
  it('indicadores do mês', () => {
    const k = indicadores(dados, '2026-11', '2026-10');
    expect(k).toMatchObject({
      total: 4, anterior: 1, divergentes: 2, pctDivergentes: 50, atrasoMedio: 2, faltas: 3, descobertos: 1,
      extras: 3, pctExtras: 75, avisosPendentes: 1, fiscais: 2, postos: 2,
    });
  });

  it('séries por mês, motivo, dia da semana e atraso', () => {
    expect(porMes(dados, ['2026-10', '2026-11'], m => m)).toEqual([
      { mes: '2026-10', rotulo: '2026-10', OK: 1, Divergente: 0, Descobertos: 0 },
      { mes: '2026-11', rotulo: '2026-11', OK: 2, Divergente: 2, Descobertos: 1 },
    ]);
    const nov = dados.filter(l => l.data_movimentacao.startsWith('2026-11'));
    expect(porMotivo(nov)).toEqual([
      { motivo: 'FALTA', total: 3 }, { motivo: 'TREINAMENTO', total: 1 }, { motivo: 'REFORÇO', total: 0 }, { motivo: 'SDF', total: 0 },
    ]);
    // 12/11/2026 é quinta; 11/11 quarta (noturno); 09/11 segunda.
    const sem = porDiaSemana(nov);
    expect(sem[4]).toEqual({ dia: 'Qui', Diurno: 2, Noturno: 0 });
    expect(sem[3]).toEqual({ dia: 'Qua', Diurno: 0, Noturno: 1 });
    expect(sem[1]).toEqual({ dia: 'Seg', Diurno: 1, Noturno: 0 });
    expect(faixasAtraso(nov).map(f => f.total)).toEqual([2, 1, 1, 0, 0]);
  });

  it('fiscais, postos, reincidentes e coberturas', () => {
    const nov = dados.filter(l => l.data_movimentacao.startsWith('2026-11'));
    const f = porFiscal(nov);
    expect(f[0]).toMatchObject({ nome: 'FISCAL B', total: 2, divergentes: 2, pct: 100, atrasoMedio: 2, ultimo: '2026-11-11' });
    expect(f[1]).toMatchObject({ nome: 'FISCAL A', total: 2, divergentes: 0, atrasoMedio: null });

    const p = porPosto(nov);
    expect(p[0]).toMatchObject({ nome: 'TERRACAP', total: 3, faltas: 3, descobertos: 0, diurno: 2, noturno: 1 });
    expect(p[1]).toMatchObject({ nome: 'DETRAN', total: 1, descobertos: 1, faltas: 0 });

    expect(reincidentes(nov)[0]).toMatchObject({ matricula: '200', nome: 'JOAO', faltas: 3, postos: ['TERRACAP'] });
    expect(coberturas(nov)).toEqual([{ matricula: '300', nome: 'MARIA', total: 3, extras: 3, postos: ['TERRACAP'] }]);
  });
});
