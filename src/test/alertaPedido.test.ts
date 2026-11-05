import { describe, expect, it } from 'vitest';
import { alertaDeHoje, aplicarAjustes, contatosDoPosto, jaPediu, mensagemAlerta, previstaNoMes, proximaPrevista, ultimoPedido } from '../../supabase/functions/_shared/alertaPedido';

describe('data prevista', () => {
  it('mês mais curto usa o último dia', () => {
    expect(previstaNoMes(31, 2026, 2)).toBe('2026-02-28');
    expect(previstaNoMes(30, 2028, 2)).toBe('2028-02-29');
    expect(previstaNoMes(10, 2026, 11)).toBe('2026-11-10');
  });
  it('próxima: este mês se ainda não passou; senão o mês seguinte (virando o ano)', () => {
    expect(proximaPrevista(25, '2026-11-05')).toBe('2026-11-25');
    expect(proximaPrevista(5, '2026-11-05')).toBe('2026-11-05');
    expect(proximaPrevista(3, '2026-11-05')).toBe('2026-12-03');
    expect(proximaPrevista(3, '2026-12-20')).toBe('2027-01-03');
  });
  it('alerta 2 dias antes e no dia; nos outros dias, nada', () => {
    expect(alertaDeHoje(25, '2026-11-23')).toEqual({ data: '2026-11-25', momento: 'antes' });
    expect(alertaDeHoje(25, '2026-11-25')).toEqual({ data: '2026-11-25', momento: 'dia' });
    expect(alertaDeHoje(25, '2026-11-24')).toBeNull();
    expect(alertaDeHoje(null, '2026-11-25')).toBeNull();
    // dia 1: o "antes" cai no mês anterior
    expect(alertaDeHoje(1, '2026-11-29')).toEqual({ data: '2026-12-01', momento: 'antes' });
    // dia 31 em fevereiro: data prevista 28/02, aviso em 26/02
    expect(alertaDeHoje(31, '2026-02-26')).toEqual({ data: '2026-02-28', momento: 'antes' });
  });
});

describe('quem recebe', () => {
  it('já pediu: pedido não cancelado de (data - 5) até hoje', () => {
    expect(jaPediu([{ data_pedido: '2026-11-21', status: 'enviada' }], '2026-11-25', '2026-11-25')).toBe(true);
    expect(jaPediu([{ data_pedido: '2026-11-19', status: 'atendida' }], '2026-11-25', '2026-11-25')).toBe(false);
    expect(jaPediu([{ data_pedido: '2026-11-22', status: 'cancelada' }], '2026-11-25', '2026-11-25')).toBe(false);
  });
  it('um por celular válido, nome do pedido mais recente, só dos últimos 90 dias', () => {
    const c = contatosDoPosto([
      { solicitante_nome: 'MARIA SOUZA', solicitante_telefone: '(61) 99999-1111', data_pedido: '2026-10-01' },
      { solicitante_nome: 'Maria Aparecida Souza', solicitante_telefone: '61999991111', data_pedido: '2026-11-01' },
      { solicitante_nome: 'José', solicitante_telefone: '(61) 3333-4444', data_pedido: '2026-11-02' },
      { solicitante_nome: 'Antigo', solicitante_telefone: '61988887777', data_pedido: '2026-06-01' },
      { solicitante_nome: 'Ana', solicitante_telefone: null, data_pedido: '2026-11-03' },
    ], '2026-11-05');
    expect(c).toEqual([{ chave: '5561999991111', nome: 'Maria Aparecida Souza', numero: '5561999991111', ultimo: '2026-11-01', origem: 'link' }]);
  });
  it('celular da Senior primeiro; sem celular lá, o digitado; uma linha por pessoa da Senior', () => {
    const c = contatosDoPosto([
      { solicitante_nome: 'Ana', solicitante_telefone: '61988881111', data_pedido: '2026-11-03', solicitante_senior_id: 's1', senior_telefone: '(61) 99777-2222' },
      { solicitante_nome: 'Ana', solicitante_telefone: '61988881111', data_pedido: '2026-10-20', solicitante_senior_id: 's1', senior_telefone: '(61) 99777-2222' },
      { solicitante_nome: 'Bruno', solicitante_telefone: '61966663333', data_pedido: '2026-11-02', solicitante_senior_id: 's2', senior_telefone: '(61) 3333-4444' },
    ], '2026-11-05');
    expect(c.map(x => [x.chave, x.numero, x.origem])).toEqual([['s1', '5561997772222', 'senior'], ['s2', '5561966663333', 'link']]);
  });
  it('ajustes: corrigir, tirar da lista e adicionar', () => {
    const base = contatosDoPosto([
      { solicitante_nome: 'Ana', solicitante_telefone: '61988881111', data_pedido: '2026-11-03', solicitante_senior_id: 's1' },
      { solicitante_nome: 'Bruno', solicitante_telefone: '61966663333', data_pedido: '2026-11-02', solicitante_senior_id: 's2' },
    ], '2026-11-05');
    const r = aplicarAjustes(base, [
      { id: 'a1', acao: 'corrigir', chave: 's1', nome: 'Ana', numero: '5561911112222' },
      { id: 'a2', acao: 'remover', chave: 's2', nome: 'Bruno', numero: null },
      { id: 'a3', acao: 'adicionar', chave: null, nome: 'Carla', numero: '5561933334444' },
    ]);
    expect(r.recebem.map(x => [x.nome, x.numero, x.origem])).toEqual([['Ana', '5561911112222', 'corrigido'], ['Carla', '5561933334444', 'manual']]);
    expect(r.removidos.map(x => x.nome)).toEqual(['Bruno']);
  });
});

