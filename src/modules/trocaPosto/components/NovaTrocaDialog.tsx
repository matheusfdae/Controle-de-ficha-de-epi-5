import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, ArrowRight, Check, Loader2, MapPin, Search, UserRound, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  MOTIVOS, MOTIVOS_SENIOR, buscarColaborador, motivoSenior, nomePosto, opcoesSenior, padraoDoPosto, postoDaMesmaEmpresa, solicitarTroca,
  type ColaboradorTroca, type EscalaSenior, type PadraoComNomes, type PostoSenior,
} from '../lib/trocaPostoService';
import PadraoPostoCard from './PadraoPostoCard';

const hojeIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const somarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MANTER = '__manter__';

/** Pedido de troca de posto: colaborador da Senior, posto novo, data, motivo. */
export default function NovaTrocaDialog({ aberto, fechar, criada }: {
  aberto: boolean; fechar: () => void; criada: (codigo: string) => void;
}) {
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<ColaboradorTroca[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [colab, setColab] = useState<ColaboradorTroca | null>(null);
  const seq = useRef(0);

  const [postos, setPostos] = useState<PostoSenior[]>([]);
  const [escalas, setEscalas] = useState<EscalaSenior[]>([]);
  const [filtroPosto, setFiltroPosto] = useState('');
  const [outrosEstados, setOutrosEstados] = useState(false);
  const [posto, setPosto] = useState<PostoSenior | null>(null);
  const [escala, setEscala] = useState(MANTER);
  const [data, setData] = useState(somarDias(hojeIso(), 1));
  const [motivo, setMotivo] = useState('');
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [padrao, setPadrao] = useState<PadraoComNomes | null>(null);
  const [lendoPadrao, setLendoPadrao] = useState(false);
  const [erroPadrao, setErroPadrao] = useState('');
  const [manterCargo, setManterCargo] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    opcoesSenior().then(r => { setPostos(r.postos); setEscalas(r.escalas); }, e => toast.error((e as Error).message));
  }, [aberto]);

  const limpar = () => {
    setBusca(''); setAchados(null); setColab(null); setPosto(null); setFiltroPosto(''); setOutrosEstados(false);
    setEscala(MANTER); setData(somarDias(hojeIso(), 1)); setMotivo(''); setObs('');
    setPadrao(null); setErroPadrao(''); setManterCargo(false);
  };

  // Ao escolher o posto: o que a Senior aplica junto (cargo, local, centro de custo).
  useEffect(() => {
    setPadrao(null); setErroPadrao(''); setManterCargo(false);
    if (!posto) return;
    let vivo = true;
    setLendoPadrao(true);
    padraoDoPosto(posto.estrutura, posto.codigo)
      .then(p => { if (vivo) setPadrao(p); }, e => { if (vivo) setErroPadrao((e as Error).message); })
      .finally(() => { if (vivo) setLendoPadrao(false); });
    return () => { vivo = false; };
  }, [posto]);
  const cargoMuda = !!padrao?.cargo && !!colab?.cod_cargo && padrao.cargo !== colab.cod_cargo;

  useEffect(() => {
    const t = busca.trim();
    const pronto = /^[\d.\-\s]+$/.test(t) ? t.replace(/\D/g, '').length >= 1 : t.replace(/\s/g, '').length >= 3;
    if (colab || !pronto) { setAchados(null); return; }
    const n = ++seq.current;
    const timer = setTimeout(async () => {
      setBuscando(true);
      try { const r = await buscarColaborador(t); if (n === seq.current) setAchados(r); }
      catch (e) { if (n === seq.current) toast.error((e as Error).message); }
      finally { if (n === seq.current) setBuscando(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [busca, colab]);

  const postosVisiveis = useMemo(() => {
    const palavras = sem(filtroPosto).split(/\s+/).filter(Boolean);
    return postos
      .filter(p => !(colab && p.estrutura === colab.posto_estrutura && p.codigo === colab.posto_codigo))
      // Só postos da MESMA EMPRESA do colaborador (empresa 1 -> 1, empresa 3 -> 3).
      .filter(p => !colab || postoDaMesmaEmpresa(p, colab))
      .filter(p => outrosEstados || !colab?.uf || !p.uf || p.uf === colab.uf)
      .filter(p => palavras.every(w => sem(`${p.descricao ?? ''} ${p.codigo}`).includes(w)))
      .slice(0, 60);
  }, [postos, filtroPosto, outrosEstados, colab]);

  const enviar = async () => {
    if (!colab) return toast.error('Escolha o colaborador.');
    if (!posto) return toast.error('Escolha o posto novo.');
    if (!data) return toast.error('Informe a data de início.');
    if (!motivo) return toast.error('Escolha o motivo.');
    if (motivo === 'Outro' && !obs.trim()) return toast.error('Em "Outro", explique o motivo na observação.');
    setEnviando(true);
    try {
      const r = await solicitarTroca({
        colaborador_senior_id: colab.id, posto_estrutura: posto.estrutura, posto_codigo: posto.codigo,
        escala_codigo: escala === MANTER ? null : Number(escala), data_inicio: data, motivo, observacao: obs.trim(),
        motivo_senior: motivoSenior(motivo), manter_cargo: cargoMuda && manterCargo, padrao_posto: padrao,
      });
      criada(r.codigo); limpar(); fechar();
    } catch (e) { toast.error((e as Error).message); } finally { setEnviando(false); }
  };

  return (
    <Dialog open={aberto} onOpenChange={v => { if (!v) fechar(); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova troca de posto</DialogTitle>
          <DialogDescription>O pedido vai para aprovação. Nada é alterado na Senior por enquanto.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* 1. Colaborador */}
          <section className="space-y-2">
            <Label>1. Colaborador</Label>
            {colab ? (
              <div className="rounded-md border border-primary/40 bg-primary/5 p-3 flex gap-3">
                <UserRound className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold break-words">{colab.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    Matrícula {colab.matricula} · empresa {colab.num_emp}{colab.cargo ? ` · ${colab.cargo}` : ''}{colab.uf ? ` · ${colab.uf}` : ''}
                  </p>
                  <p className="text-xs mt-1"><MapPin className="inline h-3 w-3 mr-1" />Posto atual: <strong>{nomePosto(colab.posto_descricao, colab.posto_estrutura, colab.posto_codigo)}</strong></p>
                  <p className="text-xs text-muted-foreground">Escala: {colab.escala_nome ?? colab.escala_codigo ?? '—'}{colab.local ? ` · Local: ${colab.local}` : ''}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" className="gap-1 shrink-0" onClick={() => { setColab(null); setPosto(null); setBusca(''); }}>
                  <X className="h-4 w-4" /> Trocar
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input className="pl-8" autoFocus placeholder="Nome, matrícula ou CPF" value={busca} onChange={e => setBusca(e.target.value.slice(0, 80))} />
                  {buscando && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
                {achados && (
                  <div className="rounded-md border divide-y max-h-60 overflow-y-auto">
                    {achados.length === 0 && <p className="p-3 text-sm text-muted-foreground">Ninguém ativo na Senior com essa busca.</p>}
                    {achados.map(c => (
                      <button key={c.id} type="button" disabled={!!c.pendente}
                        onClick={() => { setColab(c); setAchados(null); }}
                        className="w-full text-left px-3 py-2 hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed">
                        <p className="text-sm font-medium">{c.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          Matrícula {c.matricula}{c.uf ? ` · ${c.uf}` : ''} · {nomePosto(c.posto_descricao, c.posto_estrutura, c.posto_codigo)}
                        </p>
                        {c.pendente && <p className="text-xs text-amber-700 dark:text-amber-400">Já tem a troca {c.pendente} pendente.</p>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          {/* 2. Posto novo */}
          <section className={cn('space-y-2', !colab && 'opacity-50 pointer-events-none')}>
            <Label>2. Posto novo</Label>
            {posto ? (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-3 flex items-center gap-3 text-sm">
                <ArrowRight className="h-5 w-5 text-emerald-700 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold break-words">{nomePosto(posto.descricao, posto.estrutura, posto.codigo)}</p>
                  <p className="text-xs text-muted-foreground">{posto.uf ?? 'sem estado'} · {posto.colaboradores} colaborador(es) hoje neste posto</p>
                </div>
                <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => setPosto(null)}><X className="h-4 w-4" /> Trocar</Button>
              </div>
            ) : null}
            {posto && (
              <div className="space-y-2">
                {lendoPadrao && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo na Senior o que muda junto com o posto…</p>}
                {erroPadrao && (
                  <p className="text-xs rounded-md bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100 p-2 flex gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> Não deu para ler na Senior o cargo/local/centro de custo do posto ({erroPadrao}). O pedido pode seguir; confira antes de enviar.
                  </p>
                )}
                {padrao && <PadraoPostoCard padrao={padrao} cargoAtual={colab?.cod_cargo ?? null} cargoAtualNome={colab?.cargo ?? null} manterCargo={cargoMuda && manterCargo} />}
                {cargoMuda && (
                  <label className="flex items-start gap-2 text-sm rounded-md border p-2">
                    <Checkbox checked={manterCargo} onCheckedChange={v => setManterCargo(v === true)} className="mt-0.5" />
                    <span>Manter o cargo atual <strong>{colab?.cargo ?? colab?.cod_cargo}</strong> (só troca posto, local e centro de custo)</span>
                  </label>
                )}
              </div>
            )}
            {!posto && (
              <>
                <div className="flex gap-2 flex-wrap items-center">
                  <Input className="flex-1 min-w-[200px]" placeholder="Filtrar postos da Senior (nome ou código)" value={filtroPosto}
                    onChange={e => setFiltroPosto(e.target.value)} />
                  {colab?.uf && (
                    <label className="text-xs flex items-center gap-1.5 text-muted-foreground">
                      <input type="checkbox" checked={outrosEstados} onChange={e => setOutrosEstados(e.target.checked)} /> outros estados
                    </label>
                  )}
                </div>
                <div className="rounded-md border divide-y max-h-56 overflow-y-auto">
                  {postosVisiveis.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhum posto com esse filtro.</p>}
                  {postosVisiveis.map(p => (
                    <button key={`${p.estrutura}|${p.codigo}`} type="button" onClick={() => setPosto(p)}
                      className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex justify-between gap-2">
                      <span className="break-words">{p.descricao ?? 'Posto sem nome'} <span className="text-muted-foreground text-xs">({p.estrutura}/{p.codigo})</span></span>
                      <span className="text-xs text-muted-foreground shrink-0">{p.uf ?? ''} · {p.colaboradores}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">Só postos da <strong>empresa {colab?.num_emp ?? '—'}</strong> (a do colaborador): não é permitido movimentar para outra empresa. Aparecem os postos com alguém lotado hoje na Senior.</p>
                {colab && colab.posto_estrutura == null && <p className="text-xs text-destructive">Este colaborador está sem posto na Senior: não dá para conferir a empresa do posto.</p>}
              </>
            )}
          </section>

          {/* 3. Detalhes */}
          <section className={cn('grid gap-4 sm:grid-cols-2', !colab && 'opacity-50 pointer-events-none')}>
            <div className="space-y-1.5">
              <Label htmlFor="tp-data">3. Início no posto novo</Label>
              <Input id="tp-data" type="date" value={data} min={somarDias(hojeIso(), -30)} max={somarDias(hojeIso(), 90)} onChange={e => setData(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>4. Escala</Label>
              {/* A Senior aplica a escala do posto novo; mandar outra escala junto ela recusa (13/11/2026). */}
              <p className="text-sm text-muted-foreground rounded-md border px-3 py-2">
                A do posto novo (a Senior aplica sozinha), mantendo a turma atual{colab?.escala_nome ? `. Hoje: ${colab.escala_nome}` : ''}.
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>5. Motivo</Label>
              <div className="flex flex-wrap gap-2">
                {MOTIVOS.map(m => (
                  <button key={m} type="button" onClick={() => setMotivo(m)}
                    className={cn('rounded-full border px-3 py-1 text-xs font-medium', motivo === m ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>
                    {motivo === m && <Check className="inline h-3 w-3 mr-1" />}{m}
                  </button>
                ))}
              </div>
              {motivo && <p className="text-[11px] text-muted-foreground">Na Senior: motivo {motivoSenior(motivo)} – {MOTIVOS_SENIOR[motivoSenior(motivo)]}</p>}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="tp-obs">Observação {motivo === 'Outro' ? '(obrigatória)' : '(opcional)'}</Label>
              <Textarea id="tp-obs" rows={2} value={obs} onChange={e => setObs(e.target.value.slice(0, 500))} placeholder="Ex.: pedido do gestor do contrato, e-mail de 12/11" />
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={fechar}>Fechar</Button>
          <Button onClick={enviar} disabled={enviando || !colab || !posto} className="gap-1.5">
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Enviar para aprovação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
