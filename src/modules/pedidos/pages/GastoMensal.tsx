import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import EstadoSelect, { TODOS_ESTADOS } from '@/components/EstadoSelect';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/hooks/use-confirm';
import { cn } from '@/lib/utils';
import { reais } from '../lib/pedidosService';
import { MESES_ABREV, acumulado, lerCusto, saldoDoMes, type MesGasto } from '../lib/planilhaGasto';
import {
  anosGastoMensal, excluirGastoPosto, lerValorDigitado, listGastoMensal, salvarGastoPosto, type DadosGasto, type GastoPosto,
} from '../lib/gastoMensalService';
import ImportarGastoMensal from '../components/ImportarGastoMensal';

/**
 * Controle de gasto mensal: o modelo da planilha "Controle de gasto mensal DF e GO -
 * Por posto" dentro do sistema. Em cima, os postos (como a aba MENU) com o acumulado
 * do ano; embaixo, o quadro do posto escolhido igual à aba dele: itens x meses, datas
 * de faturamento, valor previsto, realizado (com as notas), variação/saldo, acumulado,
 * equipamentos e observações. Quem pode editar Pedidos de Material ajusta direto aqui.
 */

const fmtData = (f: string) => (/^\d{4}-\d{2}-\d{2}$/.test(f) ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : f);
const numBr = (v: number | null) => (v == null ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const corSaldo = (v: number) => (v < 0 ? 'text-red-600 dark:text-red-400' : v > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground');

/** "03/02/2026, Sob Demanda" -> ['2026-02-03', 'Sob Demanda'] */
function lerFaturamento(t: string): string[] {
  return t.split(/[;\n]|,(?!\d{2}\b)/).map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (!m) return s;
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  });
}

// ---------- Quadro do posto (igual à aba da planilha) ----------

