import { describe, it, expect } from 'vitest';
import { faltaTamanho, itensDoKit, postoCadastrado, admitidoDaSenior } from '@/services/integracaoService';
import type { EPI } from '@/services/estoqueService';
import type { Posto } from '@/services/postosService';
import type { ColaboradorLista } from '@/services/colaboradoresSeniorService';

const epi = (id: string, nome: string, tipo: 'epi' | 'uniforme') => ({ id, nome, tipo, ca_numero: tipo === 'epi' ? '123' : null } as EPI);

describe('integração (admissão)', () => {
  it('itens do kit vêm com o tipo do catálogo (separa EPI de uniforme)', () => {
    const itens = itensDoKit([
      { id: 'v1', funcao_id: 'k', epi_id: 'a', quantidade: 2, tamanho: null },
      { id: 'v2', funcao_id: 'k', epi_id: 'b', quantidade: 1, tamanho: '42' },
      { id: 'v3', funcao_id: 'k', epi_id: 'fora', quantidade: 1, tamanho: null },
    ], [epi('a', 'Calça', 'uniforme'), epi('b', 'Bota', 'epi')]);
    expect(itens.map(i => [i.nome, i.tipo, i.quantidade, i.tamanho])).toEqual([['Calça', 'uniforme', 2, ''], ['Bota', 'epi', 1, '42']]);
  });

  it('exige tamanho só de item controlado por tamanho', () => {
    const itens = itensDoKit([
      { id: 'v1', funcao_id: 'k', epi_id: 'a', quantidade: 1, tamanho: null },
      { id: 'v2', funcao_id: 'k', epi_id: 'c', quantidade: 1, tamanho: null },
    ], [epi('a', 'Calça', 'uniforme'), epi('c', 'Protetor', 'epi')]);
    expect(faltaTamanho(itens, { a: ['P', 'M', 'G'], c: ['ÚNICO'] }).map(i => i.nome)).toEqual(['Calça']);
  });

  it('posto pelo posto de trabalho da Senior, casando com o cadastro', () => {
    const postos = [{ nome: 'IDP Norte', apelidos: [], uf: 'DF' } as unknown as Posto];
    expect(postoCadastrado(postos, 'IDP NORTE - AGENTE DE PORTARIA - DIU 12')).toEqual({ nome: 'IDP Norte', uf: 'DF' });
    expect(postoCadastrado([], 'SESI GAMA - ASG')).toEqual({ nome: 'SESI GAMA' });
  });

  it('dados da ficha a partir da Senior: empresa pela matrícula e turno pela escala', () => {
    const a = admitidoDaSenior({
      num_emp: 3, num_cad: 3009888, nome: 'ADEILTON', cpf: '01234567890', cargo: 'AGENTE DE PORTARIA', uf: 'DF',
      posto_descricao: '0003-0001-IDP NORTE - AGENTE DE PORTARIA', escala_nome: '19:00 - 07:00 12X36',
    } as ColaboradorLista, [], 'GRUPO 5 ESTRELAS');
    expect(a).toMatchObject({ empresa: 'APOIO', turno: 'noturno', posto: 'IDP NORTE', cpf: '012.345.678-90', funcao: 'AGENTE DE PORTARIA' });
  });
});
