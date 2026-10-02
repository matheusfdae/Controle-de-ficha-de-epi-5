import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Check, ChevronsUpDown, FileUp, Loader2, PackagePlus, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import { EPI, listEpis } from '@/services/estoqueService';
import {
  EntradaCabecalho, EntradaResumo, registrarEntrada, chaveJaLancada,
  listCodigosFornecedor, mapaTamanhos, listUltimasEntradas,
} from '@/services/entradaEstoqueService';
import { parseNFeXml, sugerirEpi, casarTamanho, OrigemSugestao } from '@/lib/nfe';

interface Linha {
  key: string;
  epiId: string;
  tamanho: string;
  quantidade: string;
  descricaoNf: string | null;
  codigoFornecedor: string | null;
  unidade: string | null;
  valorUnitario: number | null;
  sugestao: OrigemSugestao | null;
}

const novaLinha = (): Linha => ({
  key: crypto.randomUUID(), epiId: '', tamanho: '', quantidade: '', descricaoNf: null,
  codigoFornecedor: null, unidade: null, valorUnitario: null, sugestao: null,
});

const cabecalhoVazio = (): EntradaCabecalho => ({
  numero_nf: '', serie: '', chave_acesso: null, fornecedor_nome: '', fornecedor_cnpj: '',
  data_emissao: '', origem: 'manual', observacao: '',
});

const ROTULO_SUGESTAO: Record<OrigemSugestao, string> = {
  memoria: 'lembrado da última nota', ca: 'pelo nº do CA', codigo: 'pelo código', nome: 'pelo nome — confira',
};

