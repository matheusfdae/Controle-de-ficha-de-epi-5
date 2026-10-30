import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Camera, CheckCircle2, ClipboardCheck, Loader2, Lock, PackageOpen, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import SignaturePad from '@/components/SignaturePad';
import { useAuth } from '@/contexts/AuthContext';
import { listPostos, type Posto } from '@/services/postosService';
import { getMinhaAssinatura } from '@/services/assinaturaUsuarioService';
import { formatarNumero, listAprovadores, listMateriais, materiaisPediveis, nomeMaterial, type Aprovador, type Material } from '../lib/pedidosService';
import {
  abrirPlantao, cancelarPlantao, comprimirFoto, esperado, fecharPlantao, fotosDoPlantao, plantoesDoPosto, saldoDoPosto,
  type ItemPlantao, type Plantao, type SaldoPosto,
} from '../lib/estoqueService';

/**
 * Estoque do posto por plantão. O supervisor abre o plantão com a foto do
 * depósito e a contagem; no fim, foto, o que foi usado/recebido e a contagem
 * final, rubrica e declaração. O banco confere tudo e só então atualiza o
 * estoque do posto.
 */

const DECLARACAO = 'Declaro que estou ciente e concordo que as quantidades lançadas são as que existem no depósito de material do posto.';
const num = (v: string) => { const x = Number(v.replace(',', '.')); return v.trim() === '' ? 0 : x; };
const txt = (v: number) => String(v).replace('.', ',');
const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

