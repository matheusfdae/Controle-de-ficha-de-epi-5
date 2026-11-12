import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ClipboardList, Loader2, Printer } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import ImportarGastoMensal from './ImportarGastoMensal';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import logo from '@/assets/logo-5estrelas-horizontal.png';
import { listPedidos } from '../lib/pedidosService';
import { listGastoMensal } from '../lib/gastoMensalService';
import { chaveNome } from '../lib/planilhaPostos';
import { MESES_ABREV } from '../lib/planilhaGasto';
import { mesDeReferencia, mesInicial, relatorioTeto, variacao, type RelatorioTeto } from '../lib/relatorioTeto';
import type { GastoPosto } from '../lib/gastoMensalService';
import type { PedidoCompleto } from '../lib/pedidosService';

/**
 * Ao clicar num posto no quadro "Teto de gasto por posto": o relatório do ano no
 * modelo da planilha (PEDIDO DE MATERIAL - Rev.00) — data de faturamento, valor
 * previsto, realizado e variação por mês, e o acumulado.
 */

const reais = (v: number | null) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (f: string) => (/^\d{4}-\d{2}-\d{2}$/.test(f) ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : f);
const COR = { passou: 'text-red-600', sobrou: 'text-green-600', zero: 'text-black dark:text-foreground' };

export interface PostoTeto { id: string; nome: string; uf: string; teto_material: number | null }

/**
 * Largura do relatório "de papel". Na tela ele cresce ou encolhe para caber
 * inteiro no espaço livre (largura E altura): sem corte e sem rolagem.
 */
