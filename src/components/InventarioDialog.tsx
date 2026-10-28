import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { AlertTriangle, ClipboardList, Download, FileUp, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { aplicarInventario, dadosInventario } from '@/services/estoqueService';
import {
  compararContagem, gerarPlanilhaInventario, lerPlanilhaInventario, montarLinhasInventario, TIPO_XLSX,
  type ComparacaoContagem, type LinhaContada,
} from '@/lib/inventarioPlanilha';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/hooks/use-confirm';

const hoje = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const sinal = (n: number) => (n > 0 ? `+${n}` : String(n));

interface Leitura { arquivo: string; linhas: LinhaContada[]; erros: string[]; comparacao: ComparacaoContagem[] }

/**
 * Inventário do estoque do estado: (1) baixa a planilha de contagem para o
 * almoxarifado; (2) sobe a planilha contada, confere as diferenças e grava.
 */
export default function InventarioDialog({ uf }: { uf: string }) {
  const { user } = useAuth();
  const { confirm, ConfirmDialog } = useConfirm();
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<'baixar' | 'subir'>('baixar');
  const [mostrarSaldo, setMostrarSaldo] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [todas, setTodas] = useState(false);
  const [motivo, setMotivo] = useState('');
  const arquivo = useRef<HTMLInputElement>(null);

  function abrir(v: boolean) {
    setAberto(v);
    if (v) { setLeitura(null); setTodas(false); setMotivo(`Contagem de ${hoje()}`); }
  }

  async function baixar() {
    setGerando(true);
    try {
      const { catalogo, saldos } = await dadosInventario();
      const linhas = montarLinhasInventario(catalogo, saldos, uf);
      if (!linhas.length) return toast.error('Nenhum item no catálogo.');
      const bytes = await gerarPlanilhaInventario(linhas, { uf, mostrarSaldo, geradoPor: user?.nome || user?.email || '' });
      const url = URL.createObjectURL(new Blob([bytes], { type: TIPO_XLSX }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventario-${uf}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`Planilha de ${uf} com ${linhas.length} linha(s) baixada.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao gerar a planilha');
    } finally {
      setGerando(false);
    }
  }

  async function ler(f: File | undefined) {
    if (!f) return;
    setLendo(true);
    setLeitura(null);
    try {
      const r = await lerPlanilhaInventario(await f.arrayBuffer());
      if (r.uf && r.uf !== uf) {
        toast.error(`Esta planilha é do estado ${r.uf}. Troque o estado da tela de Estoque para ${r.uf} e suba de novo.`);
        return;
      }
      const { saldos } = await dadosInventario();
      setLeitura({ arquivo: f.name, linhas: r.linhas, erros: r.erros, comparacao: compararContagem(r.linhas, saldos, uf) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao ler a planilha');
    } finally {
      setLendo(false);
      if (arquivo.current) arquivo.current.value = '';
    }
  }

  const resumo = useMemo(() => {
    if (!leitura) return null;
    const c = leitura.comparacao;
    const dif = c.filter(x => x.diferenca !== 0);
    return {
      linhas: leitura.linhas.length,
      contadas: c.length,
      emBranco: leitura.linhas.filter(l => l.contado === null).length,
      diferencas: dif.length,
      sobra: dif.filter(x => x.diferenca > 0).reduce((s, x) => s + x.diferenca, 0),
      falta: dif.filter(x => x.diferenca < 0).reduce((s, x) => s - x.diferenca, 0),
      mudaram: c.filter(x => x.mudouDesdePlanilha).length,
      observacoes: leitura.linhas.filter(l => l.observacao),
    };
  }, [leitura]);

  const visiveis = leitura ? leitura.comparacao.filter(x => todas || x.diferenca !== 0) : [];

  async function gravar() {
    if (!leitura || !resumo) return;
    const ok = await confirm({
      title: `Atualizar o estoque de ${uf}?`,
      description: `${resumo.contadas} item(ns) contado(s) passam a ter o saldo da contagem: ${resumo.diferencas} com diferença `
        + `(${resumo.sobra} a mais e ${resumo.falta} a menos no total). Cada diferença fica registrada no relatório de `
        + `movimentações. Os ${resumo.emBranco} em branco não mudam.`,
      confirmLabel: 'Atualizar estoque',
      destructive: false,
    });
    if (!ok) return;
    setGravando(true);
    try {
      const r = await aplicarInventario(uf, motivo, leitura.comparacao.map(x => ({ epiId: x.epiId, tamanho: x.tamanho, contado: x.contado })));
      toast.success(`Estoque de ${uf} atualizado: ${r.ajustados} ajuste(s), ${r.iguais} item(ns) já batiam.`);
      setAberto(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao gravar o inventário');
    } finally {
      setGravando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={abrir}>
      <DialogTrigger asChild>
        <Button variant="outline"><ClipboardList className="h-4 w-4 mr-1" /> Inventário</Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Inventário do estoque — {uf}</DialogTitle>
          <DialogDescription>
            Baixe a planilha, entregue ao almoxarifado para a contagem e suba de volta a planilha preenchida.
            O sistema mostra as diferenças antes de atualizar o estoque.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={aba} onValueChange={v => setAba(v as typeof aba)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="baixar">1. Baixar planilha</TabsTrigger>
            <TabsTrigger value="subir">2. Subir contagem</TabsTrigger>
          </TabsList>

          <TabsContent value="baixar" className="space-y-4 pt-2">
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              <li>Uma linha por item e tamanho do estoque de <strong>{uf}</strong> (EPIs e uniformes).</li>
              <li>O almoxarifado digita a quantidade contada na coluna amarela <strong>"Contagem"</strong> (0 se não tiver). O resto da planilha fica travado.</li>
              <li>Tamanho ou item que não está na lista vai na coluna "Observação".</li>
              <li>Dá para imprimir e contar no papel: a folha sai com cabeçalho, páginas numeradas e espaço para quem contou assinar.</li>
            </ul>
            <div className="flex items-start gap-2">
              <Checkbox id="inv-saldo" checked={mostrarSaldo} onCheckedChange={v => setMostrarSaldo(v === true)} />
              <Label htmlFor="inv-saldo" className="text-sm font-normal leading-snug">
                Mostrar o saldo do sistema na planilha
                <span className="block text-xs text-muted-foreground">
                  Desmarcado = contagem às cegas (recomendado): quem conta não vê o número do sistema e não é levado a repeti-lo.
                </span>
              </Label>
            </div>
            <Button onClick={baixar} disabled={gerando}>
              {gerando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
              Baixar planilha de {uf}
            </Button>
            <p className="text-xs text-muted-foreground">
              Faça a contagem logo depois de baixar e suba no mesmo dia: entregas e entradas feitas no meio do caminho
              aparecem como aviso na conferência.
            </p>
          </TabsContent>

          <TabsContent value="subir" className="space-y-4 pt-2">
            <input ref={arquivo} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden" onChange={e => ler(e.target.files?.[0])} />
            <Button variant="outline" onClick={() => arquivo.current?.click()} disabled={lendo || gravando}>
              {lendo ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileUp className="h-4 w-4 mr-1" />}
              {leitura ? 'Escolher outra planilha' : 'Escolher a planilha contada (.xlsx)'}
            </Button>

            {leitura && resumo && (
              <div className="space-y-4">
                <p className="text-sm">
                  <strong>{leitura.arquivo}</strong>: {resumo.linhas} linha(s) · <strong>{resumo.contadas}</strong> contada(s) ·{' '}
                  {resumo.emBranco} em branco (não mudam) · <strong>{resumo.diferencas}</strong> com diferença
                  {resumo.diferencas > 0 && <> (<span className="text-emerald-600">+{resumo.sobra}</span> / <span className="text-destructive">−{resumo.falta}</span>)</>}
                </p>

                {leitura.erros.length > 0 && (
                  <div className="rounded-md border border-destructive p-3 text-sm text-destructive space-y-1">
                    <p className="font-medium">Corrija na planilha e suba de novo (nada foi gravado):</p>
                    {leitura.erros.slice(0, 20).map(e => <p key={e}>• {e}</p>)}
                    {leitura.erros.length > 20 && <p>… e mais {leitura.erros.length - 20}</p>}
                  </div>
                )}

                {resumo.mudaram > 0 && (
                  <p className="flex gap-2 text-sm text-amber-600">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    {resumo.mudaram} item(ns) tiveram entrega ou entrada depois que a planilha foi gerada (marcados abaixo).
                    Se a contagem foi feita antes dessas movimentações, confira esses itens antes de gravar.
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <Label className="text-sm">{todas ? 'Todos os itens contados' : 'Itens com diferença'}</Label>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setTodas(!todas)}>
                    {todas ? 'Só os com diferença' : 'Ver todos os contados'}
                  </Button>
                </div>
                <div className="max-h-[40vh] overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Tamanho</TableHead>
                        <TableHead className="text-right">Sistema</TableHead>
                        <TableHead className="text-right">Contado</TableHead>
                        <TableHead className="text-right">Diferença</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visiveis.map(x => (
                        <TableRow key={`${x.epiId}|${x.tamanho}`}>
                          <TableCell>
                            {x.item}
                            {x.observacao && <span className="block text-xs text-muted-foreground">Obs.: {x.observacao}</span>}
                          </TableCell>
                          <TableCell>{x.tamanho}</TableCell>
                          <TableCell className="text-right">
                            {x.atual}
                            {x.mudouDesdePlanilha && (
                              <span className="block text-xs text-amber-600" title="Saldo quando a planilha foi gerada">
                                era {x.saldoPlanilha} na planilha
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium">{x.contado}</TableCell>
                          <TableCell className={`text-right font-medium ${x.diferenca > 0 ? 'text-emerald-600' : x.diferenca < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {x.diferenca === 0 ? '—' : sinal(x.diferenca)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {visiveis.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                          {resumo.contadas ? 'A contagem bateu com o sistema em todos os itens.' : 'Nenhuma linha preenchida na coluna "Contagem".'}
                        </TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {resumo.observacoes.some(l => l.contado === null) && (
                  <div className="text-sm space-y-1">
                    <p className="font-medium">Observações em linhas não contadas:</p>
                    {resumo.observacoes.filter(l => l.contado === null).map(l => (
                      <p key={`${l.epiId}|${l.tamanho}`} className="text-muted-foreground">• {l.item} ({l.tamanho}): {l.observacao}</p>
                    ))}
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div className="space-y-1">
                    <Label htmlFor="inv-motivo">Descrição (vai no relatório de movimentações)</Label>
                    <Input id="inv-motivo" value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={120} />
                  </div>
                  <Button onClick={gravar} disabled={gravando || leitura.erros.length > 0 || resumo.contadas === 0}>
                    {gravando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    Atualizar estoque ({resumo.diferencas} ajuste{resumo.diferencas === 1 ? '' : 's'})
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
        <ConfirmDialog />
      </DialogContent>
    </Dialog>
  );
}
