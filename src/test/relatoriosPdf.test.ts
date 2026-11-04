import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { gastoTeto } from '@/modules/pedidos/lib/gerencial';
import { definirLogo, pdfConsumo, pdfPedidosDoMes, pdfPedidosDoPosto, pdfTetoPorPosto } from '@/modules/pedidos/lib/relatoriosPdf';
import { consumoDoDia, consumoDoPeriodo, diasDoPeriodo, type PlantaoComItens } from '@/modules/pedidos/lib/consumo';
import type { Material, PedidoCompleto, StatusPedido } from '@/modules/pedidos/lib/pedidosService';

const materiais: Material[] = [
  { id: 'agua', nome: 'ÁGUA SANITÁRIA 12X1LT YPE', item_pai_id: null, unidade: 'cx', categoria: null, is_epi: false, ativo: true, preco: 38.9 },
  { id: 'alc', nome: 'ALCOOL GEL 05LT ANTI-SEPTICO ALL CLEAN', item_pai_id: null, unidade: 'galão', categoria: null, is_epi: false, ativo: true, preco: 46.5 },
  { id: 'pap', nome: 'PAPEL HIG.FD. DUETTO NEUTRO C/30M L16P15', item_pai_id: null, unidade: 'fardo', categoria: null, is_epi: false, ativo: true, preco: 52.4 },
  { id: 'luva', nome: 'LUVA FORRADA AMAR VERNIZ TM M VOLK', item_pai_id: null, unidade: 'par', categoria: null, is_epi: true, ativo: true, preco: 6.5 },
  { id: 'rodo', nome: 'RODO 60CM', item_pai_id: null, unidade: 'un', categoria: null, is_epi: false, ativo: true, preco: null },
];
const STATUS: StatusPedido[] = ['atendida', 'atendida', 'atendida', 'a_atender', 'enviada', 'atendida', 'cancelada'];
let seq = 0;
const pedido = (posto_id: string, dia: number, fator: number): PedidoCompleto => {
  const id = String(++seq);
  const status = STATUS[seq % STATUS.length];
  const itens = [
    { id: id + 'a', pedido_id: id, material_id: 'agua', quantidade_pedida: 4 * fator, quantidade: 4 * fator, quantidade_atendida: status === 'atendida' ? 4 * fator : null, preco_unit: 38.9 },
    { id: id + 'c', pedido_id: id, material_id: 'alc', quantidade_pedida: 2 * fator, quantidade: 2 * fator, quantidade_atendida: status === 'atendida' ? 2 * fator - 1 : null, preco_unit: 46.5 },
    { id: id + 'p', pedido_id: id, material_id: 'pap', quantidade_pedida: 3, quantidade: 3, quantidade_atendida: status === 'atendida' ? 3 : null, preco_unit: 52.4 },
    { id: id + 'l', pedido_id: id, material_id: 'luva', quantidade_pedida: 12, quantidade: 10, quantidade_atendida: status === 'atendida' ? 10 : null, preco_unit: 6.5 },
    ...(seq % 4 === 0 ? [{ id: id + 'r', pedido_id: id, material_id: 'rodo', quantidade_pedida: 2, quantidade: 2, quantidade_atendida: null, preco_unit: null }] : []),
  ];
  return {
    id, codigo: `SOL-2026-${id.padStart(6, '0')}`, ano: 2026, numero: seq, posto_id, uf: 'DF', recorrencia_id: null,
    data_pedido: `2026-10-${String(dia).padStart(2, '0')}`, status, tem_epi: true, conferida_em: null, atendida_em: null,
    observacao: null, solicitante_nome: ['MARIA APARECIDA SOUZA', 'JOSÉ CARLOS LIMA', 'ANA PAULA FERREIRA'][seq % 3], solicitante_matricula: String(2002200 + seq),
    solicitante_cargo: null, solicitante_telefone: null, created_at: '2026-10-01T10:00:00Z', eventos: [], itens,
    valor_total: Math.round(itens.reduce((s, i) => s + i.quantidade * (i.preco_unit ?? 0), 0) * 100) / 100, sem_preco: itens.some(i => i.preco_unit == null),
  };
};
const postos = [
  { id: 'a', nome: 'ARMANDO MONTEIRO', uf: 'DF', teto_material: 2400 },
  { id: 'b', nome: 'CRESM (CREDEQ)', uf: 'GO', teto_material: 5200 },
  { id: 'c', nome: 'EMBAIXADA DA ITÁLIA', uf: 'DF', teto_material: 2600 },
  { id: 'd', nome: 'SESI LAB', uf: 'DF', teto_material: 6000 },
  { id: 'e', nome: 'CNI (EAN e ERS)', uf: 'DF', teto_material: null },
];
const pedidos = [
  ...[2, 6, 10, 15, 21, 27].map((d, i) => pedido('a', d, 1 + (i % 2))),
  ...[3, 9, 17, 24].map(d => pedido('b', d, 2)),
  ...[5, 12, 20, 29].map(d => pedido('c', d, 1)),
  ...[8, 22].map(d => pedido('d', d, 2)),
  ...[4, 18].map(d => pedido('e', d, 1)),
];