const LARGURA = 1250;
function CaberNaTela({ children }: { children: ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null);
  const folha = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  useLayoutEffect(() => {
    const medir = () => {
      const c = caixa.current, f = folha.current;
      if (!c || !f) return;
      // folga de 8 px para as bordas não encostarem na beirada
      // largura de verdade do conteúdo (valores grandes alargam a tabela além de LARGURA)
      const porLargura = (c.clientWidth - 8) / Math.max(1, f.offsetWidth);
      const porAltura = (c.clientHeight - 8) / Math.max(1, f.offsetHeight);
      setEscala(Math.max(0.3, Math.min(1.6, porLargura, porAltura)));
    };
    medir();
    const ro = new ResizeObserver(medir);
    if (caixa.current) ro.observe(caixa.current);
    if (folha.current) ro.observe(folha.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={caixa} className="relative flex-1 min-h-0 overflow-hidden">
      <div ref={folha} className="absolute left-1/2 top-0"
        style={{ width: 'max-content', minWidth: LARGURA, transform: `translateX(-50%) scale(${escala})`, transformOrigin: 'top center' }}>
        {children}
      </div>
    </div>
  );
}

export default function RelatorioTetoPosto({ posto, ano, onFechar, onVerPedidos }: {
  posto: PostoTeto | null; ano: number; onFechar: () => void; onVerPedidos: (id: string) => void;
}) {
  const { can } = useAuth();
  const [base, setBase] = useState<{ controle: GastoPosto | null; pedidos: PedidoCompleto[] } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [ateMes, setAteMes] = useState(mesDeReferencia(ano));
  const [recarregar, setRecarregar] = useState(0);

  useEffect(() => { setAteMes(mesDeReferencia(ano)); }, [posto, ano]);
  useEffect(() => {
    if (!posto) return;
    let vivo = true;
    setBase(null);
    setCarregando(true);
    (async () => {
      try {
        const controles = await listGastoMensal(ano);
        // Ligado pelo posto; sem vínculo, pelo nome da aba/posto.
        const controle = controles.find(c => c.posto_id === posto.id)
          ?? controles.find(c => !c.posto_id && [chaveNome(c.posto_nome), chaveNome(c.aba)].includes(chaveNome(posto.nome))) ?? null;
        const pedidos = controle ? [] : (await listPedidos(`${ano}-01-01`)).filter(p => p.posto_id === posto.id);
        if (vivo) { setBase({ controle, pedidos }); setAteMes(mesInicial(ano, controle)); }
      } catch (e) {
        if (vivo) toast.error('Não foi possível montar o relatório: ' + (e as Error).message);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [posto, ano, recarregar]);
  const rel: RelatorioTeto | null = base && posto ? relatorioTeto(ano, base.controle, base.pedidos, posto.teto_material, ateMes) : null;

  const imprimir = () => {
    const el = document.getElementById('relatorio-teto');
    if (!el) return;
    const w = window.open('', '_blank', 'width=1200,height=700');
    if (!w) return toast.error('Libere as janelas (pop-up) para imprimir.');
    const estilos = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map(n => n.outerHTML).join('');
    w.document.write(`<html><head><title>Teto de gasto - ${posto?.nome ?? ''} - ${ano}</title>${estilos}
      <style>@page{size:A4 landscape;margin:8mm}body{background:#fff;padding:8px;-webkit-print-color-adjust:exact;print-color-adjust:exact}#relatorio-teto{width:max-content;min-width:${LARGURA}px}@media print{#relatorio-teto{zoom:.74}}</style>
      </head><body>${el.outerHTML}</body></html>`);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
  };

  const cel = 'border border-black/70 px-2 py-2 text-center whitespace-nowrap';
  // Rótulo das linhas de valores: fecha a borda da esquerda (o quadro não fica "aberto").
const rot = 'border-0 border-l border-black/70 px-3 py-2 text-right whitespace-nowrap';

  return (
    <Dialog open={!!posto} onOpenChange={o => !o && onFechar()}>
      <DialogContent className="left-0 top-0 translate-x-0 translate-y-0 max-w-none w-screen h-[100dvh] rounded-none sm:rounded-none flex flex-col gap-2 overflow-hidden p-3 sm:p-4 data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0 data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100">
        <DialogHeader>
          <DialogTitle>Teto de gasto — {posto?.nome} ({ano})</DialogTitle>
          <DialogDescription>
            {rel?.origem === 'pedidos'
              ? 'Este posto não tem Controle de gasto mensal neste ano: valores calculados pelos pedidos do sistema (previsto = teto do posto; faturamento = data em que o pedido foi atendido).'
              : rel?.atualizadoEm
                ? `Da planilha de controle de gasto mensal — atualizada em ${new Date(rel.atualizadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`
                : 'Da planilha de controle de gasto mensal.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Até o mês</Label>
            <Select value={String(ateMes)} onValueChange={v => setAteMes(Number(v))}>
              <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{MESES_ABREV.map((m, k) => <SelectItem key={m} value={String(k + 1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground pb-2">Os meses depois de {MESES_ABREV[ateMes - 1]} ainda não fecharam: ficam zerados.</p>
        </div>

        {carregando || !rel ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <CaberNaTela>
            <div id="relatorio-teto" className="bg-white text-black text-[15px] w-full p-2">
              <table className="w-full border-collapse">
                <tbody>
                  <tr>
                    <td colSpan={2} className="border border-black/70 p-2 w-[280px]">
                      <img src={logo} alt="Grupo 5 Estrelas" className="h-14 w-auto" />
                    </td>
                    <td colSpan={12} className="border border-black/70 text-center font-bold text-[19px]">PEDIDO DE MATERIAL - Rev.00</td>
                  </tr>
                  <tr><td colSpan={14} className="h-3 border-x border-black/70" /></tr>
                  <tr>
                    <td rowSpan={2} className="border border-black/70 px-1 font-bold text-center w-10">ORD</td>
                    <td rowSpan={2} className="border border-black/70 font-bold text-center">ITEM</td>
                    <td colSpan={6} className="border border-black/70 text-center text-[18px] py-1"><strong>POSTO:</strong> {posto?.nome}</td>
                    <td colSpan={6} className="border border-black/70 text-center text-[18px] py-1"><strong>CUSTO EM CONTRATO:</strong> {rel.custoTexto}</td>
                  </tr>
                  <tr>{MESES_ABREV.map(m => <td key={m} className={cn(cel, 'font-bold w-[90px] text-[15px]')}>{m}</td>)}</tr>
                  <tr>
                    <td colSpan={2} className={cn(rot, 'font-bold text-[#1f3a93] text-[14px]')}>DATA DE FATURAMENTO</td>
                    {rel.meses.map((m, k) => (
                      <td key={k} className={cn(cel, 'text-[14px]')}>
                        {m.faturamento.length ? m.faturamento.map((f, j) => <div key={j} className={cn(!/^\d{4}-/.test(f) && 'whitespace-normal leading-tight')}>{dataBr(f)}</div>) : '00/00/00'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td colSpan={2} className={cn(rot, 'text-[14px]')}>VALOR&nbsp;&nbsp;PREVISTO&nbsp;&nbsp;(R$):</td>
                    {rel.meses.map((m, k) => <td key={k} className={cn(cel, 'text-[14px] tabular-nums')}>{reais(m.previsto)}</td>)}
                  </tr>
                  <tr>
                    <td colSpan={2} className={cn(rot, 'text-[14px]')}>VALOR REALIZADO (R$):</td>
                    {rel.meses.map((m, k) => (
                      <td key={k} className={cn(cel, 'text-[14px] tabular-nums')} title={m.parcelas ? `Notas: ${m.parcelas.map(reais).join(' + ')}` : undefined}>
                        {reais(m.realizado)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td colSpan={2} className={cn(rot, 'font-bold text-[14px]')}>{rel.rotulo} (R$):</td>
                    {rel.meses.map((m, k) => {
                      const v = variacao(m.previsto, m.realizado);
                      return <td key={k} className={cn(cel, 'text-[14px] font-bold tabular-nums', COR[v.tom])}>{reais(v.valor)}</td>;
                    })}
                  </tr>
                  <tr><td colSpan={14} className="h-6 border-x border-b border-black/70" /></tr>
                </tbody>
              </table>

              {/* ACUMULADO */}
              <div className="flex justify-end mt-5">
                <table className="border-collapse text-[17px] w-[420px]">
                  <tbody>
                    <tr>
                      <td colSpan={2} className="border border-black/70 text-center font-bold text-[19px] py-1"
                        style={{ backgroundImage: 'radial-gradient(#9ca3af 0.8px, transparent 0.8px)', backgroundSize: '4px 4px' }}>
                        ACUMULADO
                      </td>
                    </tr>
                    {(() => {
                      const v = variacao(rel.acumulado.previsto, rel.acumulado.aplicado);
                      return (
                        <>
                          <tr><td className="border border-black/70 px-3 py-2 text-right font-semibold">PREVISÃO ORÇAMENTÁRIA</td>
                            <td className="border-2 border-emerald-700 px-3 py-2 text-right font-bold tabular-nums">{reais(rel.acumulado.previsto)}</td></tr>
                          <tr><td className="border border-black/70 px-3 py-2 text-right font-semibold">VALOR APLICADO</td>
                            <td className="border border-black/70 px-3 py-2 text-right font-bold tabular-nums">{reais(rel.acumulado.aplicado)}</td></tr>
                          <tr><td className="border border-black/70 px-3 py-2 text-right font-semibold">{rel.rotulo}</td>
                            <td className={cn('border border-black/70 px-3 py-2 text-right font-bold tabular-nums', COR[v.tom])}>{reais(v.valor)}</td></tr>
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </CaberNaTela>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" className="gap-1" onClick={() => posto && onVerPedidos(posto.id)}>
            <ClipboardList className="h-4 w-4" /> Ver os pedidos do posto
          </Button>
          <div className="flex flex-wrap gap-2">
            {can('pedidos_material', 'edit') && <ImportarGastoMensal rotulo="Atualizar pela planilha" onImportado={() => setRecarregar(n => n + 1)} />}
            <Button className="gap-1" onClick={imprimir} disabled={!rel}><Printer className="h-4 w-4" /> Imprimir / PDF</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
