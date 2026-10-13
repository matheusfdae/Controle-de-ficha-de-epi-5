import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import {
  AlertTriangle, Check, ChevronsUpDown, ClipboardList, FileText, FileUp, Loader2, PackagePlus, Plus, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import { EPI, listEpis } from '@/services/estoqueService';
import {
  EntradaCabecalho, EntradaResumo, NotaLancada, registrarEntrada, buscarNotaLancada,
  normalizarNumeroNf, listCodigosFornecedor, mapaTamanhos, listUltimasEntradas,
  MOTIVOS_ENTRADA_MANUAL, ROTULO_ORIGEM,
} from '@/services/entradaEstoqueService';
import { parseNFeXml, sugerirEpi, casarTamanho, OrigemSugestao, NFe } from '@/lib/nfe';
import { parseDanfe, lerTextoPdf } from '@/lib/danfe';
import { formatarCnpj, soDigitos } from '@/lib/cnpj';
import { Fornecedor, listFornecedores } from '@/services/fornecedoresService';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import EstadoSelect, { useEstadoLembrado } from '@/components/EstadoSelect';

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
  numero_nf: '', serie: '', chave_acesso: null, fornecedor_id: null, fornecedor_nome: '', fornecedor_cnpj: '',
  data_emissao: '', origem: 'nf_digitada', observacao: '', uf: '',
});