function QuadroPosto({ gasto, ano, podeEditar, onSalvo, onExcluido }: {
  gasto: GastoPosto; ano: number; podeEditar: boolean; onSalvo: (g: GastoPosto) => void; onExcluido: () => void;
}) {
  const { confirm, ConfirmDialog } = useConfirm();
  const [editando, setEditando] = useState(false);
  const [rasc, setRasc] = useState<DadosGasto>(gasto.dados);
  const [custo, setCusto] = useState(gasto.custo_texto ?? '');
  // Textos digitados nos campos de valor (validados ao salvar).
  const [txtPrev, setTxtPrev] = useState<string[]>([]);
  const [txtReal, setTxtReal] = useState<string[]>([]);
  const [txtFat, setTxtFat] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  const iniciarEdicao = () => {
    setRasc(structuredClone(gasto.dados));
    setCusto(gasto.custo_texto ?? '');
    setTxtPrev(gasto.dados.meses.map(m => numBr(m.previsto)));
    setTxtReal(gasto.dados.meses.map(m => (m.parcelas ? m.parcelas.map(numBr).join(' + ').replace(/\+ -/g, '- ') : numBr(m.realizado))));
    setTxtFat(gasto.dados.meses.map(m => m.faturamento.map(fmtData).join('; ')));
    setEditando(true);
  };
  useEffect(() => { setEditando(false); }, [gasto.id]);

  const dados = editando ? rasc : gasto.dados;
  const ac = acumulado(dados.meses);
  const hoje = new Date();
  const mesAtual = hoje.getFullYear() === ano ? hoje.getMonth() : -1;

  const mudarItem = (s: number, i: number, campo: 'nome' | 'mes', valor: string, mes = 0) =>
    setRasc(d => ({
      ...d,
      secoes: d.secoes.map((sec, si) => (si !== s ? sec : {
        ...sec,
        itens: sec.itens.map((it, ii) => (ii !== i ? it : campo === 'nome' ? { ...it, nome: valor } : { ...it, meses: it.meses.map((q, k) => (k === mes ? valor : q)) })),
      })),
    }));
  const novoItem = (s: number) => setRasc(d => {
    const maior = Math.max(0, ...d.secoes.flatMap(x => x.itens.map(i => i.ordem ?? 0)));
    return { ...d, secoes: d.secoes.map((sec, si) => (si !== s ? sec : { ...sec, itens: [...sec.itens, { ordem: maior + 1, nome: '', meses: Array(12).fill('') }] })) };
  });
  const removerItem = (s: number, i: number) =>
    setRasc(d => ({ ...d, secoes: d.secoes.map((sec, si) => (si !== s ? sec : { ...sec, itens: sec.itens.filter((_, ii) => ii !== i) })) }));

  const salvar = async () => {
    const meses: MesGasto[] = [];
    for (let k = 0; k < 12; k++) {
      const prev = lerValorDigitado(txtPrev[k] ?? '');
      const real = lerValorDigitado(txtReal[k] ?? '');
      if (prev === 'invalido') return toast.error(`Valor previsto de ${MESES_ABREV[k]} inválido.`);
      if (real === 'invalido') return toast.error(`Valor realizado de ${MESES_ABREV[k]} inválido. Use números, ou a soma das notas: 1.234,56 + 789,00`);
      meses.push({ faturamento: lerFaturamento(txtFat[k] ?? ''), previsto: prev.total, realizado: real.total, parcelas: real.parcelas });
    }
    const secoes = rasc.secoes.map(s => ({ ...s, itens: s.itens.filter(i => i.nome.trim()).map(i => ({ ...i, nome: i.nome.trim() })) }));
    setSalvando(true);
    try {
      const salvo = await salvarGastoPosto({
        id: gasto.id, custo_texto: custo.trim() || null, custo_valor: lerCusto(`:${custo}`).custoValor,
        dados: { ...rasc, secoes, meses, observacoes: rasc.observacoes.map(o => o.trim()).filter(Boolean) },
      });
      toast.success(`${gasto.posto_nome} salvo`);
      setEditando(false);
      onSalvo(salvo);
    } catch (e) { toast.error('Erro ao salvar: ' + (e as Error).message); }
    finally { setSalvando(false); }
  };

  const excluir = async () => {
    if (!(await confirm(`Excluir o controle de ${gasto.posto_nome} em ${ano}? Dá para importar a planilha de novo depois.`))) return;
    try { await excluirGastoPosto(gasto.id); toast.success('Excluído'); onExcluido(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const celMes = (k: number) => cn('border px-1.5 py-1 text-center align-top whitespace-nowrap', k === mesAtual && 'bg-amber-100/70 dark:bg-amber-500/15');
  const rotuloFin = 'border px-2 py-1 font-semibold text-left whitespace-nowrap bg-muted/60';

  return (
    <Card>
      <CardContent className="p-3 sm:p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <h2 className="text-lg font-bold leading-tight">{gasto.posto_nome}</h2>
            <p className="text-xs text-muted-foreground">
              Aba "{gasto.aba}" · {gasto.uf} · atualizado em {new Date(gasto.atualizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
            </p>
          </div>
          {podeEditar && !editando && (
            <>
              <Button size="sm" variant="outline" onClick={iniciarEdicao}><Pencil className="h-4 w-4 mr-1" /> Editar</Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={excluir} aria-label="Excluir posto do controle"><Trash2 className="h-4 w-4" /></Button>
            </>
          )}
          {editando && (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditando(false)} disabled={salvando}><X className="h-4 w-4 mr-1" /> Cancelar</Button>
              <Button size="sm" onClick={salvar} disabled={salvando}>
                {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Salvar
              </Button>
            </>
          )}
        </div>

        {/* A aba da planilha */}
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th colSpan={14} className="border px-2 py-1.5 text-center font-bold tracking-wide bg-primary text-primary-foreground">
                  PEDIDO DE MATERIAL - Rev.00
                </th>
              </tr>
              <tr className="bg-muted/60">
                <th rowSpan={2} className="border px-1.5 w-10">ORD</th>
                <th rowSpan={2} className="border px-2 text-left min-w-[16rem] sticky left-0 bg-muted z-10">ITEM</th>
                <th colSpan={6} className="border px-2 py-1 text-left">POSTO: {gasto.posto_nome}</th>
                <th colSpan={6} className="border px-2 py-1 text-left">
                  CUSTO EM CONTRATO:{' '}
                  {editando
                    ? <Input value={custo} onChange={e => setCusto(e.target.value)} className="inline-flex h-7 w-40 text-xs" placeholder="R$ 0,00 ou Sob demanda" />
                    : (gasto.custo_texto || '—')}
                </th>
              </tr>
              <tr className="bg-muted/60">
                {MESES_ABREV.map((m, k) => <th key={m} className={cn(celMes(k), 'font-semibold min-w-[4.5rem]')}>{m}</th>)}
              </tr>
            </thead>
            <tbody>
              {dados.secoes.map((sec, s) => (
                <Fragment key={s}>
                  {sec.titulo != null && (
                    <tr className="bg-muted/40 font-semibold">
                      <td className="border px-1.5 text-center">{sec.titulo}</td>
                      <td className="border px-2 sticky left-0 bg-muted z-10">ITEM</td>
                      {MESES_ABREV.map((m, k) => <td key={m} className={celMes(k)}>{m}</td>)}
                    </tr>
                  )}
                  {sec.itens.map((it, i) => (
                    <tr key={`${s}-${i}`} className="hover:bg-muted/30">
                      <td className="border px-1.5 text-center tabular-nums text-muted-foreground">{it.ordem ?? ''}</td>
                      <td className="border px-2 py-1 sticky left-0 bg-background z-10">
                        {editando ? (
                          <div className="flex items-center gap-1">
                            <Input value={it.nome} onChange={e => mudarItem(s, i, 'nome', e.target.value)} className="h-7 text-xs" />
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive shrink-0" onClick={() => removerItem(s, i)} aria-label="Remover item"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        ) : it.nome}
                      </td>
                      {it.meses.map((q, k) => (
                        <td key={k} className={celMes(k)}>
                          {editando ? <Input value={q} onChange={e => mudarItem(s, i, 'mes', e.target.value, k)} className="h-7 w-[4.5rem] px-1 text-xs text-center" /> : q}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {editando && (
                    <tr><td colSpan={14} className="border px-2 py-1">
                      <Button size="sm" variant="ghost" onClick={() => novoItem(s)}><Plus className="h-3.5 w-3.5 mr-1" /> Item{sec.titulo ? ` em ${sec.titulo}` : ''}</Button>
                    </td></tr>
                  )}
                </Fragment>
              ))}

              <tr>
                <td colSpan={2} className={cn(rotuloFin, 'sticky left-0 z-10')}>DATA DE FATURAMENTO</td>
                {dados.meses.map((m, k) => (
                  <td key={k} className={celMes(k)}>
                    {editando
                      ? <Textarea value={txtFat[k] ?? ''} onChange={e => setTxtFat(t => t.map((x, j) => (j === k ? e.target.value : x)))} rows={2} className="min-h-0 w-24 px-1 text-[11px]" placeholder="dd/mm/aaaa; ..." />
                      : m.faturamento.length
                        ? <div className="flex flex-col gap-0.5">{m.faturamento.map((f, j) => <span key={j} className={cn(!/^\d{4}-/.test(f) && 'whitespace-normal text-[10px] text-muted-foreground max-w-[7rem]')}>{fmtData(f)}</span>)}</div>
                        : <span className="text-muted-foreground">—</span>}
                  </td>
                ))}
              </tr>
              <tr>
                <td colSpan={2} className={cn(rotuloFin, 'sticky left-0 z-10')}>VALOR PREVISTO (R$):</td>
                {dados.meses.map((m, k) => (
                  <td key={k} className={cn(celMes(k), 'text-right tabular-nums')}>
                    {editando
                      ? <Input value={txtPrev[k] ?? ''} onChange={e => setTxtPrev(t => t.map((x, j) => (j === k ? e.target.value : x)))} className="h-7 w-24 px-1 text-xs text-right" />
                      : numBr(m.previsto ?? 0)}
                  </td>
                ))}
              </tr>
              <tr>
                <td colSpan={2} className={cn(rotuloFin, 'sticky left-0 z-10')}>VALOR REALIZADO (R$):</td>
                {dados.meses.map((m, k) => (
                  <td key={k} className={cn(celMes(k), 'text-right tabular-nums')}>
                    {editando
                      ? <Input value={txtReal[k] ?? ''} onChange={e => setTxtReal(t => t.map((x, j) => (j === k ? e.target.value : x)))} className="h-7 w-28 px-1 text-xs text-right" title="Um valor, ou a soma das notas: 1.234,56 + 789,00" />
                      : (
                        <div title={m.parcelas ? `Notas: ${m.parcelas.map(numBr).join(' + ')}` : undefined}>
                          {numBr(m.realizado ?? 0)}
                          {m.parcelas && <div className="text-[10px] text-muted-foreground">{m.parcelas.length} notas</div>}
                        </div>
                      )}
                  </td>
                ))}
              </tr>
              <tr>
                <td colSpan={2} className={cn(rotuloFin, 'sticky left-0 z-10')}>{dados.rotuloSaldo} (R$):</td>
                {dados.meses.map((m, k) => {
                  const v = saldoDoMes(m);
                  return <td key={k} className={cn(celMes(k), 'text-right tabular-nums font-semibold', corSaldo(v))}>{numBr(v)}</td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
        {editando && (
          <p className="text-xs text-muted-foreground">
            Valor realizado: digite o total ou a soma das notas (ex.: <span className="font-mono">26.829,76 + 8.755,64</span>) — a soma fica guardada com as notas.
            Datas de faturamento separadas por ponto e vírgula.
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="space-y-4 min-w-0">
            {dados.equipamentos.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-1">EQUIPAMENTOS</h3>
                <table className="border-collapse text-xs">
                  <thead><tr className="bg-muted/60">
                    <th className="border px-2 py-1">QTD</th><th className="border px-2 py-1 text-left">DESCRIÇÃO</th>
                    <th className="border px-2 py-1">UN. (R$)</th><th className="border px-2 py-1">SUBTOTAL</th>
                  </tr></thead>
                  <tbody>
                    {dados.equipamentos.map((e, i) => (
                      <tr key={i}>
                        <td className="border px-2 py-1 text-center tabular-nums">{e.qtd ?? ''}</td>
                        <td className="border px-2 py-1">{e.descricao}</td>
                        <td className="border px-2 py-1 text-right tabular-nums">{numBr(e.unitario)}</td>
                        <td className="border px-2 py-1 text-right tabular-nums">{numBr(e.subtotal ?? (e.qtd ?? 0) * (e.unitario ?? 0))}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td colSpan={3} className="border px-2 py-1 text-right">Total</td>
                      <td className="border px-2 py-1 text-right tabular-nums">
                        {numBr(dados.equipamentos.reduce((s, e) => s + (e.subtotal ?? (e.qtd ?? 0) * (e.unitario ?? 0)), 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {(dados.observacoes.length > 0 || editando) && (
              <div>
                <h3 className="text-sm font-semibold mb-1">Observações</h3>
                {editando
                  ? <Textarea value={rasc.observacoes.join('\n')} onChange={e => setRasc(d => ({ ...d, observacoes: e.target.value.split('\n') }))} rows={4} placeholder="Uma observação por linha" />
                  : <ul className="text-sm space-y-1 list-disc pl-5">{dados.observacoes.map((o, i) => <li key={i}>{o}</li>)}</ul>}
              </div>
            )}
          </div>

          {/* ACUMULADO */}
          <table className="border-collapse text-sm self-start min-w-[18rem]">
            <thead><tr><th colSpan={2} className="border px-3 py-1.5 bg-primary text-primary-foreground text-center">ACUMULADO</th></tr></thead>
            <tbody>
              <tr><td className="border px-3 py-1.5 font-medium">PREVISÃO ORÇAMENTÁRIA</td><td className="border px-3 py-1.5 text-right tabular-nums">{reais(ac.previsto)}</td></tr>
              <tr><td className="border px-3 py-1.5 font-medium">VALOR APLICADO</td><td className="border px-3 py-1.5 text-right tabular-nums">{reais(ac.aplicado)}</td></tr>
              <tr><td className="border px-3 py-1.5 font-semibold">{dados.rotuloSaldo}</td><td className={cn('border px-3 py-1.5 text-right tabular-nums font-bold', corSaldo(ac.saldo))}>{reais(ac.saldo)}</td></tr>
            </tbody>
          </table>
        </div>
      </CardContent>
      <ConfirmDialog />
    </Card>
  );
}

// ---------- Página ----------

export default function GastoMensal() {
  const { can, estados } = useAuth();
  const podeEditar = can('pedidos_material', 'edit');
  const [anos, setAnos] = useState<number[]>([]);
  const [ano, setAno] = useState<number>(new Date().getFullYear());
  const [lista, setLista] = useState<GastoPosto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [uf, setUf] = useState(TODOS_ESTADOS);
  const [busca, setBusca] = useState('');
  const [escolhido, setEscolhido] = useState<string | null>(null);

  const carregar = useCallback(async (a: number) => {
    setCarregando(true);
    try {
      const [l, as] = await Promise.all([listGastoMensal(a), anosGastoMensal()]);
      setLista(l);
      setAnos([...new Set([...as, a, new Date().getFullYear()])].sort((x, y) => y - x));
      setEscolhido(e => (l.some(g => g.id === e) ? e : l[0]?.id ?? null));
    } catch (e) { toast.error((e as Error).message); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(ano); }, [ano, carregar]);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return lista.filter(g => (uf === TODOS_ESTADOS || g.uf === uf) && (!t || `${g.posto_nome} ${g.aba}`.toLowerCase().includes(t)));
  }, [lista, uf, busca]);
  const totais = useMemo(() => filtrados.reduce((s, g) => {
    const a = acumulado(g.dados.meses);
    return { previsto: s.previsto + a.previsto, aplicado: s.aplicado + a.aplicado };
  }, { previsto: 0, aplicado: 0 }), [filtrados]);
  const atual = lista.find(g => g.id === escolhido) ?? null;

  const abrir = (id: string) => {
    setEscolhido(id);
    requestAnimationFrame(() => document.getElementById('quadro-gasto')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-[1500px] mx-auto space-y-6">
        <BackButton />
        <PageHeader eyebrow="Pedidos" title="Controle de gasto mensal"
          description="O controle por posto da planilha de gasto mensal: itens pedidos em cada mês, faturamento, valor previsto, valor realizado e a variação, com o acumulado do ano."
          actions={podeEditar ? <ImportarGastoMensal onImportado={a => (a === ano ? carregar(a) : setAno(a))} /> : undefined} />

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Ano</Label>
            <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{anos.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {estados.length > 1 && (
            <div>
              <Label>Estado</Label>
              <EstadoSelect value={uf} onChange={setUf} permitirTodos className="w-40" />
            </div>
          )}
          <div className="relative">
            <Label htmlFor="busca-gasto">Posto</Label>
            <Search className="absolute left-2.5 bottom-2.5 h-4 w-4 text-muted-foreground" />
            <Input id="busca-gasto" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar posto" className="pl-8 w-56" />
          </div>
          {filtrados.length > 0 && (
            <div className="ml-auto flex gap-4 text-sm">
              <div><span className="text-muted-foreground">Previsto no ano</span><div className="font-semibold tabular-nums">{reais(totais.previsto)}</div></div>
              <div><span className="text-muted-foreground">Aplicado</span><div className="font-semibold tabular-nums">{reais(totais.aplicado)}</div></div>
              <div><span className="text-muted-foreground">Variação</span><div className={cn('font-semibold tabular-nums', corSaldo(totais.previsto - totais.aplicado))}>{reais(totais.previsto - totais.aplicado)}</div></div>
            </div>
          )}
        </div>

        {carregando ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !lista.length ? (
          <Card><CardContent className="p-10 text-center text-muted-foreground space-y-2">
            <p>Nenhum controle de gasto em {ano}.</p>
            {podeEditar && <p className="text-sm">Use <strong>Importar planilha</strong> com o arquivo "Controle de gasto mensal ... Por posto".</p>}
          </CardContent></Card>
        ) : (
          <>
            {/* MENU: um cartão por posto */}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              {filtrados.map(g => {
                const a = acumulado(g.dados.meses);
                const pct = a.previsto > 0 ? Math.min(100, (a.aplicado / a.previsto) * 100) : null;
                return (
                  <button key={g.id} type="button" onClick={() => abrir(g.id)}
                    className={cn('text-left rounded-lg border bg-card p-2.5 transition hover:border-primary hover:shadow-sm',
                      g.id === escolhido && 'border-primary ring-2 ring-primary/30')}>
                    <div className="flex items-start gap-1">
                      <span className="font-semibold text-sm leading-tight line-clamp-2 mr-auto">{g.posto_nome}</span>
                      <Badge variant="outline" className="text-[10px] px-1">{g.uf}</Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{g.custo_texto || 'sem custo em contrato'}</div>
                    <div className={cn('text-sm font-semibold tabular-nums mt-1', corSaldo(a.saldo))}>{reais(a.saldo)}</div>
                    {pct != null && (
                      <div className="h-1.5 rounded bg-muted mt-1 overflow-hidden">
                        <div className={cn('h-full', a.aplicado > a.previsto ? 'bg-red-500' : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {!filtrados.length && <p className="text-sm text-muted-foreground">Nenhum posto com esse filtro.</p>}

            <div id="quadro-gasto" className="scroll-mt-4">
              {atual && (
                <QuadroPosto gasto={atual} ano={ano} podeEditar={podeEditar}
                  onSalvo={g => setLista(l => l.map(x => (x.id === g.id ? g : x)))}
                  onExcluido={() => carregar(ano)} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
