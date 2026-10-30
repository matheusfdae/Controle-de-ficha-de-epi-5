import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileCode2, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { parseNFeXml } from '@/lib/nfe';
import { formatarCnpj } from '@/lib/cnpj';
import { listFornecedores, type Fornecedor } from '@/services/fornecedoresService';
import {
  codigosDoFornecedor, converterEmbalagem, formatarMoeda, formatarNumero, hojeBr, numeroPedido, registrarCompra,
  sugerirMaterial, type Material, type PedidoCompleto,
} from '../lib/pedidosService';

/**
 * Nota da compra (do pedido aprovado ou avulsa): fornecedor, NF, data e o
 * preço pago em cada item. Pode vir do XML da NF-e: o código do produto de
 * cada fornecedor fica lembrado (material e embalagem) para a próxima nota.
 */

interface ItemNota { codigo: string; descricao: string; unidade: string; quantidade: number; valor: number }
interface Linha {
  material_id: string;
  /** Digitado (sem XML), na unidade do material. */
  quantidade: string;
  valor: string;
  /** Veio do XML: quantidade e valor saem da nota e do fator. */
  nota?: ItemNota;
  fator: string;
  lembrado?: boolean;
}

const n = (v: string) => Number(v.replace(',', '.'));
const valores = (l: Linha) => (l.nota
  ? converterEmbalagem(l.nota.quantidade, l.nota.valor, n(l.fator) || 1)
  : { quantidade: n(l.quantidade), valor_unitario: n(l.valor) });

