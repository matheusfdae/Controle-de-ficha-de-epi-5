import { describe, it, expect } from 'vitest';
import { cruzarComFichas, type ColaboradorLista } from '@/services/colaboradoresSeniorService';
import { ufDoColaborador } from '../../supabase/functions/_shared/senior';
import type { EPIFicha } from '@/types/epi';

const colab = (id: string, num_cad: number, nome: string, cpf: string | null) =>
  ({ id, num_cad, nome, cpf } as ColaboradorLista);
const ficha = (p: Partial<EPIFicha>) =>
  ({ cpf: '', matricula: '', nomeFuncionario: '', dataEntrega: '2026-01-01', status: 'assinada', ...p } as EPIFicha);

describe('cruzarComFichas', () => {
  it('liga pelo CPF (com ou sem máscara), pela matrícula e pelo nome', () => {
    const colabs = [
      colab('a', 1000514, 'ABSAIR JUNIO', '01234567890'),
      colab('b', 3008990, 'MARIA DA SILVA', '98765432100'),
      colab('c', 1000999, 'JOSÉ SOUZA', '11122233344'),
      colab('d', 1000777, 'SEM FICHA NENHUMA', '55566677788'),
    ];
    const { porColaborador: r, fichasSemColaborador, ligadasPor } = cruzarComFichas(colabs, [
      ficha({ cpf: '012.345.678-90', dataEntrega: '2026-03-10' }),
      ficha({ cpf: '1234567890', dataEntrega: '2026-05-02', status: 'pendente' }),
      ficha({ matricula: '3008990' }),
      ficha({ nomeFuncionario: 'Jose Souza' }),
      ficha({ cpf: '999.999.999-99', matricula: '1000514' }), // CPF errado: liga pela matrícula
      ficha({ nomeFuncionario: 'TERCEIRIZADO X', cpf: '44455566677' }),
    ]);
    expect(fichasSemColaborador.map(f => f.nomeFuncionario)).toEqual(['TERCEIRIZADO X']);
    expect(ligadasPor).toEqual({ cpf: 2, matricula: 2, nome: 1 });
    expect(r.get('a')).toEqual({ quantidade: 3, ultima: '2026-05-02', pendentes: 1 });
    expect(r.get('b')?.quantidade).toBe(1);
    expect(r.get('c')?.quantidade).toBe(1);
    expect(r.get('d')).toEqual({ quantidade: 0, ultima: null, pendentes: 0 });
  });
});

describe('ufDoColaborador', () => {
  it('usa a filial e, se for desconhecida, a sigla no local', () => {
    expect(ufDoColaborador({ numEmp: 1, codFil: 2, nomeLocal: 'X' })).toBe('GO');
    expect(ufDoColaborador({ numEmp: 1, codFil: 15, nomeLocal: null })).toBe('MT');
    expect(ufDoColaborador({ numEmp: 3, codFil: 1, nomeLocal: 'RESERVA DF' })).toBe('DF');
    expect(ufDoColaborador({ numEmp: 3, codFil: 9, nomeLocal: 'POSTO NOVO - SP' })).toBe('SP');
    expect(ufDoColaborador({ numEmp: 3, codFil: 9, nomeLocal: 'SEM SIGLA' })).toBeNull();
  });
});

import { nomePostoTrabalho, turnoDaEscala } from '../../supabase/functions/_shared/senior';
import { limparNomePosto } from '@/lib/geoPlanilha';

describe('posto de trabalho e escala da Senior', () => {
  it('tira o "empresa-filial-" e a função do nome do posto', () => {
    const limpo = (d: string) => limparNomePosto(nomePostoTrabalho(d));
    expect(limpo('0003-0001-IDP NORTE - AGENTE DE PORTARIA - DIU 12 - C/INTRA')).toBe('IDP NORTE');
    expect(limpo('026-0001 - MATERNIDADE NOSSA SENHORA - AUXILIAR DE SERVIÇOS -12H DIU- S/INTRA')).toBe('MATERNIDADE NOSSA SENHORA');
    expect(limpo('0003-0001- SESI GAMA - AUX SERV 06:30 AS 15:30 6X1 S/I')).toBe('SESI GAMA');
    expect(limpo('0001-0001-SHOPPING IGUATEMI - VIG - 12X36 DIU - S/I')).toBe('SHOPPING IGUATEMI');
    expect(nomePostoTrabalho(null)).toBe('');
  });

  it('turno pela hora de entrada da escala', () => {
    expect(turnoDaEscala('07:00 - 19:00 C/ INTRA - 12X36')).toBe('diurno');
    expect(turnoDaEscala('19:00 - 07:00 S/INTRA - 12X36')).toBe('noturno');
    expect(turnoDaEscala('22H00 06H00')).toBe('noturno');
    expect(turnoDaEscala('ESCALA NOT')).toBe('noturno');
    expect(turnoDaEscala(null)).toBeNull();
  });
});
