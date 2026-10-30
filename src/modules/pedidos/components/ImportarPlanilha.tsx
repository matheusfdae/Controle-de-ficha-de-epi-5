import { useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import EstadoSelect from '@/components/EstadoSelect';
import { useAuth } from '@/contexts/AuthContext';
import { listPostos } from '@/services/postosService';
import { hojeBr, importarPlanilha, listMateriais } from '../lib/pedidosService';
import { acharPosto, chaveNome, lerAba, type AbaPosto, type Celula, type PostoCadastrado } from '../lib/planilhaPostos';

/**
 * Importa a planilha de material por posto (uma aba por posto): catálogo,
 * lista de cada posto (o encarregado passa a ver só ela) e teto mensal.
 * Lê o arquivo no navegador, mostra como cada aba vai entrar e só grava ao
 * confirmar (função pedidos_importar_planilha, tudo de uma vez).
 */

const NOVO = '__novo__';
interface Linha { aba: AbaPosto; incluir: boolean; destino: string; uf: string; teto: string }

const valorCelula = (v: unknown): Celula => {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: string };
    if ('result' in o) return valorCelula(o.result);
    if (o.richText) return o.richText.map(t => t.text).join('');
    if (typeof o.text === 'string') return o.text;
    return null;
  }
  return v as Celula;
};