export default function RegistrarCompra({ pedido, materiais, onFechar, onSalvo }: {
  pedido: PedidoCompleto | null; materiais: Material[]; onFechar: () => void; onSalvo: () => Promise<void>;
}) {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [fornecedor, setFornecedor] = useState('');
  const [cnpj, setCnpj] = useState<string | null>(null);
  const [chave, setChave] = useState<string | null>(null);
  const [nf, setNf] = useState('');
  const [data, setData] = useState(hojeBr());
  const [observacao, setObservacao] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>(() => pedido
    ? pedido.itens.map(i => ({
      material_id: i.material_id, quantidade: String(i.quantidade),
      valor: i.preco_estimado != null ? String(i.preco_estimado) : '', fator: '1',
    }))
    : [{ material_id: '', quantidade: '', valor: '', fator: '1' }]);
  const [salvando, setSalvando] = useState(false);
  const inputXml = useRef<HTMLInputElement>(null);

  useEffect(() => { listFornecedores().then(setFornecedores).catch(() => setFornecedores([])); }, []);

  const unidade = (id: string) => materiais.find(m => m.id === id)?.unidade ?? '';
  const total = linhas.reduce((s, l) => { const v = valores(l); return s + (v.quantidade || 0) * (v.valor_unitario || 0); }, 0);

  const importarXml = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    try {
      const nota = parseNFeXml(await arquivo.text());
      if (!nota.itens.length) throw new Error('A nota não tem itens.');
      const doc = nota.fornecedor.cnpj?.replace(/\D/g, '') || null;
      const memoria = doc ? await codigosDoFornecedor(doc) : new Map();
      const cadastrado = doc ? fornecedores.find(f => f.cnpj === doc) : undefined;
      setFornecedor(cadastrado?.nome ?? nota.fornecedor.nome ?? '');
      setCnpj(doc);
      setChave(nota.chave);
      setNf(nota.numero ?? '');
      if (nota.dataEmissao) setData(nota.dataEmissao);
      setLinhas(nota.itens.map(i => {
        const lembrado = memoria.get(i.codigo);
        return {
          material_id: lembrado?.material_id ?? sugerirMaterial(i.descricao, materiais) ?? '',
          quantidade: '', valor: '', fator: String(lembrado?.fator ?? 1).replace('.', ','),
          lembrado: !!lembrado,
          nota: { codigo: i.codigo, descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade, valor: i.valorUnitario ?? 0 },
        };
      }));
      const reconhecidos = nota.itens.filter(i => memoria.has(i.codigo)).length;
      toast.success(`Nota ${nota.numero ?? ''} lida: ${nota.itens.length} item(ns)` +
        (reconhecidos ? `, ${reconhecidos} já conhecido(s) deste fornecedor.` : '. Confira o material de cada item.'));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const mudar = (idx: number, campo: 'material_id' | 'quantidade' | 'valor' | 'fator', v: string) =>
    setLinhas(ls => ls.map((l, j) => (j === idx ? { ...l, [campo]: v } : l)));

  const salvar = async () => {
    if (!fornecedor.trim() && !cnpj) return toast.error('Informe o fornecedor.');
    for (const l of linhas) {
      const v = valores(l);
      if (!l.material_id) return toast.error(l.nota ? `Escolha o material de "${l.nota.descricao}" (ou tire o item).` : 'Escolha o material de todos os itens.');
      if (l.nota && !(n(l.fator) > 0)) return toast.error(`Embalagem inválida em "${l.nota.descricao}".`);
      if (!(v.quantidade > 0) || !(v.valor_unitario >= 0) || (!l.nota && l.valor === '')) {
        return toast.error('Preencha quantidade e valor unitário de todos os itens.');
      }
    }
    const porNome = fornecedores.find(f => f.nome.trim().toLowerCase() === fornecedor.trim().toLowerCase());
    setSalvando(true);
    try {
      await registrarCompra({
        pedidoId: pedido?.id ?? null, fornecedorId: cnpj ? null : porNome?.id ?? null, fornecedorNome: fornecedor.trim(),
        fornecedorCnpj: cnpj, chaveAcesso: chave, numeroNf: nf.trim(), data, observacao,
        itens: linhas.map(l => ({
          material_id: l.material_id, ...valores(l),
          ...(l.nota ? { codigo_fornecedor: l.nota.codigo, descricao_nf: l.nota.descricao, unidade_nf: l.nota.unidade, fator: n(l.fator) } : {}),
        })),
      });
      toast.success('Compra registrada.');
      await onSalvo();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  // Itens do pedido que não aparecem na nota (atendimento parcial).
  const faltando = pedido ? pedido.itens.filter(i => !linhas.some(l => l.material_id === i.material_id)) : [];
  const temNota = linhas.some(l => l.nota);

  return (
    <Dialog open onOpenChange={o => !o && onFechar()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pedido ? `Compra do ${numeroPedido(pedido.numero)}` : 'Registrar compra avulsa'}</DialogTitle>
          <DialogDescription>Os valores unitários desta nota entram no relatório de variação de preço.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <input ref={inputXml} type="file" accept=".xml,text/xml,application/xml" className="hidden" onChange={importarXml} />
          <Button variant="outline" className="gap-2" onClick={() => inputXml.current?.click()}>
            <FileCode2 className="h-4 w-4" /> Importar XML da NF-e
          </Button>
          <span className="text-xs text-muted-foreground">ou preencha à mão abaixo.</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <Label htmlFor="forn">Fornecedor *</Label>
            <Input id="forn" list="lista-fornecedores" value={fornecedor} onChange={e => { setFornecedor(e.target.value); if (!temNota) setCnpj(null); }} />
            <datalist id="lista-fornecedores">{fornecedores.map(f => <option key={f.id} value={f.nome} />)}</datalist>
            {cnpj && <p className="text-xs text-muted-foreground mt-1">CNPJ {formatarCnpj(cnpj)}</p>}
          </div>
          <div>
            <Label htmlFor="nf">Nº da nota</Label>
            <Input id="nf" value={nf} onChange={e => setNf(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="data-compra">Data da compra *</Label>
            <Input id="data-compra" type="date" value={data} max={hojeBr()} onChange={e => setData(e.target.value)} />
          </div>
          {chave && <div className="text-xs text-muted-foreground self-end pb-2 break-all">Chave {chave}</div>}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              {temNota && <TableHead>Na nota</TableHead>}
              <TableHead>Material</TableHead>
              {temNota && <TableHead className="w-36">Embalagem</TableHead>}
              <TableHead className="w-28 text-right">Qtd.</TableHead>
              <TableHead className="w-32 text-right">Valor unit. (R$)</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l, idx) => {
              const v = valores(l);
              return (
                <TableRow key={idx}>
                  {temNota && (
                    <TableCell className="text-xs max-w-[14rem]">
                      {l.nota ? <>
                        <span className="block font-medium">{l.nota.descricao}</span>
                        <span className="text-muted-foreground">
                          cód. {l.nota.codigo} · {formatarNumero(l.nota.quantidade)} {l.nota.unidade} × {formatarMoeda(l.nota.valor)}
                        </span>
                      </> : <span className="text-muted-foreground">digitado</span>}
                    </TableCell>
                  )}
                  <TableCell>
                    <Select value={l.material_id || undefined} onValueChange={val => mudar(idx, 'material_id', val)}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Material" /></SelectTrigger>
                      <SelectContent>{materiais.filter(m => m.ativo || m.id === l.material_id).map(m =>
                        <SelectItem key={m.id} value={m.id}>{m.nome} ({m.unidade})</SelectItem>)}</SelectContent>
                    </Select>
                    {l.lembrado && <span className="text-[11px] text-muted-foreground">lembrado das notas anteriores</span>}
                  </TableCell>
                  {temNota && (
                    <TableCell>
                      {l.nota ? (
                        <div className="flex items-center gap-1 text-xs whitespace-nowrap">
                          1 {l.nota.unidade} =
                          <Input className="h-8 w-16 text-right" inputMode="decimal" aria-label="Unidades do material por unidade da nota"
                            value={l.fator} onChange={e => mudar(idx, 'fator', e.target.value.replace(/[^\d.,]/g, ''))} />
                          {unidade(l.material_id) || 'un'}
                        </div>
                      ) : null}
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    {l.nota ? <span className="tabular-nums">{formatarNumero(v.quantidade || 0)}</span> : (
                      <Input className="h-8 text-right" inputMode="decimal" value={l.quantidade}
                        onChange={e => mudar(idx, 'quantidade', e.target.value.replace(/[^\d.,]/g, ''))} />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {l.nota ? <span className="tabular-nums">{formatarMoeda(v.valor_unitario || 0)}</span> : (
                      <Input className="h-8 text-right" inputMode="decimal" value={l.valor}
                        onChange={e => mudar(idx, 'valor', e.target.value.replace(/[^\d.,]/g, ''))} />
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" aria-label="Tirar item" disabled={linhas.length === 1}
                      onClick={() => setLinhas(ls => ls.filter((_, j) => j !== idx))}><X className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {temNota && (
          <p className="text-xs text-muted-foreground">
            Embalagem: quantas unidades do material vêm em 1 unidade da nota (ex.: 1 CX = 12 un). A quantidade e o preço
            são convertidos para a unidade do material, para comparar com as compras anteriores. Itens da nota que não são
            do pedido podem ser tirados no X.
          </p>
        )}
        {faltando.length > 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Itens do pedido que não estão nesta compra: {faltando.map(i => materiais.find(m => m.id === i.material_id)?.nome ?? '?').join(', ')}.
          </p>
        )}
        <div className="flex justify-between items-center">
          <Button variant="outline" size="sm" onClick={() => setLinhas(ls => [...ls, { material_id: '', quantidade: '', valor: '', fator: '1' }])}>Adicionar item</Button>
          <p className="text-sm">Total: <strong className="tabular-nums">{formatarMoeda(total)}</strong></p>
        </div>
        <div>
          <Label htmlFor="obs-compra">Observação</Label>
          <Textarea id="obs-compra" rows={2} value={observacao} onChange={e => setObservacao(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="gap-2">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Registrar compra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