function CampoFoto({ foto, onFoto, rotulo }: { foto: string; onFoto: (f: string) => void; rotulo: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [lendo, setLendo] = useState(false);
  return (
    <div className="space-y-2">
      <Label>{rotulo} *</Label>
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={async e => {
        const f = e.target.files?.[0]; e.target.value = '';
        if (!f) return;
        setLendo(true);
        try { onFoto(await comprimirFoto(f)); } catch (err) { toast.error((err as Error).message); } finally { setLendo(false); }
      }} />
      {foto ? (
        <div className="relative w-full max-w-sm">
          <img src={foto} alt={rotulo} className="w-full rounded-lg border object-cover max-h-64" />
          <Button type="button" size="sm" variant="secondary" className="absolute bottom-2 right-2 gap-1" onClick={() => ref.current?.click()}>
            <Camera className="h-4 w-4" /> Tirar outra
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" className="w-full max-w-sm h-24 gap-2 border-dashed" disabled={lendo} onClick={() => ref.current?.click()}>
          {lendo ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />} Fotografar o depósito
        </Button>
      )}
    </div>
  );
}

function AdicionarItem({ opcoes, materiais, onAdicionar }: { opcoes: Material[]; materiais: Material[]; onAdicionar: (id: string) => void }) {
  const [valor, setValor] = useState('');
  if (!opcoes.length) return null;
  return (
    <div className="flex gap-2 items-center">
      <Select value={valor} onValueChange={v => { setValor(''); onAdicionar(v); }}>
        <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Adicionar item" /></SelectTrigger>
        <SelectContent>{opcoes.map(m => <SelectItem key={m.id} value={m.id}>{nomeMaterial(m, materiais)} ({m.unidade})</SelectItem>)}</SelectContent>
      </Select>
      <Plus className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

export default function EstoquePosto() {
  const { user } = useAuth();
  const [postos, setPostos] = useState<Posto[]>([]);
  const [aprovadores, setAprovadores] = useState<Aprovador[]>([]);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [postoId, setPostoId] = useState('');
  const [saldo, setSaldo] = useState<SaldoPosto[]>([]);
  const [plantoes, setPlantoes] = useState<(Plantao & { itens: ItemPlantao[] })[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [detalhe, setDetalhe] = useState<(Plantao & { itens: ItemPlantao[] }) | null>(null);

  const souAdmin = user?.role === 'admin';
  const meusPostos = useMemo(() => postos.filter(p => souAdmin || aprovadores.some(a => a.user_id === user?.id
    && ['supervisor', 'gerencia'].includes(a.nivel) && a.uf === p.uf && (a.postos.length === 0 || a.postos.includes(p.id)))), [postos, aprovadores, souAdmin, user?.id]);

  useEffect(() => {
    Promise.all([listPostos(), listAprovadores(), listMateriais()])
      .then(([po, a, m]) => { setPostos(po); setAprovadores(a); setMateriais(m); })
      .catch(e => toast.error('Erro ao carregar: ' + (e as Error).message))
      .finally(() => setCarregando(false));
  }, []);
  useEffect(() => { if (!postoId && meusPostos.length === 1) setPostoId(meusPostos[0].id); }, [meusPostos, postoId]);

  const carregarPosto = useCallback(async () => {
    if (!postoId) return;
    setCarregando(true);
    try {
      const [s, p] = await Promise.all([saldoDoPosto(postoId), plantoesDoPosto(postoId)]);
      setSaldo(s); setPlantoes(p);
    } catch (e) { toast.error('Erro ao carregar o estoque: ' + (e as Error).message); }
    finally { setCarregando(false); }
  }, [postoId]);
  useEffect(() => { carregarPosto(); }, [carregarPosto]);

  const aberto = plantoes.find(p => p.status === 'aberto');
  const fechados = plantoes.filter(p => p.status === 'fechado');
  const mat = (id: string) => materiais.find(m => m.id === id);
  const nome = (id: string) => nomeMaterial(mat(id), materiais);

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-5xl mx-auto space-y-6">
        <BackButton />
        <PageHeader title="Estoque do Posto" eyebrow="Pedidos"
          description="Controle por plantão: no início, foto e contagem do depósito; no fim, foto, o que foi usado e a contagem final, com a rubrica do supervisor." />

        <div className="max-w-sm">
          <Label>Posto</Label>
          <Select value={postoId} onValueChange={setPostoId}>
            <SelectTrigger><SelectValue placeholder={meusPostos.length ? 'Escolha o posto' : 'Nenhum posto com você como supervisor'} /></SelectTrigger>
            <SelectContent>{meusPostos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome} ({p.uf})</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {carregando && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}

        {postoId && !carregando && (aberto
          ? <FecharPlantao key={aberto.id} plantao={aberto} materiais={materiais} nome={nome} userId={user?.id ?? ''} onPronto={carregarPosto} />
          : <AbrirPlantao key={postoId} postoId={postoId} saldo={saldo} materiais={materiais} nome={nome} onPronto={carregarPosto} />)}

        {postoId && !carregando && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Estoque atual do posto</CardTitle>
                <CardDescription>Contagem do último plantão fechado.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Quantidade</TableHead><TableHead>Atualizado</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {saldo.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Ainda sem contagem. Abra o primeiro plantão.</TableCell></TableRow>}
                    {[...saldo].sort((a, b) => nome(a.material_id).localeCompare(nome(b.material_id))).map(s => (
                      <TableRow key={s.material_id}>
                        <TableCell>{nome(s.material_id)} <span className="text-xs text-muted-foreground">{mat(s.material_id)?.unidade}</span></TableCell>
                        <TableCell className={`text-right tabular-nums font-medium ${s.quantidade === 0 ? 'text-destructive' : ''}`}>{formatarNumero(s.quantidade)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{dataHora(s.atualizado_em)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Plantões anteriores</CardTitle>
                <CardDescription>Clique para ver as fotos, os itens e a rubrica.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {fechados.length === 0 && <li className="px-4 py-6 text-sm text-center text-muted-foreground">Nenhum plantão fechado ainda.</li>}
                  {fechados.map(p => (
                    <li key={p.id}>
                      <button type="button" className="w-full text-left px-4 py-3 hover:bg-muted/50" onClick={() => setDetalhe(p)}>
                        <span className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-medium">{dataHora(p.aberto_em)} → {dataHora(p.fechado_em)}</span>
                          {p.tem_diferenca
                            ? <Badge variant="outline" className="gap-1 text-destructive border-destructive/40"><AlertTriangle className="h-3 w-3" /> Diferença</Badge>
                            : <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-600" /> Conferido</Badge>}
                        </span>
                        <span className="block text-xs text-muted-foreground truncate">
                          {p.fechado_por_nome} · usado: {p.itens.filter(i => (i.qtd_usada ?? 0) > 0).map(i => `${formatarNumero(i.qtd_usada ?? 0)} ${nome(i.material_id)}`).join(', ') || 'nada'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {detalhe && <DetalhePlantao plantao={detalhe} nome={nome} unidade={id => mat(id)?.unidade ?? ''} onFechar={() => setDetalhe(null)} />}
    </div>
  );
}

function AbrirPlantao({ postoId, saldo, materiais, nome, onPronto }: {
  postoId: string; saldo: SaldoPosto[]; materiais: Material[]; nome: (id: string) => string; onPronto: () => Promise<void>;
}) {
  const [foto, setFoto] = useState('');
  const [linhas, setLinhas] = useState<{ material_id: string; quantidade: string }[]>(
    [...saldo].sort((a, b) => nome(a.material_id).localeCompare(nome(b.material_id))).map(s => ({ material_id: s.material_id, quantidade: txt(s.quantidade) })));
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const opcoes = materiaisPediveis(materiais).filter(m => !linhas.some(l => l.material_id === m.id));

  const abrir = async () => {
    if (!foto) return toast.error('Fotografe o depósito antes de abrir o plantão.');
    if (!linhas.length) return toast.error('Adicione os itens do depósito.');
    const itens = linhas.map(l => ({ material_id: l.material_id, quantidade: num(l.quantidade) }));
    const ruim = itens.find(i => !(i.quantidade >= 0));
    if (ruim) return toast.error(`Quantidade inválida em ${nome(ruim.material_id)}.`);
    setSalvando(true);
    try { await abrirPlantao(postoId, foto, itens, obs); toast.success('Plantão aberto.'); await onPronto(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setSalvando(false); }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><PackageOpen className="h-5 w-5 text-primary" /> Início do plantão</CardTitle>
        <CardDescription>Fotografe o depósito e confira a quantidade de cada item. A lista já vem com o estoque do último plantão.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <CampoFoto foto={foto} onFoto={setFoto} rotulo="Foto do depósito no início" />
        <div className="space-y-2">
          <Label>Quantidade no depósito agora</Label>
          {linhas.map((l, i) => (
            <div key={l.material_id} className="flex items-center gap-2">
              <span className="flex-1 text-sm">{nome(l.material_id)} <span className="text-xs text-muted-foreground">{materiais.find(m => m.id === l.material_id)?.unidade}</span></span>
              <Input inputMode="decimal" className="w-24 text-right" aria-label={`Quantidade de ${nome(l.material_id)}`} value={l.quantidade}
                onChange={e => setLinhas(ls => ls.map((x, j) => (j === i ? { ...x, quantidade: e.target.value } : x)))} />
              <Button type="button" size="icon" variant="ghost" aria-label="Tirar item" onClick={() => setLinhas(ls => ls.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <AdicionarItem opcoes={opcoes} materiais={materiais} onAdicionar={id => setLinhas(ls => [...ls, { material_id: id, quantidade: '' }])} />
        </div>
        <div>
          <Label htmlFor="obs-ini">Observação (opcional)</Label>
          <Textarea id="obs-ini" rows={2} maxLength={1000} value={obs} onChange={e => setObs(e.target.value)} />
        </div>
        <Button className="w-full sm:w-auto gap-2" size="lg" disabled={salvando} onClick={abrir}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageOpen className="h-4 w-4" />} Abrir plantão
        </Button>
      </CardContent>
    </Card>
  );
}

function FecharPlantao({ plantao, materiais, nome, userId, onPronto }: {
  plantao: Plantao & { itens: ItemPlantao[] }; materiais: Material[]; nome: (id: string) => string; userId: string; onPronto: () => Promise<void>;
}) {
  const [foto, setFoto] = useState('');
  const [linhas, setLinhas] = useState(() => [...plantao.itens].sort((a, b) => nome(a.material_id).localeCompare(nome(b.material_id)))
    .map(i => ({ material_id: i.material_id, inicio: i.qtd_inicio, recebida: '', usada: '', final: txt(i.qtd_inicio), finalTocado: false })));
  const [obs, setObs] = useState('');
  const [salva, setSalva] = useState('');
  const [assinatura, setAssinatura] = useState('');
  const [desenhar, setDesenhar] = useState(false);
  const [ciente, setCiente] = useState(false);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (userId) getMinhaAssinatura(userId).then(a => { setSalva(a); if (!a) setDesenhar(true); }).catch(() => setDesenhar(true)); }, [userId]);

  const opcoes = materiaisPediveis(materiais).filter(m => !linhas.some(l => l.material_id === m.id));
  const mudar = (i: number, campo: 'recebida' | 'usada' | 'final', v: string) => setLinhas(ls => ls.map((l, j) => {
    if (j !== i) return l;
    const n = { ...l, [campo]: v, finalTocado: l.finalTocado || campo === 'final' };
    // Enquanto a contagem final não foi mexida, ela acompanha o esperado.
    if (campo !== 'final' && !l.finalTocado) n.final = txt(esperado(l.inicio, num(n.recebida), num(n.usada)));
    return n;
  }));
  const dif = (l: typeof linhas[number]) => Math.round((num(l.final) - (l.inicio + num(l.recebida) - num(l.usada))) * 100) / 100;
  const comDiferenca = linhas.filter(l => l.final.trim() !== '' && dif(l) !== 0);
  const rubrica = desenhar ? assinatura : salva;

  const fechar = async () => {
    if (!foto) return toast.error('Fotografe o depósito no fim do plantão.');
    for (const l of linhas) {
      if (l.final.trim() === '' || !(num(l.final) >= 0) || !(num(l.usada) >= 0) || !(num(l.recebida) >= 0)) return toast.error(`Confira os números de ${nome(l.material_id)}.`);
    }
    if (comDiferenca.length && !obs.trim()) return toast.error('A contagem final não bate. Explique a diferença na observação.');
    if (!rubrica) return toast.error('Faça a sua rubrica.');
    if (!ciente) return toast.error('Marque a declaração de que as quantidades são as do depósito.');
    setSalvando(true);
    try {
      const r = await fecharPlantao(plantao.id, foto, linhas.map(l => ({ material_id: l.material_id, usada: num(l.usada), recebida: num(l.recebida), final: num(l.final) })), rubrica, ciente, obs);
      toast.success(r.diferencas ? `Plantão fechado com diferença em ${r.diferencas} item(ns). Estoque atualizado.` : 'Plantão fechado. Estoque atualizado.');
      await onPronto();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSalvando(false); }
  };

  return (
    <Card className="border-amber-400/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-amber-600" /> Fim do plantão</CardTitle>
        <CardDescription>Aberto em {dataHora(plantao.aberto_em)} por {plantao.aberto_por_nome ?? '—'}. Lance o que foi usado (e o que chegou) e confira a contagem final.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <CampoFoto foto={foto} onFoto={setFoto} rotulo="Foto do depósito no fim" />

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Início</TableHead>
                <TableHead className="text-right w-24">Recebido</TableHead>
                <TableHead className="text-right w-24">Usado</TableHead>
                <TableHead className="text-right w-28">Contagem final</TableHead>
                <TableHead className="text-right">Diferença</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l, i) => {
                const d = dif(l);
                return (
                  <TableRow key={l.material_id}>
                    <TableCell className="text-sm">{nome(l.material_id)} <span className="text-xs text-muted-foreground">{materiais.find(m => m.id === l.material_id)?.unidade}</span></TableCell>
                    <TableCell className="text-right tabular-nums">{formatarNumero(l.inicio)}</TableCell>
                    <TableCell><Input inputMode="decimal" className="text-right h-9" placeholder="0" aria-label={`Recebido de ${nome(l.material_id)}`} value={l.recebida} onChange={e => mudar(i, 'recebida', e.target.value)} /></TableCell>
                    <TableCell><Input inputMode="decimal" className="text-right h-9" placeholder="0" aria-label={`Usado de ${nome(l.material_id)}`} value={l.usada} onChange={e => mudar(i, 'usada', e.target.value)} /></TableCell>
                    <TableCell><Input inputMode="decimal" className="text-right h-9" aria-label={`Contagem final de ${nome(l.material_id)}`} value={l.final} onChange={e => mudar(i, 'final', e.target.value)} /></TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${d < 0 ? 'text-destructive' : d > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                      {d === 0 ? 'ok' : `${d > 0 ? '+' : ''}${formatarNumero(d)}`}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <AdicionarItem opcoes={opcoes} materiais={materiais}
          onAdicionar={id => setLinhas(ls => [...ls, { material_id: id, inicio: 0, recebida: '', usada: '', final: '', finalTocado: false }])} />
        <p className="text-xs text-muted-foreground">Item que chegou durante o plantão: adicione e lance em "Recebido". A contagem final é preenchida com início + recebido − usado; corrija se a contagem real for outra.</p>

        {comDiferenca.length > 0 && (
          <p className="text-sm text-destructive flex items-start gap-1"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            A contagem não bate em {comDiferenca.map(l => nome(l.material_id)).join(', ')}. Explique a diferença na observação.</p>
        )}
        <div>
          <Label htmlFor="obs-fim">Observação {comDiferenca.length > 0 ? '*' : '(opcional)'}</Label>
          <Textarea id="obs-fim" rows={2} maxLength={1000} value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: uma luva rasgou e foi descartada" />
        </div>

        <div className="rounded-lg border p-3 space-y-3">
          <p className="text-sm font-medium flex items-center gap-2"><Lock className="h-4 w-4" /> Rubrica do supervisor</p>
          {!desenhar && salva ? (
            <div className="flex items-end gap-3 flex-wrap">
              <img src={salva} alt="Sua rubrica" className="h-16 bg-white rounded border px-2" />
              <Button type="button" variant="ghost" size="sm" onClick={() => setDesenhar(true)}>Assinar de novo</Button>
            </div>
          ) : (
            <SignaturePad label="Assine com o dedo" onSave={setAssinatura} grande />
          )}
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <Checkbox checked={ciente} onCheckedChange={v => setCiente(v === true)} className="mt-0.5" aria-label="Declaração de conferência" />
            <span>{DECLARACAO}</span>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="lg" className="gap-2" disabled={salvando} onClick={fechar}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />} Fechar plantão e atualizar estoque
          </Button>
          <Button variant="ghost" className="gap-1" disabled={salvando} onClick={async () => {
            if (!confirm('Cancelar este plantão? A contagem do início será apagada.')) return;
            try { await cancelarPlantao(plantao.id); toast.success('Plantão cancelado.'); await onPronto(); } catch (e) { toast.error((e as Error).message); }
          }}><X className="h-4 w-4" /> Cancelar plantão</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DetalhePlantao({ plantao: p, nome, unidade, onFechar }: {
  plantao: Plantao & { itens: ItemPlantao[] }; nome: (id: string) => string; unidade: (id: string) => string; onFechar: () => void;
}) {
  const [fotos, setFotos] = useState<{ inicio?: string; fim?: string } | null>(null);
  useEffect(() => { fotosDoPlantao(p.id).then(setFotos).catch(() => setFotos({})); }, [p.id]);
  return (
    <Dialog open onOpenChange={o => !o && onFechar()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Plantão de {dataHora(p.aberto_em)}</DialogTitle>
          <DialogDescription>Aberto por {p.aberto_por_nome ?? '—'} · fechado em {dataHora(p.fechado_em)} por {p.fechado_por_nome ?? '—'}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['inicio', 'fim'] as const).map(m => (
            <figure key={m} className="space-y-1">
              {fotos === null ? <div className="h-48 grid place-items-center rounded border"><Loader2 className="h-5 w-5 animate-spin" /></div>
                : fotos[m] ? <img src={fotos[m]} alt={`Depósito no ${m === 'inicio' ? 'início' : 'fim'}`} className="w-full max-h-64 object-cover rounded border" />
                : <div className="h-48 grid place-items-center rounded border text-sm text-muted-foreground">Sem foto</div>}
              <figcaption className="text-xs text-muted-foreground">Depósito no {m === 'inicio' ? 'início' : 'fim'}</figcaption>
            </figure>
          ))}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead><TableHead className="text-right">Início</TableHead><TableHead className="text-right">Recebido</TableHead>
              <TableHead className="text-right">Usado</TableHead><TableHead className="text-right">Final</TableHead><TableHead className="text-right">Diferença</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {p.itens.map(i => (
              <TableRow key={i.material_id}>
                <TableCell>{nome(i.material_id)} <span className="text-xs text-muted-foreground">{unidade(i.material_id)}</span></TableCell>
                <TableCell className="text-right tabular-nums">{formatarNumero(i.qtd_inicio)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarNumero(i.qtd_recebida)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarNumero(i.qtd_usada ?? 0)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarNumero(i.qtd_fim ?? 0)}</TableCell>
                <TableCell className={`text-right tabular-nums ${(i.diferenca ?? 0) !== 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                  {(i.diferenca ?? 0) === 0 ? 'ok' : formatarNumero(i.diferenca ?? 0)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {p.observacao_fim && <p className="text-sm"><span className="text-muted-foreground">Observação:</span> {p.observacao_fim}</p>}
        <div className="rounded-lg border p-3 text-sm space-y-2">
          {p.assinatura && <img src={p.assinatura} alt="Rubrica do supervisor" className="h-16 bg-white rounded border px-2" />}
          <p className="text-xs text-muted-foreground">{DECLARACAO} Aceito em {dataHora(p.declaracao_aceita_em)} por {p.fechado_por_nome ?? '—'}.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
