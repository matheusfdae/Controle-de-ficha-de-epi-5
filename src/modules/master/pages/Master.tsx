import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, RotateCcw, Search, Trash2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  apagar, buscarRegistros, listarLixeira, listarTabelas, nomeTabela, previaApagar, restaurar, souMaster,
  type LoteLixeira, type PreviaMaster, type RegistroMaster, type TabelaMaster,
} from '../lib/masterService';

const PALAVRA = 'APAGAR';
const dataHora = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const contagem = (q: Record<string, number>) => Object.entries(q).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${nomeTabela(t)}`).join(' · ');

/** Tela do Master: apagar qualquer registro (com o que depende dele) e a lixeira para restaurar. */
export default function Master() {
  const [master, setMaster] = useState<boolean | null>(null);
  useEffect(() => { souMaster().then(setMaster); }, []);
  if (master === null) return <Loader2 className="m-6 h-5 w-5 animate-spin" />;
  if (!master) return <Navigate to="/" replace />;
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Administração" title="Master"
        description="Apaga qualquer registro do sistema, junto com tudo o que depende dele. O que for apagado fica 90 dias na lixeira e pode ser restaurado." />
      <Tabs defaultValue="apagar">
        <TabsList>
          <TabsTrigger value="apagar" className="gap-1.5"><Trash2 className="h-4 w-4" /> Apagar</TabsTrigger>
          <TabsTrigger value="lixeira" className="gap-1.5"><RotateCcw className="h-4 w-4" /> Lixeira</TabsTrigger>
        </TabsList>
        <TabsContent value="apagar"><Apagar /></TabsContent>
        <TabsContent value="lixeira"><Lixeira /></TabsContent>
      </Tabs>
    </div>
  );
}

function Apagar() {
  const [tabelas, setTabelas] = useState<TabelaMaster[] | null>(null);
  const [tabela, setTabela] = useState('');
  const [busca, setBusca] = useState('');
  const [registros, setRegistros] = useState<RegistroMaster[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);

  const carregarTabelas = () => listarTabelas().then(setTabelas).catch(e => { toast.error(e.message); setTabelas([]); });
  useEffect(() => { carregarTabelas(); }, []);

  const ordenadas = useMemo(() => [...(tabelas ?? [])].filter(t => t.selecionavel)
    .sort((a, b) => Number(nomeTabela(b.tabela) !== b.tabela) - Number(nomeTabela(a.tabela) !== a.tabela) || nomeTabela(a.tabela).localeCompare(nomeTabela(b.tabela))), [tabelas]);

  const pesquisar = async (t = tabela) => {
    if (!t) return;
    setBuscando(true);
    setMarcados(new Set());
    try { setRegistros(await buscarRegistros(t, busca)); } catch (e) { toast.error((e as Error).message); setRegistros([]); } finally { setBuscando(false); }
  };
  const marcar = (id: string, v: boolean) => setMarcados(m => { const n = new Set(m); if (v) n.add(id); else n.delete(id); return n; });

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap gap-2">
          <Select value={tabela} onValueChange={v => { setTabela(v); setRegistros(null); pesquisar(v); }}>
            <SelectTrigger className="w-72"><SelectValue placeholder={tabelas ? 'O que você quer apagar?' : 'Carregando...'} /></SelectTrigger>
            <SelectContent className="max-h-96">
              {ordenadas.map(t => (
                <SelectItem key={t.tabela} value={t.tabela}>{nomeTabela(t.tabela)} <span className="text-muted-foreground">({t.registros})</span></SelectItem>
              ))}
            </SelectContent>
          </Select>
          <form className="flex flex-1 gap-2 min-w-60" onSubmit={e => { e.preventDefault(); pesquisar(); }}>
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar (nome, código, CPF, e-mail... qualquer texto)" disabled={!tabela} />
            <Button type="submit" variant="outline" className="gap-1" disabled={!tabela || buscando}>
              {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar
            </Button>
          </form>
        </div>

        {registros && (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted-foreground">{registros.length === 200 ? 'Mostrando os 200 mais recentes; refine a busca.' : `${registros.length} encontrado(s).`}</span>
              {registros.length > 0 && (
                <button type="button" className="text-primary hover:underline"
                  onClick={() => setMarcados(marcados.size === registros.length ? new Set() : new Set(registros.map(r => r.id)))}>
                  {marcados.size === registros.length ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              )}
              <Button size="sm" variant="destructive" className="ml-auto gap-1" disabled={!marcados.size} onClick={() => setConfirmar(true)}>
                <Trash2 className="h-4 w-4" /> Apagar {marcados.size || ''} selecionado(s)
              </Button>
            </div>
            <ul className="divide-y rounded-md border max-h-[60vh] overflow-y-auto">
              {registros.map(r => (
                <li key={r.id} className="px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={marcados.has(r.id)} onCheckedChange={v => marcar(r.id, v === true)} aria-label={`Marcar ${r.resumo}`} />
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-1 text-left" onClick={() => setAberto(aberto === r.id ? null : r.id)}>
                      {aberto === r.id ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <span className="truncate">{r.resumo}</span>
                    </button>
                  </div>
                  {aberto === r.id && (
                    <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap break-all">{JSON.stringify(r.dados, null, 2)}</pre>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
      {confirmar && (
        <ConfirmarApagar tabela={tabela} ids={[...marcados]} fechar={() => setConfirmar(false)}
          apagou={() => { setConfirmar(false); pesquisar(); carregarTabelas(); }} />
      )}
    </Card>
  );
}

function ConfirmarApagar({ tabela, ids, fechar, apagou }: { tabela: string; ids: string[]; fechar: () => void; apagou: () => void }) {
  const [previa, setPrevia] = useState<PreviaMaster | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [palavra, setPalavra] = useState('');
  const [apagando, setApagando] = useState(false);
  useEffect(() => { previaApagar(tabela, ids).then(setPrevia).catch(e => setErro(e.message)); }, [tabela, ids]);

  const confirmar = async () => {
    setApagando(true);
    try {
      const r = await apagar(tabela, ids, motivo.trim());
      toast.success(`${r.total} registro(s) apagado(s). Ficam 90 dias na lixeira.`, {
        duration: 15000,
        action: { label: 'Desfazer', onClick: () => restaurar(r.lote).then(x => toast.success(`${x.restaurados} registro(s) restaurado(s).`)).catch(e => toast.error(e.message)) },
      });
      apagou();
    } catch (e) { toast.error((e as Error).message); setApagando(false); }
  };

  return (
    <Dialog open onOpenChange={v => !v && !apagando && fechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /> Apagar {ids.length} de {nomeTabela(tabela)}</DialogTitle>
          <DialogDescription>Confira tudo o que sai do sistema junto. Fica 90 dias na lixeira do Master.</DialogDescription>
        </DialogHeader>
        {erro ? <p className="text-sm text-destructive">{erro}</p> : !previa ? <Loader2 className="h-5 w-5 animate-spin" /> : (
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-medium">Será apagado ({previa.total} no total):</p>
              <ul className="mt-1 space-y-0.5">
                {previa.apaga.map(a => (
                  <li key={a.tabela} className="flex justify-between gap-2"><span>{nomeTabela(a.tabela)}</span><Badge variant="destructive">{a.quantidade}</Badge></li>
                ))}
              </ul>
            </div>
            {previa.desliga.length > 0 && (
              <div>
                <p className="font-medium">Continua no sistema, mas perde a ligação:</p>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {previa.desliga.map(a => <li key={a.tabela} className="flex justify-between gap-2"><span>{nomeTabela(a.tabela)}</span><Badge variant="outline">{a.quantidade}</Badge></li>)}
                </ul>
              </div>
            )}
            <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (opcional)" maxLength={500} />
            <div className="space-y-1">
              <p>Para confirmar, digite <b>{PALAVRA}</b>:</p>
              <Input value={palavra} onChange={e => setPalavra(e.target.value)} autoFocus aria-label={`Digite ${PALAVRA}`} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={apagando}>Cancelar</Button>
          <Button variant="destructive" className="gap-1" disabled={!previa || palavra.trim().toUpperCase() !== PALAVRA || apagando} onClick={confirmar}>
            {apagando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Apagar {previa?.total ?? ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Lixeira() {
  const [lotes, setLotes] = useState<LoteLixeira[] | null>(null);
  const [restaurando, setRestaurando] = useState<string | null>(null);
  const carregar = () => listarLixeira().then(setLotes).catch(e => { toast.error(e.message); setLotes([]); });
  useEffect(() => { carregar(); }, []);

  const voltar = async (l: LoteLixeira) => {
    if (!confirm(`Restaurar ${l.total} registro(s) de ${nomeTabela(l.tabela)} (${l.resumo ?? ''})?`)) return;
    setRestaurando(l.id);
    try { const r = await restaurar(l.id); toast.success(`${r.restaurados} registro(s) restaurado(s).`); await carregar(); }
    catch (e) { toast.error((e as Error).message); } finally { setRestaurando(null); }
  };

  if (!lotes) return <Loader2 className="m-4 h-5 w-5 animate-spin" />;
  if (!lotes.length) return <p className="p-4 text-sm text-muted-foreground">Nada apagado nos últimos 90 dias.</p>;
  return (
    <Card>
      <CardContent className="pt-4">
        <ul className="divide-y">
          {lotes.map(l => (
            <li key={l.id} className="flex flex-wrap items-start gap-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p><b>{nomeTabela(l.tabela)}</b>: {l.resumo}</p>
                <p className="text-xs text-muted-foreground">{contagem(l.quantidades)}</p>
                <p className="text-xs text-muted-foreground">
                  Apagado em {dataHora(l.apagado_em)}{l.apagado_por_nome && ` por ${l.apagado_por_nome}`}{l.motivo && ` · Motivo: ${l.motivo}`}
                </p>
              </div>
              {l.restaurado_em
                ? <Badge variant="outline" className="shrink-0">Restaurado em {dataHora(l.restaurado_em)}{l.restaurado_por_nome && ` por ${l.restaurado_por_nome}`}</Badge>
                : (
                  <Button size="sm" variant="outline" className="shrink-0 gap-1" disabled={restaurando !== null} onClick={() => voltar(l)}>
                    {restaurando === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Restaurar
                  </Button>
                )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