export default function ImportarPlanilha({ podeEditar }: { podeEditar: boolean }) {
  const { estados } = useAuth();
  const arquivo = useRef<HTMLInputElement>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [postos, setPostos] = useState<PostoCadastrado[]>([]);
  // Chave do nome -> nome já cadastrado no catálogo (a planilha às vezes escreve o mesmo item de dois jeitos).
  const [catalogo, setCatalogo] = useState<Map<string, string>>(new Map());
  const [desde, setDesde] = useState(hojeBr().slice(0, 7));
  const [lendo, setLendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [abertos, setAbertos] = useState<string | null>(null);

  const ler = async (f: File) => {
    setLendo(true);
    try {
      const [ExcelJS, po, m] = await Promise.all([import('exceljs').then(x => x.default), listPostos(), listMateriais()]);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await f.arrayBuffer());
      const abas: AbaPosto[] = [];
      wb.eachSheet(ws => {
        const grade: Celula[][] = [];
        ws.eachRow({ includeEmpty: true }, (row, r) => {
          grade[r - 1] = [];
          row.eachCell({ includeEmpty: true }, (c, col) => { grade[r - 1][col - 1] = valorCelula(c.value); });
        });
        const a = lerAba(ws.name, grade);
        if (a && a.itens.length) abas.push(a);
      });
      if (!abas.length) { toast.error('Nenhuma aba de posto encontrada (ITEM, POSTO: e os meses).'); return; }
      const cad = po.filter(p => p.ativo).map(p => ({ id: p.id, nome: p.nome, uf: p.uf }));
      setPostos(cad);
      setCatalogo(new Map(m.filter(x => !x.item_pai_id).map(x => [chaveNome(x.nome), x.nome])));
      setLinhas(abas.map(a => {
        const achado = acharPosto(a, cad);
        return { aba: a, incluir: true, destino: achado?.id ?? NOVO, uf: achado?.uf ?? a.uf,
          teto: a.teto == null ? '' : String(a.teto).replace('.', ',') };
      }));
      setNomeArquivo(f.name);
    } catch (e) { toast.error('Não foi possível ler a planilha: ' + (e as Error).message); }
    finally { setLendo(false); }
  };

  const mudar = (i: number, d: Partial<Linha>) => setLinhas(ls => ls.map((l, j) => (j === i ? { ...l, ...d } : l)));
  const marcadas = linhas.filter(l => l.incluir);
  const resumo = useMemo(() => {
    const novos = new Set<string>();
    for (const l of marcadas) for (const i of l.aba.itens) { const k = chaveNome(i.nome); if (!catalogo.has(k)) novos.add(k); }
    return {
      postos: marcadas.length, criar: marcadas.filter(l => l.destino === NOVO).length,
      itens: marcadas.reduce((s, l) => s + l.aba.itens.length, 0), novos: novos.size,
      tetos: marcadas.filter(l => l.teto.trim()).length, semTeto: marcadas.filter(l => !l.teto.trim()).length,
    };
  }, [marcadas, catalogo]);
  const destinosRepetidos = useMemo(() => {
    const c = new Map<string, number>();
    marcadas.filter(l => l.destino !== NOVO).forEach(l => c.set(l.destino, (c.get(l.destino) ?? 0) + 1));
    return new Set([...c].filter(([, n]) => n > 1).map(([id]) => id));
  }, [marcadas]);
  const semAcesso = marcadas.filter(l => l.destino === NOVO && !estados.includes(l.uf));

  const importar = async () => {
    if (!marcadas.length) return toast.error('Marque pelo menos uma aba.');
    if (destinosRepetidos.size) return toast.error('Duas abas estão ligadas ao mesmo posto. Ajuste antes de importar.');
    if (semAcesso.length) return toast.error(`Você não tem acesso ao estado de: ${semAcesso.map(l => l.aba.posto).join(', ')}. Marque o estado em Usuários.`);
    const ruim = marcadas.find(l => l.teto.trim() && !(Number(l.teto.replace(/\./g, '').replace(',', '.')) >= 0));
    if (ruim) return toast.error(`Teto inválido em ${ruim.aba.posto}.`);
    if (!confirm(`Importar ${resumo.postos} posto(s)? A lista de itens de cada um será substituída pela da planilha.`)) return;
    // Mesmo item com grafias diferentes vira um nome só: o do catálogo ou o primeiro que aparece.
    const nomes = new Map(catalogo);
    for (const l of marcadas) for (const i of l.aba.itens) if (!nomes.has(chaveNome(i.nome))) nomes.set(chaveNome(i.nome), i.nome);
    setImportando(true);
    try {
      const r = await importarPlanilha(marcadas.map(l => ({
        posto_id: l.destino === NOVO ? null : l.destino,
        criar: l.destino === NOVO ? { nome: l.aba.posto, uf: l.uf } : null,
        teto: l.teto.trim() ? Number(l.teto.replace(/\./g, '').replace(',', '.')).toFixed(2) : null,
        itens: l.aba.itens.map(i => ({ nome: nomes.get(chaveNome(i.nome)) ?? i.nome, unidade: i.unidade })),
      })), `${desde}-01`);
      toast.success(`Importado: ${r.listas} lista(s), ${r.itens_nas_listas} itens nas listas, ${r.itens_criados} item(ns) novo(s) no catálogo, `
        + `${r.postos_criados} posto(s) criado(s), ${r.tetos} teto(s).`);
      setLinhas([]); setNomeArquivo('');
    } catch (e) { toast.error((e as Error).message); }
    finally { setImportando(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-primary" /> Importar planilha de material por posto</CardTitle>
        <CardDescription>
          Planilha com uma aba por posto (POSTO:, CUSTO EM CONTRATO e a lista ORD/ITEM). Cada aba vira a lista do posto, que é o que o
          encarregado vê no link; itens que não existem entram no catálogo; o custo em contrato vira o teto mensal. Nada é gravado antes de você confirmar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input ref={arquivo} type="file" accept=".xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) ler(f); }} />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="gap-2" disabled={!podeEditar || lendo} onClick={() => arquivo.current?.click()}>
            {lendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Escolher planilha (.xlsx)
          </Button>
          {nomeArquivo && <span className="text-sm text-muted-foreground">{nomeArquivo} · {linhas.length} aba(s) de posto</span>}
          {!podeEditar && <span className="text-xs text-muted-foreground">Só Compras ou quem edita Pedidos de Material importa.</span>}
        </div>

        {linhas.length > 0 && <>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label htmlFor="teto-desde">Tetos valem a partir de</Label>
              <Input id="teto-desde" type="month" className="w-44" value={desde} onChange={e => e.target.value && setDesde(e.target.value)} />
            </div>
            <p className="text-sm text-muted-foreground">
              <strong>{resumo.postos}</strong> posto(s), <strong>{resumo.criar}</strong> a criar · <strong>{resumo.itens}</strong> itens nas listas,
              <strong> {resumo.novos}</strong> novo(s) no catálogo · <strong>{resumo.tetos}</strong> teto(s){resumo.semTeto > 0 && <>, {resumo.semTeto} sem teto (preencher depois em Teto por posto)</>}.
            </p>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox checked={linhas.every(l => l.incluir)} aria-label="Marcar todas" onCheckedChange={v => setLinhas(ls => ls.map(l => ({ ...l, incluir: v === true })))} />
                  </TableHead>
                  <TableHead>Aba / posto na planilha</TableHead>
                  <TableHead className="min-w-56">Entra no posto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-32">Teto mensal (R$)</TableHead>
                  <TableHead className="text-right">Itens</TableHead>
                  <TableHead>Avisos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l, i) => {
                  const repetido = l.incluir && destinosRepetidos.has(l.destino);
                  const ufBloqueada = l.incluir && l.destino === NOVO && !estados.includes(l.uf);
                  return (
                    <TableRow key={l.aba.aba} className={l.incluir ? '' : 'opacity-50'}>
                      <TableCell><Checkbox checked={l.incluir} aria-label={`Importar ${l.aba.aba}`} onCheckedChange={v => mudar(i, { incluir: v === true })} /></TableCell>
                      <TableCell className="text-sm">
                        <span className="font-medium">{l.aba.posto}</span>
                        {l.aba.aba !== l.aba.posto && <span className="block text-xs text-muted-foreground">aba {l.aba.aba}</span>}
                      </TableCell>
                      <TableCell>
                        <Select value={l.destino} onValueChange={v => mudar(i, { destino: v, uf: v === NOVO ? l.aba.uf : postos.find(p => p.id === v)?.uf ?? l.uf })}>
                          <SelectTrigger className={`h-9 ${repetido ? 'border-destructive' : ''}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NOVO}>+ Criar posto "{l.aba.posto}"</SelectItem>
                            {postos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome} ({p.uf})</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {repetido && <span className="text-xs text-destructive">Outra aba já entra neste posto.</span>}
                      </TableCell>
                      <TableCell>
                        {l.destino === NOVO
                          ? <EstadoSelect value={l.uf} onChange={uf => mudar(i, { uf })} className={`h-9 w-24 ${ufBloqueada ? 'border-destructive' : ''}`}
                              opcoes={[...new Set([...estados, l.uf])]} />
                          : <span className="text-sm">{l.uf}</span>}
                        {ufBloqueada && <span className="block text-xs text-destructive">Sem acesso a {l.uf}</span>}
                      </TableCell>
                      <TableCell>
                        <Input inputMode="decimal" className="h-9 text-right" placeholder="preencher depois" value={l.teto}
                          aria-label={`Teto de ${l.aba.posto}`} onChange={e => mudar(i, { teto: e.target.value })} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <button type="button" className="text-primary hover:underline" onClick={() => setAbertos(a => (a === l.aba.aba ? null : l.aba.aba))}>{l.aba.itens.length}</button>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs">
                        {l.aba.avisos.length > 0 && <span className="flex items-start gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />{l.aba.avisos.slice(0, 2).join(' ')}{l.aba.avisos.length > 2 && ` (+${l.aba.avisos.length - 2})`}</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {abertos && (() => {
            const l = linhas.find(x => x.aba.aba === abertos)!;
            return (
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium mb-1">Itens de {l.aba.posto}</p>
                <ul className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
                  {l.aba.itens.map(i => (
                    <li key={i.nome} className="truncate">
                      {i.nome} {i.unidade && <span className="text-xs text-muted-foreground">({i.unidade})</span>}
                      {!catalogo.has(chaveNome(i.nome)) && <span className="text-xs text-primary"> · novo</span>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}

          <Button className="gap-2" disabled={!podeEditar || importando} onClick={importar}>
            {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Importar {resumo.postos} posto(s)
          </Button>
        </>}
      </CardContent>
    </Card>
  );
}