const SAIDA = process.env.PDF_SAIDA;
describe('relatórios em PDF', () => {
  it('teto x gasto, pedidos do posto e pedidos do mês geram PDF', async () => {
    try { definirLogo('data:image/jpeg;base64,' + readFileSync('src/modules/crachas/assets/logo-5estrelas.jpg').toString('base64')); }
    catch { definirLogo(null); }
    const t = await pdfTetoPorPosto(gastoTeto(pedidos, postos, '2026-10'), '2026-10', 'todos', false);
    const p = await pdfPedidosDoPosto(postos[0], pedidos.filter(x => x.posto_id === 'a'), materiais, '2026-10', false);
    const m = await pdfPedidosDoMes(pedidos, postos, materiais, '2026-10', 'todos', false);
    for (const [nome, doc] of [['teto', t], ['posto', p], ['mes', m]] as const) {
      const bytes = doc.output('arraybuffer');
      expect(bytes.byteLength).toBeGreaterThan(2000);
      if (SAIDA) writeFileSync(`${SAIDA}/rel-${nome}.pdf`, Buffer.from(bytes));
    }
    expect(p.getNumberOfPages()).toBeGreaterThan(1);
  });
});

describe('relatório de consumo em PDF', () => {
  it('diário, quinzenal e mensal', async () => {
    const ids = materiais.map(m => m.id);
    const saldo = ids.map(() => 30);
    const plantoes: PlantaoComItens[] = [];
    for (let d = 1; d <= 31; d++) {
      if (d % 7 === 4) continue;
      const dia = `2026-10-${String(d).padStart(2, '0')}`;
      const itens = ids.map((m, k) => {
        const ini = saldo[k]; const rec = ini < 6 ? 24 : 0; const uso = Math.min(ini + rec, (d * (k + 3)) % 7);
        saldo[k] = ini + rec - uso;
        return { plantao_id: dia, material_id: m, qtd_inicio: ini, qtd_recebida: rec, qtd_usada: uso, qtd_fim: saldo[k], diferenca: 0 };
      });
      plantoes.push({ id: dia, posto_id: 'a', uf: 'DF', status: 'fechado', aberto_em: `${dia}T10:00:00-03:00`, aberto_por_nome: null, fechado_em: null,
        fechado_por_nome: null, observacao_inicio: null, observacao_fim: null, assinatura: null, declaracao_aceita_em: null, tem_diferenca: false, itens });
    }
    const nome = (id: string) => materiais.find(m => m.id === id)!.nome;
    const unidade = (id: string) => materiais.find(m => m.id === id)!.unidade;
    const posto = { nome: 'ARMANDO MONTEIRO', uf: 'DF' };
    for (const [tipo, dias, rotulo] of [
      ['dia', ['2026-10-15'], '15/10/2026'], ['quinzena', diasDoPeriodo('quinzena', '2026-10-01', 2), '2ª quinzena de 10/2026 (16/10 a 31/10)'],
      ['mes', diasDoPeriodo('mes', '2026-10-01'), '10/2026'],
    ] as const) {
      const doc = await pdfConsumo({ posto, tipo, rotulo, dias: [...dias], doDia: consumoDoDia(plantoes, dias[0]), periodo: consumoDoPeriodo(plantoes, [...dias]), nome, unidade }, false);
      const bytes = doc.output('arraybuffer');
      expect(bytes.byteLength).toBeGreaterThan(2000);
      if (SAIDA) writeFileSync(`${SAIDA}/consumo-${tipo}.pdf`, Buffer.from(bytes));
    }
  });
});