describe('mensagem', () => {
  it('antes e no dia, com o link do pedido', () => {
    const antes = mensagemAlerta({ nome: 'MARIA APARECIDA', posto: 'ARMANDO MONTEIRO', data: '2026-11-25', momento: 'antes', link: 'https://epi.exemplo.com.br/' });
    expect(antes).toContain('Olá, Maria!');
    expect(antes).toContain('*ARMANDO MONTEIRO* está previsto para *25/11/2026*');
    expect(antes).toContain('https://epi.exemplo.com.br/pedido-material');
    expect(antes).toContain('Salve este número nos seus contatos para o link ficar clicável');
    const dia = mensagemAlerta({ nome: '', posto: 'CNI', data: '2026-11-25', momento: 'dia', link: null });
    expect(dia).toContain('Olá!');
    expect(dia).toContain('é *hoje (25/11/2026)*');
  });
  it('cita o último pedido do posto (não cancelado), se houver', () => {
    const ultimo = ultimoPedido([
      { codigo: 'SOL-2026-000012', data_pedido: '2026-10-03', status: 'atendida' },
      { codigo: 'SOL-2026-000015', data_pedido: '2026-10-20', status: 'cancelada' },
      { codigo: 'SOL-2026-000009', data_pedido: '2026-09-02', status: 'atendida' },
    ]);
    expect(ultimo).toEqual({ codigo: 'SOL-2026-000012', data: '2026-10-03' });
    expect(mensagemAlerta({ nome: 'Ana', posto: 'CNI', data: '2026-11-25', momento: 'antes', link: null, ultimo }))
      .toContain('Último pedido deste posto: *SOL-2026-000012*, feito em 03/10/2026.');
    expect(mensagemAlerta({ nome: 'Ana', posto: 'CNI', data: '2026-11-25', momento: 'antes', link: null })).not.toContain('Último pedido');
    expect(ultimoPedido([])).toBeNull();
  });
  it('envio pelo botão: com a próxima data, ou sem data prevista', () => {
    expect(mensagemAlerta({ nome: 'Ana', posto: 'CNI', data: '2026-11-25', momento: 'manual', link: null })).toContain('está previsto para *25/11/2026*');
    expect(mensagemAlerta({ nome: 'Ana', posto: 'CNI', data: null, momento: 'manual', link: null })).toContain('*CNI* precisa ser feito.');
  });
});