function EpiCombobox({ epis, value, onChange }: { epis: EPI[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const atual = epis.find(e => e.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open}
          className={cn('w-full justify-between font-normal', !atual && 'text-muted-foreground')}>
          <span className="truncate">{atual ? atual.nome : 'Escolha o item do catálogo'}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[18rem] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar por nome ou CA..." />
          <CommandList>
            <CommandEmpty>Nenhum item encontrado.</CommandEmpty>
            {(['epi', 'uniforme'] as const).map(tipo => (
              <CommandGroup key={tipo} heading={tipo === 'epi' ? 'EPIs' : 'Uniformes'}>
                {epis.filter(e => e.tipo === tipo).map(e => (
                  <CommandItem key={e.id} value={`${e.nome} ${e.ca_numero ?? ''} ${e.id}`}
                    onSelect={() => { onChange(e.id); setOpen(false); }}>
                    <Check className={cn('mr-2 h-4 w-4', e.id === value ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{e.nome}</span>
                    {e.ca_numero && <span className="ml-auto pl-2 text-xs text-muted-foreground">CA {e.ca_numero}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function EntradaEstoque() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [epis, setEpis] = useState<EPI[]>([]);
  const [tamanhos, setTamanhos] = useState<Record<string, string[]>>({});
  const [cab, setCab] = useState<EntradaCabecalho>(cabecalhoVazio);
  const [linhas, setLinhas] = useState<Linha[]>([novaLinha()]);
  const [ultimas, setUltimas] = useState<EntradaResumo[]>([]);
  const [salvando, setSalvando] = useState(false);

  const carregar = () => {
    listEpis().then(setEpis).catch(e => toast.error(e.message));
    mapaTamanhos().then(setTamanhos).catch(() => {});
    listUltimasEntradas().then(setUltimas).catch(() => {});
  };
  useEffect(carregar, []);

  const setCampo = (campo: keyof EntradaCabecalho, valor: string) => setCab(c => ({ ...c, [campo]: valor }));
  const setLinha = (key: string, patch: Partial<Linha>) =>
    setLinhas(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));

  async function importarXml(file: File) {
    try {
      const nfe = parseNFeXml(await file.text());
      if (nfe.chave && await chaveJaLancada(nfe.chave)) {
        toast.error(`A NF ${nfe.numero ?? ''} já foi lançada no estoque.`);
        return;
      }
      const memoria = nfe.fornecedor.cnpj ? await listCodigosFornecedor(nfe.fornecedor.cnpj) : [];
      setCab({
        numero_nf: nfe.numero ?? '', serie: nfe.serie ?? '', chave_acesso: nfe.chave,
        fornecedor_nome: nfe.fornecedor.nome ?? '', fornecedor_cnpj: nfe.fornecedor.cnpj ?? '',
        data_emissao: nfe.dataEmissao ?? '', origem: 'xml_nfe', observacao: '',
      });
      const novas = nfe.itens.map(item => {
        const s = sugerirEpi(item, nfe.fornecedor.cnpj, epis, memoria);
        return {
          ...novaLinha(),
          epiId: s?.epiId ?? '',
          tamanho: s ? casarTamanho(s.tamanho, tamanhos[s.epiId] ?? []) ?? '' : '',
          quantidade: String(item.quantidade),
          descricaoNf: item.descricao,
          codigoFornecedor: item.codigo || null,
          unidade: item.unidade || null,
          valorUnitario: item.valorUnitario,
          sugestao: s?.origem ?? null,
        };
      });
      setLinhas(novas.length ? novas : [novaLinha()]);
      const semPar = novas.filter(l => !l.epiId).length;
      toast.success(`NF ${nfe.numero ?? ''} lida: ${novas.length} itens` +
        (semPar ? ` — ${semPar} sem correspondência, escolha o item.` : '.'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível ler o XML');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const problemas = useMemo(() => linhas.map(l => {
    const qtd = Number(l.quantidade.replace(',', '.'));
    if (!l.epiId) return 'Escolha o item do catálogo';
    if (!Number.isInteger(qtd) || qtd <= 0) return 'Quantidade deve ser um número inteiro maior que zero';
    if (!l.tamanho.trim() && (tamanhos[l.epiId]?.length ?? 0) > 0) return 'Este item é controlado por tamanho';
    return null;
  }), [linhas, tamanhos]);

  const totalUnidades = linhas.reduce((s, l) => s + (Number(l.quantidade.replace(',', '.')) || 0), 0);

  async function salvar() {
    if (problemas.some(Boolean)) {
      toast.error('Corrija os itens destacados antes de salvar.');
      return;
    }
    setSalvando(true);
    try {
      await registrarEntrada(cab, linhas.map(l => ({
        epi_id: l.epiId,
        tamanho: l.tamanho.trim() || null,
        quantidade: Number(l.quantidade.replace(',', '.')),
        descricao_nf: l.descricaoNf,
        codigo_fornecedor: l.codigoFornecedor,
        valor_unitario: l.valorUnitario,
      })));
      toast.success(`Entrada registrada: ${totalUnidades} unidades em ${linhas.length} itens.`);
      setCab(cabecalhoVazio());
      setLinhas([novaLinha()]);
      carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao registrar a entrada');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-5xl mx-auto space-y-6">
        <BackButton />
        <PageHeader eyebrow="Estoque" title="Registrar entrada"
          description="Lance a nota inteira de uma vez: importe o XML da NF-e ou digite os itens do DANFE. As quantidades são SOMADAS ao estoque."
          actions={<Button variant="outline" onClick={() => navigate('/estoque')}>Ver estoque</Button>} />

        <Card className="border-dashed">
          <CardContent className="p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">Importar XML da NF-e</p>
              <p className="text-sm text-muted-foreground">Preenche a nota e os itens automaticamente. Os itens já lançados antes deste fornecedor vêm reconhecidos.</p>
            </div>
            <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) importarXml(f); }} />
            <Button onClick={() => fileRef.current?.click()} disabled={!epis.length}>
              <FileUp className="h-4 w-4 mr-2" /> Escolher arquivo XML
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Dados da nota</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-6">
            <div className="sm:col-span-2"><Label htmlFor="nf">Nº da NF</Label>
              <Input id="nf" value={cab.numero_nf} onChange={e => setCampo('numero_nf', e.target.value)} /></div>
            <div><Label htmlFor="serie">Série</Label>
              <Input id="serie" value={cab.serie} onChange={e => setCampo('serie', e.target.value)} /></div>
            <div className="sm:col-span-3"><Label htmlFor="emissao">Data de emissão</Label>
              <Input id="emissao" type="date" value={cab.data_emissao} onChange={e => setCampo('data_emissao', e.target.value)} /></div>
            <div className="sm:col-span-4"><Label htmlFor="forn">Fornecedor</Label>
              <Input id="forn" value={cab.fornecedor_nome} onChange={e => setCampo('fornecedor_nome', e.target.value)} /></div>
            <div className="sm:col-span-2"><Label htmlFor="cnpj">CNPJ</Label>
              <Input id="cnpj" value={cab.fornecedor_cnpj} onChange={e => setCampo('fornecedor_cnpj', e.target.value)} /></div>
            <div className="sm:col-span-6"><Label htmlFor="obs">Observação</Label>
              <Input id="obs" value={cab.observacao} onChange={e => setCampo('observacao', e.target.value)} /></div>
            {cab.chave_acesso && (
              <p className="sm:col-span-6 text-xs text-muted-foreground font-mono break-all">Chave NF-e: {cab.chave_acesso}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Itens ({linhas.length})</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setLinhas(ls => [...ls, novaLinha()])}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar item
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {linhas.map((l, i) => {
              // Linha em branco recém-adicionada não aparece como erro.
              const aviso = (l.epiId || l.quantidade || l.descricaoNf) ? problemas[i] : null;
              return (
              <div key={l.key} className={cn('rounded-lg border p-3 space-y-2', aviso && 'border-amber-500/60')}>
                {l.descricaoNf && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-medium text-foreground">NF: {l.descricaoNf}</span>
                    {l.codigoFornecedor && <Badge variant="outline" className="font-mono">{l.codigoFornecedor}</Badge>}
                    {l.unidade && !['UN', 'UND', 'UNID', 'PC', 'PAR', 'PR'].includes(l.unidade) && (
                      <Badge variant="destructive">Unidade {l.unidade}: confira a quantidade em peças</Badge>
                    )}
                    {l.sugestao && <span className="text-muted-foreground">· sugerido {ROTULO_SUGESTAO[l.sugestao]}</span>}
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-[1fr_8rem_7rem_auto] items-start">
                  <EpiCombobox epis={epis} value={l.epiId}
                    onChange={id => setLinha(l.key, { epiId: id, sugestao: null, tamanho: casarTamanho(l.tamanho || null, tamanhos[id] ?? []) ?? '' })} />
                  <div>
                    <Input placeholder="Tamanho" value={l.tamanho} list={`tam-${l.key}`}
                      aria-label="Tamanho" onChange={e => setLinha(l.key, { tamanho: e.target.value })} />
                    <datalist id={`tam-${l.key}`}>
                      {(tamanhos[l.epiId] ?? []).map(t => <option key={t} value={t} />)}
                    </datalist>
                  </div>
                  <Input placeholder="Qtd" inputMode="numeric" value={l.quantidade} aria-label="Quantidade"
                    onChange={e => setLinha(l.key, { quantidade: e.target.value })} />
                  <Button variant="ghost" size="icon" className="text-destructive" aria-label="Remover item"
                    onClick={() => setLinhas(ls => (ls.length > 1 ? ls.filter(x => x.key !== l.key) : [novaLinha()]))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {aviso && <p className="text-xs text-amber-600 dark:text-amber-400">{aviso}</p>}
              </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Total: <span className="font-semibold text-foreground">{totalUnidades}</span> unidades em {linhas.length} itens
          </p>
          <Button size="lg" onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackagePlus className="h-4 w-4 mr-2" />}
            Dar entrada no estoque
          </Button>
        </div>

        {ultimas.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Últimas entradas</CardTitle></CardHeader>
            <CardContent className="divide-y">
              {ultimas.map(u => (
                <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <span className="font-medium">{u.numero_nf ? `NF ${u.numero_nf}` : 'Sem nº de NF'}</span>
                    {u.fornecedor_nome && <span className="text-muted-foreground"> · {u.fornecedor_nome}</span>}
                    {u.origem === 'xml_nfe' && <Badge variant="secondary" className="ml-2">XML</Badge>}
                  </div>
                  <span className="text-muted-foreground">
                    {u.unidades} un. em {u.itens} itens · {new Date(u.data_entrada).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
