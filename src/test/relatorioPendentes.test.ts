import { describe, expect, it } from 'vitest';
import {
  calcularPendentes, estadosDosPendentes, montarEmailPendentes, FichaPendente, TokenAssinatura,
} from '../../supabase/functions/_shared/relatorioPendentes';

// 29/10/2026, 10h em Brasília.
const agora = new Date('2026-10-29T13:00:00Z');

const ficha = (id: string, uf: string, criada: string, extra: Partial<FichaPendente> = {}): FichaPendente => ({
  id, numero: null, nome_funcionario: `Colaborador ${id}`, matricula_snapshot: null, funcao: null,
  posto_snapshot: null, uf, empresa: null, motivo: 'admissao', created_at: criada, ...extra,
});

const fichas = [
  ficha('nova', 'DF', '2026-10-28T15:00:00Z'),
  ficha('velha', 'DF', '2026-09-03T15:00:00Z', { nome_funcionario: 'Samuel <Teste>' }),
  ficha('media', 'DF', '2026-10-15T15:00:00Z'),
  ficha('mt', 'MT', '2026-10-27T15:00:00Z'),
  // 23h de 28/10 em Brasília (02h de 29/10 em UTC): conta como criada no dia 28.
  ficha('noite', 'GO', '2026-10-29T02:00:00Z'),
];
const itens = [{ ficha_id: 'nova' }, { ficha_id: 'nova' }, { ficha_id: 'media' }, { ficha_id: 'mt' }, { ficha_id: 'noite' }];
const tokens: TokenAssinatura[] = [
  { ficha_id: 'nova', expira_em: '2026-10-31T15:00:00Z', usado: false, created_at: '2026-10-28T15:00:00Z' },
  { ficha_id: 'media', expira_em: '2026-10-18T15:00:00Z', usado: false, created_at: '2026-10-15T15:00:00Z' },
  // Reenviado depois: vale o mais recente.
  { ficha_id: 'mt', expira_em: '2026-10-28T15:00:00Z', usado: false, created_at: '2026-10-25T15:00:00Z' },
  { ficha_id: 'mt', expira_em: '2026-10-30T15:00:00Z', usado: false, created_at: '2026-10-27T15:00:00Z' },
];

describe('relatório de fichas pendentes', () => {
  it('estados: os pedidos ou os que têm ficha pendente', () => {
    expect(estadosDosPendentes(['MT', 'DF'], fichas)).toEqual(['DF', 'MT']);
    expect(estadosDosPendentes([], fichas)).toEqual(['DF', 'GO', 'MT']);
  });

  it('conta dias, itens e situação do link, mais antigas primeiro', () => {
    const l = calcularPendentes(fichas, itens, tokens, ['DF', 'GO', 'MT'], agora);
    expect(l.map(x => x.ficha.id)).toEqual(['velha', 'media', 'nova', 'noite', 'mt']);
    const por = Object.fromEntries(l.map(x => [x.ficha.id, x]));
    expect([por.velha.dias, por.velha.itens, por.velha.link]).toEqual([56, 0, 'Sem link']);
    expect([por.media.dias, por.media.itens, por.media.link]).toEqual([14, 1, 'Link vencido']);
    expect([por.nova.dias, por.nova.itens, por.nova.link]).toEqual([1, 2, 'Link válido']);
    expect(por.mt.link).toBe('Link válido');
    expect(por.noite.criadaEm).toBe('2026-10-28');
  });

  it('só os estados pedidos entram', () => {
    expect(calcularPendentes(fichas, itens, tokens, ['MT'], agora).map(x => x.ficha.id)).toEqual(['mt']);
  });

  it('monta o e-mail com resumo, fichas sem itens e planilha', () => {
    const ufs = ['DF', 'GO', 'MT'];
    const m = montarEmailPendentes(calcularPendentes(fichas, itens, tokens, ufs, agora), ufs, agora);
    expect(m.fichas).toBe(5);
    expect(m.antigas).toBe(2);      // velha (56 dias) e media (14 dias)
    expect(m.semItens).toBe(1);
    expect(m.assunto).toBe('Fichas pendentes de assinatura — 29/10/2026 — 5 ficha(s)');
    expect(m.html).toContain('Samuel &lt;Teste&gt;');
    expect(m.html).toContain('sem nenhum item');
    expect(m.anexo.nome).toBe('fichas-pendentes-2026-10-29.xlsx');
    expect(m.anexo.base64.length).toBeGreaterThan(100);
  });

  it('relatório de um estado leva a UF no assunto e no anexo', () => {
    const m = montarEmailPendentes(calcularPendentes(fichas, itens, tokens, ['MT'], agora), ['MT'], agora);
    expect(m.assunto).toBe('Fichas pendentes de assinatura — MT — 29/10/2026 — 1 ficha(s)');
    expect(m.anexo.nome).toBe('fichas-pendentes-mt-2026-10-29.xlsx');
  });

  it('sem pendentes, avisa no e-mail', () => {
    const m = montarEmailPendentes([], ['DF'], agora);
    expect(m.fichas).toBe(0);
    expect(m.html).toContain('Nenhuma ficha pendente');
  });
});
