import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, MapPin, Plus, Save, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import MapaPostos, { PontoMapa } from '@/components/MapaPostos';
import ImportarGeoDialog from '@/components/ImportarGeoDialog';
import EstadoSelect from '@/components/EstadoSelect';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/hooks/use-confirm';
import { getFichas } from '@/services/fichaService';
import {
  Posto, chavePosto, excluirPosto, importarPostosDasFichas, indicePostos, listPostos, salvarPosto,
} from '@/services/postosService';
import { EPIFicha } from '@/types/epi';

type Form = { id?: string; nome: string; uf: string; lat: string; lng: string; apelidos: string; endereco: string };

const formVazio = (uf: string): Form => ({ nome: '', uf, lat: '', lng: '', apelidos: '', endereco: '' });

/** "-15.7942, -47.8822" (copiado do Google Maps) -> [lat, lng]. */
function lerCoordenadas(texto: string): [number, number] | null {
  const m = texto.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1].replace(',', '.'));
  const lng = Number(m[2].replace(',', '.'));
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}

export default function Postos() {
  const { can, estados } = useAuth();
  const podeEditar = can('configuracoes', 'edit');
  const { confirm, ConfirmDialog } = useConfirm();
  const navigate = useNavigate();
  const [postos, setPostos] = useState<Posto[]>([]);
  const [fichas, setFichas] = useState<EPIFicha[]>([]);
  const [busca, setBusca] = useState('');
  const [soSemLocal, setSoSemLocal] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [colar, setColar] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = () => {
    listPostos().then(setPostos).catch(e => toast.error(e.message));
    getFichas({ semAssinaturas: true }).then(setFichas).catch(() => {});
  };
  useEffect(carregar, []);

  const indice = useMemo(() => indicePostos(postos), [postos]);

  // Fichas por posto cadastrado (pelo nome ou apelido) e postos das fichas ainda sem cadastro.
  const { fichasPorPosto, semCadastro } = useMemo(() => {
    const porPosto = new Map<string, number>();
    const faltam = new Map<string, { nome: string; ufs: Map<string, number> }>();
    for (const f of fichas) {
      const nome = (f.posto || '').trim();
      if (!nome) continue;
      const p = indice.get(chavePosto(nome));
      if (p) { porPosto.set(p.id, (porPosto.get(p.id) ?? 0) + 1); continue; }
      const k = chavePosto(nome);
      const item = faltam.get(k) ?? { nome, ufs: new Map() };
      item.ufs.set(f.uf, (item.ufs.get(f.uf) ?? 0) + 1);
      faltam.set(k, item);
    }
    return { fichasPorPosto: porPosto, semCadastro: Array.from(faltam.values()) };
  }, [fichas, indice]);

  const visiveis = postos.filter(p =>
    (!soSemLocal || p.latitude == null) &&
    [p.nome, ...p.apelidos].some(n => n.toLowerCase().includes(busca.toLowerCase())));

  const chavesVisiveis = visiveis.map(p => p.id).join(',');
  const pontos: PontoMapa[] = useMemo(() => visiveis
    .filter(p => p.latitude != null && p.longitude != null)
    .map(p => ({
      chave: p.id, nome: p.nome, latitude: p.latitude!, longitude: p.longitude!,
      peso: fichasPorPosto.get(p.id) ?? 0, detalhe: `${fichasPorPosto.get(p.id) ?? 0} fichas · ${p.uf}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    })), [chavesVisiveis, postos, fichasPorPosto]);
  const semLocal = postos.filter(p => p.latitude == null).length;

  async function importar() {
    // Estado de cada posto novo = o estado mais comum nas fichas dele.
    const novos = semCadastro.map(s => ({
      nome: s.nome,
      uf: Array.from(s.ufs.entries()).sort((a, b) => b[1] - a[1])[0][0],
    })).filter(n => estados.includes(n.uf));
    try {
      const criados = await importarPostosDasFichas(novos);
      toast.success(criados ? `${criados} posto(s) criado(s) a partir das fichas. Agora complete a localização.` : 'Nenhum posto novo nas fichas.');
      carregar();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao importar'); }
  }

  const abrir = (p?: Posto) => {
    setColar('');
    setForm(p ? {
      id: p.id, nome: p.nome, uf: p.uf, lat: p.latitude?.toString() ?? '', lng: p.longitude?.toString() ?? '',
      apelidos: p.apelidos.join(', '), endereco: p.endereco ?? '',
    } : formVazio(estados[0] ?? 'DF'));
  };

  const coordForm = (): [number, number] | null => {
    if (!form || (!form.lat.trim() && !form.lng.trim())) return null;
    return lerCoordenadas(`${form.lat},${form.lng}`);
  };

  async function salvar() {
    if (!form) return;
    if (!form.nome.trim()) return toast.error('Informe o nome do posto');
    const temCoord = form.lat.trim() || form.lng.trim();
    const coord = coordForm();
    if (temCoord && !coord) return toast.error('Latitude/longitude inválidas (ex.: -15.7942 e -47.8822)');
    setSalvando(true);
    try {
      await salvarPosto({
        id: form.id, nome: form.nome, uf: form.uf,
        latitude: coord?.[0] ?? null, longitude: coord?.[1] ?? null,
        apelidos: form.apelidos.split(','), endereco: form.endereco,
      });
      toast.success('Posto salvo');
      setForm(null);
      carregar();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  const coordAtual = form ? coordForm() : null;

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-7xl mx-auto space-y-6">
        <BackButton />
        <PageHeader eyebrow="Administração" title="Postos"
          description="Localização de cada posto. Clique na estrela para ver as fichas do posto; clique na linha da tabela para editar."
          actions={podeEditar && (
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={importar} disabled={semCadastro.length === 0}
                title={semCadastro.length ? `${semCadastro.length} posto(s) das fichas ainda sem cadastro` : 'Todos os postos das fichas já estão cadastrados'}>
                <Download className="h-4 w-4 mr-1" /> Importar das fichas{semCadastro.length ? ` (${semCadastro.length})` : ''}
              </Button>
              <ImportarGeoDialog postos={postos} onImportado={carregar} />
              <Button onClick={() => abrir()}><Plus className="h-4 w-4 mr-1" /> Novo posto</Button>
            </div>
          )} />

        <MapaPostos pontos={pontos}
          onSelecionar={id => {
            const p = postos.find(x => x.id === id);
            if (p) navigate(`/rank-postos?posto=${encodeURIComponent(p.nome)}`);
          }} />
        {semLocal > 0 && (
          <p className="text-sm text-muted-foreground">
            {semLocal} posto(s) ainda sem localização — não aparecem no mapa.
          </p>
        )}

        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar posto..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-8" />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={soSemLocal} onCheckedChange={v => setSoSemLocal(!!v)} /> Só os sem localização
          </label>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Posto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead className="text-right">Fichas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map(p => (
                  <TableRow key={p.id} className={podeEditar ? 'cursor-pointer' : ''} onClick={() => podeEditar && abrir(p)}>
                    <TableCell>
                      <div className="font-medium">{p.nome}</div>
                      {p.apelidos.length > 0 && <div className="text-xs text-muted-foreground">também: {p.apelidos.join(', ')}</div>}
                    </TableCell>
                    <TableCell><Badge variant="outline" className="font-mono">{p.uf}</Badge></TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {p.latitude != null
                        ? `${p.latitude.toFixed(5)}, ${p.longitude!.toFixed(5)}`
                        : <span className="text-amber-700 dark:text-amber-400">sem localização</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fichasPorPosto.get(p.id) ?? 0}</TableCell>
                  </TableRow>
                ))}
                {visiveis.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                    <MapPin className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    {postos.length === 0 ? 'Nenhum posto cadastrado. Use "Importar das fichas" para começar.' : 'Nenhum posto encontrado.'}
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!form} onOpenChange={o => !o && setForm(null)}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Editar posto' : 'Novo posto'}</DialogTitle>
            <DialogDescription>Clique no mapa no lugar do posto, ou cole as coordenadas do Google Maps.</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
                <div><Label htmlFor="p-nome">Nome *</Label>
                  <Input id="p-nome" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
                <div><Label htmlFor="p-uf">Estado</Label>
                  <EstadoSelect id="p-uf" value={form.uf} onChange={uf => setForm({ ...form, uf })} /></div>
              </div>
              <div>
                <Label htmlFor="p-colar">Colar coordenadas</Label>
                <Input id="p-colar" placeholder="-15.7942, -47.8822" value={colar}
                  onChange={e => {
                    setColar(e.target.value);
                    const c = lerCoordenadas(e.target.value);
                    if (c) setForm(f => f && ({ ...f, lat: String(c[0]), lng: String(c[1]) }));
                  }} />
                <p className="text-xs text-muted-foreground mt-1">
                  No Google Maps: clique com o botão direito no local e clique nos números que aparecem no topo do menu (eles são copiados).
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="p-lat">Latitude</Label>
                  <Input id="p-lat" inputMode="decimal" value={form.lat} onChange={e => setForm({ ...form, lat: e.target.value })} /></div>
                <div><Label htmlFor="p-lng">Longitude</Label>
                  <Input id="p-lng" inputMode="decimal" value={form.lng} onChange={e => setForm({ ...form, lng: e.target.value })} /></div>
              </div>
              <MapaPostos altura={280}
                pontos={coordAtual ? [{ chave: 'atual', nome: form.nome || 'Posto', latitude: coordAtual[0], longitude: coordAtual[1] }] : []}
                onEscolherPosicao={(lat, lng) => setForm(f => f && ({ ...f, lat: String(lat), lng: String(lng) }))} />
              <div><Label htmlFor="p-apelidos">Outros nomes nas fichas (separados por vírgula)</Label>
                <Input id="p-apelidos" placeholder="PARKSHOPPING, PARK SHOPPING MERCADANTE" value={form.apelidos}
                  onChange={e => setForm({ ...form, apelidos: e.target.value })} />
                <p className="text-xs text-muted-foreground mt-1">Fichas com esses nomes contam para este posto.</p>
              </div>
              <div><Label htmlFor="p-end">Endereço</Label>
                <Input id="p-end" value={form.endereco} onChange={e => setForm({ ...form, endereco: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter className="flex flex-wrap justify-between gap-2">
            {form?.id ? (
              <Button variant="destructive" onClick={async () => {
                if (!form.id || !(await confirm(`Excluir o posto "${form.nome}"? As fichas não são afetadas.`))) return;
                try { await excluirPosto(form.id); setForm(null); carregar(); }
                catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao excluir'); }
              }}><Trash2 className="h-4 w-4 mr-1" /> Excluir</Button>
            ) : <span />}
            <Button onClick={salvar} disabled={salvando}><Save className="h-4 w-4 mr-1" /> Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog />
    </div>
  );
}