type Modo = 'nota' | 'manual';
const OUTRO_MOTIVO = '__outro__';

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
  const [lendo, setLendo] = useState(false);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [duplicada, setDuplicada] = useState<NotaLancada | null>(null);
  const [uf, setUf] = useEstadoLembrado('entrada-estoque');
  const topoRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const modo: Modo = searchParams.get('modo') === 'manual' ? 'manual' : 'nota';
  const setModo = (m: Modo) => setSearchParams(m === 'manual' ? { modo: 'manual' } : {}, { replace: true });
  const [motivoSel, setMotivoSel] = useState('');
  const [motivoOutro, setMotivoOutro] = useState('');
  const motivo = motivoSel === OUTRO_MOTIVO ? motivoOutro.trim() : motivoSel;
  const [filtroHistorico, setFiltroHistorico] = useState<'todas' | 'manual' | 'nota'>('todas');

  // Rechecado a cada mudança da chave, CNPJ, número ou série (importada ou digitada).
  useEffect(() => {
    let cancelado = false;
    const t = setTimeout(() => {
      buscarNotaLancada(cab)
        .then(nota => { if (!cancelado) setDuplicada(nota); })
        .catch(() => { if (!cancelado) setDuplicada(null); });
    }, 400);
    return () => { cancelado = true; clearTimeout(t); };
  }, [cab.chave_acesso, cab.fornecedor_cnpj, cab.numero_nf, cab.serie]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (duplicada) topoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [duplicada]);

  const carregar = () => {
    listEpis().then(setEpis).catch(e => toast.error(e.message));
    mapaTamanhos().then(setTamanhos).catch(() => {});
    listFornecedores().then(setFornecedores).catch(() => {});
  };
  useEffect(carregar, []);
  const carregarHistorico = () => { listUltimasEntradas(30, filtroHistorico).then(setUltimas).catch(() => {}); };
  useEffect(carregarHistorico, [filtroHistorico]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCampo = (campo: keyof EntradaCabecalho, valor: string) => setCab(c => ({ ...c, [campo]: valor }));
  const setLinha = (key: string, patch: Partial<Linha>) =>
    setLinhas(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));

  const escolherFornecedor = (id: string) => {
    const f = fornecedores.find(x => x.id === id);
    setCab(c => ({ ...c, fornecedor_id: id, fornecedor_nome: f?.nome ?? c.fornecedor_nome, fornecedor_cnpj: f?.cnpj ?? c.fornecedor_cnpj }));
  };

  async function importarNota(file: File) {
    setModo('nota');
    setLendo(true);
    try {
      const ehPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      let nfe: NFe;
      if (ehPdf) {
        const danfe = parseDanfe(await lerTextoPdf(file));
        // Sem chave legível, o emitente é o CNPJ do documento que está cadastrado.
        const cnpj = danfe.fornecedor.cnpj
          ?? danfe.cnpjsNoDocumento.find(c => fornecedores.some(f => f.cnpj === c)) ?? null;
        nfe = { ...danfe, fornecedor: { nome: null, cnpj } };
      } else {
        nfe = parseNFeXml(await file.text());
      }
      const fornecedor = fornecedores.find(f => f.cnpj && f.cnpj === soDigitos(nfe.fornecedor.cnpj));
      // Nota duplicada é carregada mesmo assim (para conferir), com o aviso
      // vermelho no topo e o botão de salvar bloqueado.
      const memoria = nfe.fornecedor.cnpj ? await listCodigosFornecedor(nfe.fornecedor.cnpj) : [];
      setCab({
        numero_nf: nfe.numero ?? '', serie: nfe.serie ?? '', chave_acesso: nfe.chave,
        fornecedor_id: fornecedor?.id ?? null,
        fornecedor_nome: fornecedor?.nome ?? nfe.fornecedor.nome ?? '',
        fornecedor_cnpj: nfe.fornecedor.cnpj ?? '',
        data_emissao: nfe.dataEmissao ?? '', origem: ehPdf ? 'pdf_danfe' : 'xml_nfe', observacao: '', uf: '',
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
      if (!fornecedor) {
        toast.warning(`Fornecedor ${formatarCnpj(nfe.fornecedor.cnpj)} não está cadastrado. ` +
          'Cadastre na aba Fornecedores do Estoque para as próximas notas serem reconhecidas.');
      }
      if (ehPdf) toast.info('Nota lida do PDF: confira quantidades e descrições antes de salvar.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível ler o arquivo');
    } finally {
      setLendo(false);
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
    if (modo === 'nota' && duplicada) {
      toast.error('Esta nota já foi lançada no estoque.');
      return;
    }
    if (!uf) {
      toast.error(modo === 'manual' ? 'Escolha o estado que está recebendo os itens.' : 'Escolha o estado que está recebendo a nota.');
      return;
    }
    if (modo === 'manual' && !motivo) {
      toast.error('Informe o motivo da entrada manual.');
      return;
    }
    if (modo === 'nota' && !cab.numero_nf.trim() && !cab.chave_acesso) {
      toast.error('Informe o número da nota fiscal. Sem nota, use a entrada Manual.');
      return;
    }
    if (problemas.some(Boolean)) {
      toast.error('Corrija os itens destacados antes de salvar.');
      return;
    }
    setSalvando(true);
    try {
      const cabecalho: EntradaCabecalho = modo === 'manual'
        ? { ...cabecalhoVazio(), origem: 'manual', motivo, observacao: cab.observacao, uf }
        : { ...cab, uf, numero_nf: normalizarNumeroNf(cab.numero_nf), serie: normalizarNumeroNf(cab.serie) };
      await registrarEntrada(cabecalho, linhas.map(l => ({
        epi_id: l.epiId,
        tamanho: l.tamanho.trim() || null,
        quantidade: Number(l.quantidade.replace(',', '.')),
        descricao_nf: l.descricaoNf,
        codigo_fornecedor: l.codigoFornecedor,
        valor_unitario: l.valorUnitario,
      })));
      toast.success(`Entrada ${modo === 'manual' ? 'manual ' : ''}registrada: ${totalUnidades} unidades em ${linhas.length} itens.`);
      setCab(cabecalhoVazio());
      setLinhas([novaLinha()]);
      setMotivoSel('');
      setMotivoOutro('');
      carregar();
      carregarHistorico();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao registrar a entrada');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div ref={topoRef} className="max-w-5xl mx-auto space-y-6 scroll-mt-4">
        {modo === 'nota' && duplicada && (
          <div role="alert"
            className="flex items-start gap-3 rounded-lg border-2 border-destructive bg-destructive/10 p-4 text-destructive">
            <AlertTriangle className="h-6 w-6 shrink-0 mt-0.5" />
            <div>
              <p className="text-lg font-bold">NOTA DUPLICADA</p>
              <p className="text-sm font-medium">
                {duplicada.numero_nf ? `A NF ${duplicada.numero_nf}` : 'Esta nota'}
                {duplicada.fornecedor_nome ? ` de ${duplicada.fornecedor_nome}` : ''} já foi lançada no estoque
                em {new Date(duplicada.data_entrada).toLocaleDateString('pt-BR')}. Ela não pode ser lançada de novo.
              </p>
            </div>
          </div>
        )}
        <BackButton />
        <PageHeader eyebrow="Estoque" title="Registrar entrada"
          description={modo === 'manual'
            ? 'Entrada sem nota fiscal, item a item (saldo inicial, inventário, devolução...). As quantidades são SOMADAS ao estoque e a entrada fica marcada como MANUAL.'
            : 'Lance a nota inteira de uma vez: importe o PDF/XML da NF-e ou digite os itens do DANFE. As quantidades são SOMADAS ao estoque.'}
          actions={<Button variant="outline" onClick={() => navigate('/estoque')}>Ver estoque</Button>} />

        <div className="grid gap-3 sm:grid-cols-2">
          {([
            ['nota', FileText, 'Por nota fiscal', 'PDF, XML ou nota digitada'],
            ['manual', ClipboardList, 'Manual (item a item)', 'Sem nota: saldo inicial, inventário, devolução'],
          ] as const).map(([id, Icone, titulo, detalhe]) => (
            <button key={id} type="button" onClick={() => setModo(id)}
              className={cn('flex items-center gap-3 rounded-lg border-2 p-4 text-left transition',
                modo === id ? 'border-primary bg-primary/5' : 'border-transparent bg-background/60 hover:border-muted-foreground/30')}>
              <Icone className={cn('h-6 w-6 shrink-0', modo === id ? 'text-primary' : 'text-muted-foreground')} />
              <span>
                <span className="block font-medium">{titulo}</span>
                <span className="block text-xs text-muted-foreground">{detalhe}</span>
              </span>
            </button>
          ))}
        </div>

        {modo === 'manual' && (
          <Card className="border-amber-300">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Entrada manual <Badge className="bg-amber-500 hover:bg-amber-500">MANUAL</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-6">
              <div className="sm:col-span-2"><Label htmlFor="uf-manual">Estado que recebe *</Label>
                <EstadoSelect id="uf-manual" value={uf} onChange={setUf} placeholder="Escolha o estado" /></div>
              <div className="sm:col-span-2"><Label htmlFor="motivo">Motivo *</Label>
                <Select value={motivoSel} onValueChange={setMotivoSel}>
                  <SelectTrigger id="motivo"><SelectValue placeholder="Por que está entrando?" /></SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_ENTRADA_MANUAL.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    <SelectItem value={OUTRO_MOTIVO}>Outro…</SelectItem>
                  </SelectContent>
                </Select></div>
              {motivoSel === OUTRO_MOTIVO ? (
                <div className="sm:col-span-2"><Label htmlFor="motivo-outro">Qual motivo? *</Label>
                  <Input id="motivo-outro" value={motivoOutro} onChange={e => setMotivoOutro(e.target.value)} /></div>
              ) : <div className="hidden sm:block sm:col-span-2" />}
              <div className="sm:col-span-6"><Label htmlFor="obs-manual">Observação</Label>
                <Input id="obs-manual" value={cab.observacao} placeholder="Ex.: devolvido por Fulano, contagem do almoxarifado de 13/10…"
                  onChange={e => setCampo('observacao', e.target.value)} /></div>
            </CardContent>
          </Card>
        )}

        {modo === 'nota' && (<>
        <Card className="border-dashed">
          <CardContent className="p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">Importar nota (PDF do DANFE ou XML da NF-e)</p>
              <p className="text-sm text-muted-foreground">Preenche a nota e os itens automaticamente. Itens já lançados antes deste fornecedor vêm reconhecidos. PDF escaneado não é lido.</p>
            </div>
            <input ref={fileRef} type="file" accept=".pdf,application/pdf,.xml,text/xml,application/xml" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) importarNota(f); }} />
            <Button onClick={() => fileRef.current?.click()} disabled={!epis.length || lendo}>
              {lendo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileUp className="h-4 w-4 mr-2" />}
              Escolher PDF ou XML
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Dados da nota</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-6">
            <div className="sm:col-span-2"><Label htmlFor="uf">Estado que recebe *</Label>
              <EstadoSelect id="uf" value={uf} onChange={setUf} placeholder="Escolha o estado" /></div>
            <div className="hidden sm:block sm:col-span-4" />
            <div className="sm:col-span-2"><Label htmlFor="nf">Nº da NF</Label>
              <Input id="nf" value={cab.numero_nf} onChange={e => setCampo('numero_nf', e.target.value)} /></div>
            <div><Label htmlFor="serie">Série</Label>
              <Input id="serie" value={cab.serie} onChange={e => setCampo('serie', e.target.value)} /></div>
            <div className="sm:col-span-3"><Label htmlFor="emissao">Data de emissão</Label>
              <Input id="emissao" type="date" value={cab.data_emissao} onChange={e => setCampo('data_emissao', e.target.value)} /></div>
            <div className="sm:col-span-4"><Label htmlFor="forn">Fornecedor</Label>
              <Select value={cab.fornecedor_id ?? ''} onValueChange={escolherFornecedor}>
                <SelectTrigger id="forn">
                  <SelectValue placeholder={cab.fornecedor_nome || 'Escolha o fornecedor cadastrado'} />
                </SelectTrigger>
                <SelectContent>
                  {fornecedores.filter(f => f.ativo || f.id === cab.fornecedor_id).map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!cab.fornecedor_id && cab.fornecedor_cnpj && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">CNPJ da nota não cadastrado em Fornecedores.</p>
              )}
            </div>
            <div className="sm:col-span-2"><Label htmlFor="cnpj">CNPJ</Label>
              <Input id="cnpj" value={formatarCnpj(cab.fornecedor_cnpj)} onChange={e => setCampo('fornecedor_cnpj', e.target.value)} /></div>
            <div className="sm:col-span-6"><Label htmlFor="obs">Observação</Label>
              <Input id="obs" value={cab.observacao} onChange={e => setCampo('observacao', e.target.value)} /></div>
            {cab.chave_acesso && (
              <p className="sm:col-span-6 text-xs text-muted-foreground font-mono break-all">Chave NF-e: {cab.chave_acesso}</p>
            )}
          </CardContent>
        </Card>
        </>)}

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
            {uf && <> · entram no estoque de <span className="font-semibold text-foreground">{uf}</span></>}
          </p>
          <Button size="lg" onClick={salvar} disabled={salvando || (modo === 'nota' && !!duplicada)}>
            {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackagePlus className="h-4 w-4 mr-2" />}
            Dar entrada no estoque
          </Button>
        </div>

        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">Últimas entradas</CardTitle>
            <div className="inline-flex rounded-md border bg-background p-0.5">
              {([['todas', 'Todas'], ['nota', 'Por nota'], ['manual', 'Manuais']] as const).map(([id, rotulo]) => (
                <button key={id} type="button" onClick={() => setFiltroHistorico(id)}
                  className={cn('px-3 py-1 text-xs rounded', filtroHistorico === id
                    ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                  {rotulo}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="divide-y">
            {ultimas.length === 0 && <p className="py-4 text-sm text-muted-foreground">Nenhuma entrada.</p>}
            {ultimas.map(u => (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge variant="outline" className="font-mono">{u.uf}</Badge>
                  {u.origem === 'manual' ? (
                    <>
                      <Badge className="bg-amber-500 hover:bg-amber-500">MANUAL</Badge>
                      <span className="font-medium">{u.motivo || 'Sem motivo'}</span>
                      {u.observacao && <span className="text-muted-foreground">· {u.observacao}</span>}
                    </>
                  ) : (
                    <>
                      <Badge className="bg-sky-600 hover:bg-sky-600">NOTA FISCAL</Badge>
                      <span className="font-medium">{u.numero_nf ? `NF ${u.numero_nf}` : 'Sem nº de NF'}</span>
                      {u.fornecedor_nome && <span className="text-muted-foreground">· {u.fornecedor_nome}</span>}
                      <Badge variant="secondary">{ROTULO_ORIGEM[u.origem] ?? u.origem}</Badge>
                    </>
                  )}
                </div>
                <span className="text-muted-foreground">
                  {u.unidades} un. em {u.itens} itens · {new Date(u.data_entrada).toLocaleDateString('pt-BR')}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
