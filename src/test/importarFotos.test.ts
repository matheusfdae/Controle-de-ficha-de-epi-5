import { describe, expect, it, vi } from 'vitest';
import { readdirSync, existsSync } from 'fs';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
const { casarFotos, lerNomeArquivo } = await import('@/modules/crachas/lib/importarFotos');

const arq = (nome: string) => new File([''], nome, { type: 'image/jpeg' });
const colab = (id: string, employee_id: string, full_name: string, o: { foto?: string; desligado?: boolean } = {}) =>
  ({ id, employee_id, full_name, photo_url: o.foto ?? null, desligado_em: o.desligado ? '2026-01-01' : null });

describe('lerNomeArquivo', () => {
  it('matrícula sem zeros, nome e variante', () => {
    expect(lerNomeArquivo(arq('002002233_VALDEIR_ALVES_DOS_SANTOS.jpg'))).toMatchObject({ matricula: '2002233', nome: 'VALDEIR ALVES DOS SANTOS', variante: 1 });
    expect(lerNomeArquivo(arq('000000000_Maria_das_Dores_Ferreira_2.png'))).toMatchObject({ matricula: null, nome: 'Maria das Dores Ferreira', variante: 2 });
  });
});

describe('casarFotos', () => {
  const lista = [
    colab('a', '2002233', 'Valdeir Alves dos Santos'),
    colab('b', '555', 'Maria das Dores Ferreira', { foto: '/x.jpg' }),
    colab('c', '777', 'José da Silva'), colab('d', '778', 'JOSE DA SILVA'),
    colab('e', '906', 'Carlos Roberto', { desligado: true }), colab('f', '906', 'Carlos Roberto Serafim de Souza'),
    colab('g', '901', 'Keity Neves Nobre'),
  ];
  const r = casarFotos([
    arq('002002233_VALDEIR_ALVES_DOS_SANTOS.jpg'),
    arq('000000000_Maria_das_Dores_Ferreira.png'), arq('000000000_Maria_das_Dores_Ferreira_2.png'),
    arq('000_Jose_da_Silva.jpg'), arq('0000906_CARLOS_ROBERTO_SERAFIM_DE_SOUZA.png'),
    arq('123_Ninguem_Aqui.jpg'), arq('Thumbs.db'), arq('Atribuida_pelo_RH_Keity_Neves_Nobre.png'),
  ], lista);
  it('prefixo antes do nome: acha pelo nome no fim do arquivo', () => {
    expect(r.casadas.find(c => c.colaborador.id === 'g')).toMatchObject({ como: 'nome' });
  });
  it('pela matrícula, desempatando pelo nome', () => {
    const por = Object.fromEntries(r.casadas.map(c => [c.foto.arquivo.name, [c.colaborador.id, c.como]]));
    expect(por['002002233_VALDEIR_ALVES_DOS_SANTOS.jpg']).toEqual(['a', 'matricula']);
    expect(por['0000906_CARLOS_ROBERTO_SERAFIM_DE_SOUZA.png']).toEqual(['f', 'matricula']);
  });
  it('matrícula zerada: pelo nome (sem acento); a "_2" fica como repetida', () => {
    expect(r.casadas.find(c => c.colaborador.id === 'b')?.foto.arquivo.name).toBe('000000000_Maria_das_Dores_Ferreira.png');
    expect(r.repetidas.map(c => c.foto.arquivo.name)).toEqual(['000000000_Maria_das_Dores_Ferreira_2.png']);
  });
  it('nome de duas pessoas não entra; sem colaborador e não-foto ficam de fora', () => {
    expect(r.ambiguas.map(f => f.arquivo.name)).toEqual(['000_Jose_da_Silva.jpg']);
    expect(r.semColaborador.map(f => f.arquivo.name)).toEqual(['123_Ninguem_Aqui.jpg']);
    expect(r.ignorados.map(f => f.name)).toEqual(['Thumbs.db']);
  });
});

const PASTA = 'C:/Users/controle/Desktop/fotos-colaboradores-2026-11-03';
describe.runIf(existsSync(PASTA))('pasta real', () => {
  it('lê todos os nomes', () => {
    const lidas = readdirSync(PASTA).map(n => lerNomeArquivo(arq(n)));
    const semMatricula = lidas.filter(l => !l.matricula);
    const variantes = lidas.filter(l => l.variante > 1);
    console.log(`arquivos ${lidas.length}; com matrícula ${lidas.length - semMatricula.length}; sem ${semMatricula.length}; variantes ${variantes.length}`);
    console.log('exemplos sem matrícula:', semMatricula.slice(0, 5).map(l => l.arquivo.name));
    console.log('exemplos variantes:', variantes.slice(0, 5).map(l => l.arquivo.name));
    console.log('nomes vazios:', lidas.filter(l => !l.nome).map(l => l.arquivo.name));
  });
});
