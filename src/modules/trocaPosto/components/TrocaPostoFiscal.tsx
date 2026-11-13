import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, Check, CheckCircle2, Loader2, MapPin, RefreshCw, Search, Send, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Solicitante } from '@/modules/crachas/lib/solicitacaoService';
import {
  MOTIVOS, dataBr, dataHoraBr, fiscalBuscarColaborador, fiscalMinhasTrocas, fiscalPostos, fiscalSolicitarTroca, motivoSenior, nomePosto,
  type ColaboradorTroca, type PostoSenior, type TrocaDoFiscal,
} from '../lib/trocaPostoService';
import SeloStatusTroca from './SeloStatusTroca';

/**
 * Aba "Troca de posto" no link do fiscal (/movimentacao-diaria): o fiscal pede a
 * troca de posto de um colaborador. O pedido vai para a mesma fila da tela
 * Troca de Posto, onde é aprovado e, depois, enviado à Senior.
 */

const hojeIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const somarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function TrocaPostoFiscal({ quem }: { quem: Solicitante }) {
  const [minhas, setMinhas] = useState<TrocaDoFiscal[] | null>(null);
  const [recarregando, setRecarregando] = useState(false);

  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<ColaboradorTroca[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [colab, setColab] = useState<ColaboradorTroca | null>(null);
  const seq = useRef(0);

  const [postos, setPostos] = useState<PostoSenior[] | null>(null);
  const [filtroPosto, setFiltroPosto] = useState('');
  const [posto, setPosto] = useState<PostoSenior | null>(null);
  const [data, setData] = useState(somarDias(hojeIso(), 1));
  const [motivo, setMotivo] = useState('');
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<string | null>(null);

  const carregarMinhas = async () => {
    setRecarregando(true);
    try { setMinhas(await fiscalMinhasTrocas(quem)); }
    catch (e) { toast.error((e as Error).message); setMinhas([]); }
    finally { setRecarregando(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregarMinhas(); }, [quem]);

  // Busca: nome (3+ letras), matrícula ou CPF.
  useEffect(() => {
    const t = busca.trim();
    const pronto = /^[\d.\-\s]+$/.test(t) ? t.replace(/\D/g, '').length >= 1 : t.replace(/\s/g, '').length >= 3;
    if (colab || !pronto) { setAchados(null); return; }
    const n = ++seq.current;
    const timer = setTimeout(async () => {
      setBuscando(true);
      try { const r = await fiscalBuscarColaborador(quem, t); if (n === seq.current) setAchados(r); }
      catch (e) { if (n === seq.current) toast.error((e as Error).message); }
      finally { if (n === seq.current) setBuscando(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [busca, colab, quem]);

  // Postos da mesma empresa do colaborador escolhido.
  useEffect(() => {
    setPostos(null); setPosto(null); setFiltroPosto('');
    if (!colab) return;
    let vivo = true;
    fiscalPostos(quem, colab.id).then(p => { if (vivo) setPostos(p); }, e => { if (vivo) { toast.error((e as Error).message); setPostos([]); } });
    return () => { vivo = false; };
  }, [colab, quem]);

  const postosVisiveis = useMemo(() => {
    const palavras = sem(filtroPosto).split(/\s+/).filter(Boolean);
    return (postos ?? []).filter(p => palavras.every(w => sem(`${p.descricao ?? ''} ${p.codigo}`).includes(w))).slice(0, 60);
  }, [postos, filtroPosto]);

  const limpar = () => {
    setBusca(''); setAchados(null); setColab(null); setPosto(null); setFiltroPosto('');
    setData(somarDias(hojeIso(), 1)); setMotivo(''); setObs('');
  };

  const enviar = async () => {
    if (!colab) return toast.error('Escolha o colaborador.');
    if (!posto) return toast.error('Escolha o posto novo.');
    if (!data) return toast.error('Informe a data de início.');
    if (!motivo) return toast.error('Escolha o motivo.');
    if (motivo === 'Outro' && !obs.trim()) return toast.error('Em "Outro", explique o motivo na observação.');
    setEnviando(true);
    try {
      const r = await fiscalSolicitarTroca(quem, {
        colaborador_senior_id: colab.id, posto_estrutura: posto.estrutura, posto_codigo: posto.codigo,
        data_inicio: data, motivo, observacao: obs.trim(), motivo_senior: motivoSenior(motivo),
      });
      setFeito(r.codigo); setMinhas(r.minhas); limpar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { toast.error((e as Error).message); } finally { setEnviando(false); }
  };

  return (
    <div className="space-y-4">
      {feito && (
        <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-4 flex gap-3">
          <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
          <div className="text-sm space-y-1">
            <p className="font-semibold">Pedido {feito} enviado para aprovação.</p>
            <p>Nada muda na Senior até o pedido ser aprovado e gravado. Acompanhe o andamento abaixo, em "Meus pedidos".</p>
            <button type="button" className="text-primary underline text-xs" onClick={() => setFeito(null)}>Fechar</button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pedir troca de posto</CardTitle>
          <CardDescription>O pedido vai para aprovação. Só depois de aprovado ele é gravado na Senior.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* 1. Colaborador */}
          <section className="space-y-2">
            <Label className="text-sm">1. Colaborador <span className="text-destructive">*</span></Label>
            {colab ? (
              <div className="rounded-md border border-primary/40 bg-primary/5 p-3 flex gap-3">
                <UserRound className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold break-words">{colab.nome}</p>
                  <p className="text-xs text-muted-foreground">Matrícula {colab.matricula}{colab.cargo ? ` · ${colab.cargo}` : ''}</p>
                  <p className="text-xs mt-1"><MapPin className="inline h-3 w-3 mr-1" />Posto atual: <strong>{nomePosto(colab.posto_descricao, colab.posto_estrutura, colab.posto_codigo)}</strong></p>
                </div>
                <Button type="button" variant="ghost" size="sm" className="gap-1 shrink-0" onClick={() => { setColab(null); setBusca(''); }}>
                  <X className="h-4 w-4" /> Trocar
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input className="pl-8 pr-8" autoComplete="off" placeholder="Nome, matrícula ou CPF" aria-label="Buscar colaborador"
                    value={busca} onChange={e => setBusca(e.target.value.slice(0, 80))} />
                  {buscando && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
                {achados && (
                  <div className="rounded-md border divide-y max-h-64 overflow-y-auto">
                    {achados.length === 0 && <p className="p-3 text-sm text-muted-foreground">Ninguém ativo na Senior com essa busca.</p>}
                    {achados.map(c => (
                      <button key={c.id} type="button" disabled={!!c.pendente} onClick={() => { setColab(c); setAchados(null); }}
                        className="w-full text-left px-3 py-2 hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed">
                        <p className="text-sm font-medium break-words">{c.nome}</p>
                        <p className="text-xs text-muted-foreground">Matrícula {c.matricula} · {nomePosto(c.posto_descricao, c.posto_estrutura, c.posto_codigo)}</p>
                        {c.pendente && <p className="text-xs text-amber-700 dark:text-amber-400">Já tem a troca {c.pendente} esperando aprovação.</p>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          {/* 2. Posto novo */}
          <section className={cn('space-y-2', !colab && 'opacity-50 pointer-events-none')}>
            <Label className="text-sm">2. Posto novo <span className="text-destructive">*</span></Label>
            {posto ? (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-3 flex items-center gap-3 text-sm">
                <ArrowRight className="h-5 w-5 text-emerald-700 shrink-0" />
                <p className="flex-1 min-w-0 font-semibold break-words">{nomePosto(posto.descricao, posto.estrutura, posto.codigo)}</p>
                <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => setPosto(null)}><X className="h-4 w-4" /> Trocar</Button>
              </div>
            ) : colab && (
              <>
                <Input placeholder="Filtrar postos (nome ou código)" value={filtroPosto} onChange={e => setFiltroPosto(e.target.value)} aria-label="Filtrar postos" />
                <div className="rounded-md border divide-y max-h-56 overflow-y-auto">
                  {postos === null && <p className="p-3 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando postos…</p>}
                  {postos && postosVisiveis.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhum posto com esse filtro.</p>}
                  {postosVisiveis.map(p => (
                    <button key={`${p.estrutura}|${p.codigo}`} type="button" onClick={() => setPosto(p)}
                      className="w-full text-left px-3 py-2 hover:bg-muted text-sm">
                      {p.descricao ?? 'Posto sem nome'} <span className="text-muted-foreground text-xs">({p.codigo})</span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">Só aparecem postos da mesma empresa do colaborador.</p>
                {colab.posto_estrutura == null && <p className="text-xs text-destructive">Este colaborador está sem posto na Senior: não dá para pedir a troca por aqui.</p>}
              </>
            )}
          </section>

          {/* 3 e 4 */}
          <section className={cn('space-y-4', !colab && 'opacity-50 pointer-events-none')}>
            <div className="space-y-1.5">
              <Label htmlFor="tpf-data" className="text-sm">3. Início no posto novo <span className="text-destructive">*</span></Label>
              <Input id="tpf-data" type="date" value={data} min={somarDias(hojeIso(), -30)} max={somarDias(hojeIso(), 90)} onChange={e => setData(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">4. Motivo <span className="text-destructive">*</span></Label>
              <div className="flex flex-wrap gap-2">
                {MOTIVOS.map(m => (
                  <button key={m} type="button" onClick={() => setMotivo(m)}
                    className={cn('rounded-full border px-3 py-1.5 text-xs font-medium', motivo === m ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>
                    {motivo === m && <Check className="inline h-3 w-3 mr-1" />}{m}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpf-obs" className="text-sm">Observação {motivo === 'Outro' ? '(obrigatória)' : '(opcional)'}</Label>
              <Textarea id="tpf-obs" rows={2} value={obs} onChange={e => setObs(e.target.value.slice(0, 500))} placeholder="Ex.: pedido do gestor do contrato" />
            </div>
          </section>

          <Button type="button" className="w-full gap-2" size="lg" disabled={enviando || !colab || !posto} onClick={enviar}>
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar para aprovação
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Meus pedidos de troca</CardTitle>
          <Button type="button" variant="ghost" size="sm" className="gap-1" disabled={recarregando} onClick={carregarMinhas}>
            <RefreshCw className={cn('h-4 w-4', recarregando && 'animate-spin')} /> Atualizar
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {minhas === null && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}
          {minhas?.length === 0 && <p className="text-sm text-muted-foreground">Você ainda não pediu nenhuma troca de posto.</p>}
          {minhas?.map(t => (
            <div key={t.codigo} className="rounded-md border p-3 text-sm space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold break-words">{t.colaborador_nome}</span>
                <SeloStatusTroca status={t.status} />
              </div>
              <p className="text-xs">{t.posto_atual ?? t.posto_atual_codigo ?? 'sem posto'} <ArrowRight className="inline h-3 w-3" /> <strong>{t.posto_novo ?? t.posto_novo_codigo}</strong></p>
              <p className="text-xs text-muted-foreground">A partir de {dataBr(t.data_inicio)} · {t.motivo} · pedido em {dataHoraBr(t.criado_em)} · {t.codigo}</p>
              {t.decisao_obs && <p className="text-xs">Resposta: {t.decisao_obs}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
