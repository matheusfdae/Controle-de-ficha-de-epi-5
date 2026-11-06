import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDown, ChevronRight, Link2, Loader2, Receipt, RefreshCw, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { listMateriais, nomeMaterial, reais, type Material } from '../lib/pedidosService';
import {
  formatarCnpj, ligarItem, listarEmpresasSefaz, listarItensSefaz, listarLigacoes, listarNotasSefaz, produtosSemLigacao,
  type EmpresaSefaz, type ItemNotaSefaz, type Ligacao, type NotaSefaz, type ProdutoSemLigacao,
} from '../lib/sefazService';

const data = (s: string | null) => s ? new Date(s).toLocaleDateString('pt-BR') : '—';
const dataHora = (s: string | null) => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const lerFator = (s: string) => { const n = Number(s.replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };

/**
 * Notas de compra que o robô da VM puxa da SEFAZ (deploy/producao/sefaz). Cada produto
 * do fornecedor é ligado uma vez a um material; daí em diante a nota mais recente
 * vira o preço do material (o do teto de gasto). Não mexe no estoque.
 */
export default function NotasSefaz({ podeEditar }: { podeEditar: boolean }) {
  const [empresas, setEmpresas] = useState<EmpresaSefaz[]>([]);
  const [notas, setNotas] = useState<NotaSefaz[]>([]);
  const [itens, setItens] = useState<ItemNotaSefaz[]>([]);
  const [ligacoes, setLigacoes] = useState<Ligacao[]>([]);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [e, n, l, m] = await Promise.all([listarEmpresasSefaz(), listarNotasSefaz(), listarLigacoes(), listMateriais()]);
      setEmpresas(e); setNotas(n); setLigacoes(l); setMateriais(m);
      setItens(await listarItensSefaz(n.filter(x => x.situacao !== 'resumo').map(x => x.chave)));
    } catch (err) {
      toast.error('Erro ao carregar as notas: ' + (err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // Só a variação pode receber preço (o item que só agrupa, não).
  const folhas = useMemo(() => materiais.filter(m => m.ativo && !materiais.some(f => f.item_pai_id === m.id))
    .map(m => ({ m, nome: nomeMaterial(m, materiais) })).sort((a, b) => a.nome.localeCompare(b.nome)), [materiais]);
  const nomeDe = (id: string | null) => id ? nomeMaterial(materiais.find(m => m.id === id), materiais) : '—';

  const semLigacao = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return produtosSemLigacao(notas, itens)
      .filter(p => !t || `${p.item.descricao} ${p.fornecedor} ${p.item.codigo}`.toLowerCase().includes(t));
  }, [notas, itens, busca]);

  const notasFiltradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return notas.filter(n => !t || `${n.emitente_nome} ${n.numero} ${n.chave}`.toLowerCase().includes(t)
      || itens.some(i => i.chave === n.chave && i.descricao.toLowerCase().includes(t)));
  }, [notas, itens, busca]);

  const ligar = async (itemId: string, materialId: string | null, fator: number) => {
    try {
      await ligarItem(itemId, materialId, fator);
      toast.success(materialId ? 'Ligado. O preço do material segue a nota mais recente.' : 'Ligação desfeita.');
      await carregar();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const ligacaoDe = (n: NotaSefaz, it: ItemNotaSefaz) =>
    ligacoes.find(l => l.fornecedor_cnpj === n.emitente_cnpj && l.codigo === it.codigo);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" />Notas da SEFAZ</CardTitle>
            <CardDescription className="mt-1">
              As notas de compra emitidas contra os CNPJs do grupo chegam sozinhas, de hora em hora. Ligue cada produto do
              fornecedor a um item uma vez: daí em diante, a nota mais recente vira o preço do item (o do teto de gasto).
              O estoque não muda.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={carregar} disabled={carregando} className="gap-1 shrink-0">
            {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {!carregando && !empresas.length ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma consulta feita ainda. O robô começa depois que os certificados A1 forem colocados na VM
              (deploy/producao/sefaz/configurar-sefaz.sh).
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {empresas.map(e => (
                <div key={e.cnpj} className="rounded-lg border p-3 text-sm space-y-1">
                  <div className="font-medium">{e.nome ?? 'Empresa'}</div>
                  <div className="text-xs text-muted-foreground">{formatarCnpj(e.cnpj)}</div>
                  <div className="text-xs">Última consulta: {dataHora(e.ultima_consulta_em)}</div>
                  {e.ultimo_erro
                    ? <div className="text-xs text-destructive">Erro: {e.ultimo_erro}</div>
                    : <div className="text-xs text-muted-foreground">{e.ultimo_status ?? '—'}</div>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Input placeholder="Buscar por produto, fornecedor ou número da nota..." value={busca} onChange={ev => setBusca(ev.target.value)} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Produtos sem item ligado ({semLigacao.length})</CardTitle>
          <CardDescription>
            Escolha o item do catálogo. Se a nota vem em caixa e o item é a unidade, informe quantas unidades vêm na caixa:
            o preço do item vira o valor da nota dividido por esse número.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {carregando ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            : !semLigacao.length ? <p className="text-sm text-muted-foreground">Nenhum produto pendente.</p>
            : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto na nota</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead className="text-right">Valor unit.</TableHead>
                      <TableHead className="min-w-[22rem]">Item do catálogo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {semLigacao.slice(0, 200).map(p => (
                      <LinhaSemLigacao key={`${p.fornecedor_cnpj}|${p.item.codigo}`} p={p} folhas={folhas} podeEditar={podeEditar} onLigar={ligar} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notas recebidas ({notasFiltradas.length})</CardTitle>
          <CardDescription>
            "Aguardando itens": a SEFAZ só manda os itens depois da Ciência da Operação, que o robô registra sozinho;
            os itens chegam numa das próximas consultas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {carregando ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            : !notasFiltradas.length ? <p className="text-sm text-muted-foreground">Nenhuma nota.</p>
            : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Emissão</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead>Número</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {notasFiltradas.slice(0, 200).flatMap(n => {
                      const doNota = itens.filter(i => i.chave === n.chave);
                      const linhas = [
                        <TableRow key={n.chave} className={doNota.length ? 'cursor-pointer' : undefined}
                          onClick={() => doNota.length && setAberta(aberta === n.chave ? null : n.chave)}>
                          <TableCell>{doNota.length ? (aberta === n.chave ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : null}</TableCell>
                          <TableCell className="whitespace-nowrap">{data(n.emissao)}</TableCell>
                          <TableCell>{n.emitente_nome ?? formatarCnpj(n.emitente_cnpj)}</TableCell>
                          <TableCell>{n.numero ?? '—'}</TableCell>
                          <TableCell className="text-right tabular-nums whitespace-nowrap">{n.valor_total == null ? '—' : reais(n.valor_total)}</TableCell>
                          <TableCell>
                            {n.situacao === 'cancelada' ? <Badge variant="destructive">Cancelada</Badge>
                              : n.situacao === 'completa' ? <Badge variant="secondary">{doNota.filter(i => i.material_id).length}/{doNota.length} ligados</Badge>
                              : n.ciencia_erro ? <Badge variant="outline" className="text-destructive border-destructive" title={n.ciencia_erro}>Erro na ciência</Badge>
                              : <Badge variant="outline">Aguardando itens</Badge>}
                          </TableCell>
                        </TableRow>,
                      ];
                      if (aberta === n.chave) {
                        linhas.push(
                          <TableRow key={`${n.chave}-itens`} className="bg-muted/30 hover:bg-muted/30">
                            <TableCell />
                            <TableCell colSpan={5}>
                              <ul className="text-sm space-y-1 py-1">
                                {doNota.map(it => {
                                  const l = ligacaoDe(n, it);
                                  return (
                                    <li key={it.id} className="flex flex-wrap items-center gap-x-2">
                                      <span>{it.descricao}</span>
                                      <span className="text-muted-foreground">
                                        {it.quantidade ?? '—'} {it.unidade ?? ''} × {it.valor_unit == null ? '—' : reais(it.valor_unit)}
                                      </span>
                                      {it.material_id && (
                                        <span className="text-primary">
                                          → {nomeDe(it.material_id)}{l && l.fator !== 1 ? ` (÷ ${l.fator})` : ''}
                                          {podeEditar && (
                                            <Button variant="ghost" size="sm" className="h-6 px-1 ml-1" title="Desfazer a ligação"
                                              onClick={(ev) => { ev.stopPropagation(); ligar(it.id, null, 1); }}>
                                              <Unlink className="h-3.5 w-3.5" />
                                            </Button>
                                          )}
                                        </span>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </TableCell>
                          </TableRow>,
                        );
                      }
                      return linhas;
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

function LinhaSemLigacao({ p, folhas, podeEditar, onLigar }: {
  p: ProdutoSemLigacao; folhas: { m: Material; nome: string }[]; podeEditar: boolean;
  onLigar: (itemId: string, materialId: string, fator: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [escolhido, setEscolhido] = useState<{ m: Material; nome: string } | null>(null);
  const [fator, setFator] = useState('1');
  const [salvando, setSalvando] = useState(false);
  const f = lerFator(fator);
  const salvar = async () => {
    if (!escolhido || !f) return;
    setSalvando(true);
    try { await onLigar(p.item.id, escolhido.m.id, f); } finally { setSalvando(false); }
  };
  return (
    <TableRow>
      <TableCell>
        <div>{p.item.descricao}</div>
        <div className="text-xs text-muted-foreground">
          cód. {p.item.codigo} · {p.item.unidade ?? '—'}{p.notas > 1 ? ` · em ${p.notas} notas` : ''} · {data(p.emissao)}
        </div>
      </TableCell>
      <TableCell className="text-sm">{p.fornecedor}</TableCell>
      <TableCell className="text-right tabular-nums whitespace-nowrap">{p.item.valor_unit == null ? '—' : reais(p.item.valor_unit)}</TableCell>
      <TableCell>
        {!podeEditar ? <span className="text-xs text-muted-foreground">Só Compras liga.</span> : (
          <div className="flex flex-wrap items-center gap-2">
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="max-w-[16rem] justify-start truncate font-normal">
                  {escolhido?.nome ?? 'Escolher item...'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar item..." />
                  <CommandList>
                    <CommandEmpty>Nenhum item encontrado.</CommandEmpty>
                    {folhas.map(x => (
                      <CommandItem key={x.m.id} value={`${x.nome} ${x.m.id}`} onSelect={() => { setEscolhido(x); setOpen(false); }}>
                        <span className="truncate">{x.nome}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{x.m.unidade}</span>
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <div className="flex items-center gap-1 text-xs text-muted-foreground" title="Quantas unidades do item vêm em 1 unidade da nota">
              ÷ <Input value={fator} onChange={ev => setFator(ev.target.value)} inputMode="decimal" className="h-8 w-16" />
            </div>
            <Button size="sm" onClick={salvar} disabled={!escolhido || !f || salvando} className="gap-1">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}Ligar
            </Button>
            {escolhido && f && p.item.valor_unit != null && (
              <span className="text-xs text-muted-foreground w-full">
                Preço do item: {reais(Math.round((p.item.valor_unit / f) * 100) / 100)} por {escolhido.m.unidade}
              </span>
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
