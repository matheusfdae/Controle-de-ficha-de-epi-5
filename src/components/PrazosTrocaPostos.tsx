import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Save, Shirt } from 'lucide-react';
import { toast } from 'sonner';
import { Posto, definirTrocaUniforme } from '@/services/postosService';
import EstadoSelect, { TODOS_ESTADOS } from '@/components/EstadoSelect';
import { ConvocacaoUniforme, MESES_TROCA_PADRAO, chaveTexto, regraTexto } from '@/lib/convocacaoUniforme';

/** Troca de uniforme do contrato: 'sem' = ainda não analisado (usa o padrão). */
type TipoTroca = 'sem' | 'obrigatoria' | 'flexivel';
type Troca = { tipo: TipoTroca; meses: string };

const trocaDoPosto = (p: Posto): Troca => ({
  tipo: !p.troca_uniforme_meses ? 'sem' : p.troca_uniforme_obrigatoria ? 'obrigatoria' : 'flexivel',
  meses: p.troca_uniforme_meses ? String(p.troca_uniforme_meses) : '',
});

/** Troca do formulário -> colunas; erro em texto se os meses forem inválidos. */
function lerTroca(t: Troca): { meses: number | null; obrigatoria: boolean } | string {
  if (t.tipo === 'sem') return { meses: null, obrigatoria: false };
  const meses = Number(t.meses);
  if (!Number.isInteger(meses) || meses < 1 || meses > 60) return 'Informe o prazo da troca em meses (1 a 60)';
  return { meses, obrigatoria: t.tipo === 'obrigatoria' };
}

/** Tipo + meses (sugere 6 para obrigatória e 12 para flexível). */
function CamposTroca({ troca, onChange }: { troca: Troca; onChange: (t: Troca) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
      <div>
        <Label>Troca de uniforme (contrato)</Label>
        <Select value={troca.tipo} onValueChange={v => {
          const tipo = v as TipoTroca;
          onChange({ tipo, meses: tipo === 'sem' ? '' : troca.meses || (tipo === 'obrigatoria' ? '6' : '12') });
        }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="sem">Sem análise (usa {MESES_TROCA_PADRAO} meses)</SelectItem>
            <SelectItem value="obrigatoria">Obrigatória — o contrato exige no prazo</SelectItem>
            <SelectItem value="flexivel">Flexível — troca conforme o uso</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="troca-meses">A cada (meses)</Label>
        <Input id="troca-meses" inputMode="numeric" disabled={troca.tipo === 'sem'} value={troca.meses}
          onChange={e => onChange({ ...troca, meses: e.target.value.replace(/\D/g, '') })} />
      </div>
    </div>
  );
}

/**
 * Vencimentos > Uniformes > "Prazos por posto": prazo de troca de cada posto conforme o
 * contrato (obrigatória ou flexível). Posto sem análise usa MESES_TROCA_PADRAO.
 */
export default function PrazosTrocaPostos({ postos, trocas, estado, onEstado, podeEditar, onAlterado }: {
  postos: Posto[];
  trocas: ConvocacaoUniforme[];
  /** Estado escolhido na tela (o mesmo da convocação); TODOS_ESTADOS = todos. */
  estado: string;
  onEstado: (uf: string) => void;
  podeEditar: boolean;
  onAlterado: () => void;
}) {
  const uf = estado === TODOS_ESTADOS ? null : estado;
  const [busca, setBusca] = useState('');
  const [soSemAnalise, setSoSemAnalise] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [edicao, setEdicao] = useState<{ ids: string[]; titulo: string; troca: Troca } | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Colaboradores (com ficha de uniforme) por posto atual (Senior); e os de posto fora do cadastro.
  const { porPosto, semCadastro } = useMemo(() => {
    const idx = new Map(postos.map(p => [chaveTexto(p.nome), p.id]));
    const conta = new Map<string, number>();
    let fora = 0;
    for (const t of trocas) {
      if (uf && t.uf !== uf) continue;
      const id = t.regra.postoCadastro ? idx.get(chaveTexto(t.regra.postoCadastro)) : undefined;
      if (id) conta.set(id, (conta.get(id) ?? 0) + 1); else fora++;
    }
    return { porPosto: conta, semCadastro: fora };
  }, [postos, trocas, uf]);

  const termo = busca.trim().toLowerCase();
  const visiveis = postos
    .filter(p => (!uf || p.uf === uf) && (!soSemAnalise || !p.troca_uniforme_meses)
      && (!termo || [p.nome, ...p.apelidos].some(n => n.toLowerCase().includes(termo))))
    .sort((a, b) => (porPosto.get(b.id) ?? 0) - (porPosto.get(a.id) ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const semAnalise = postos.filter(p => (!uf || p.uf === uf) && !p.troca_uniforme_meses).length;
  const todosMarcados = visiveis.length > 0 && visiveis.every(p => selecionados.has(p.id));

  const alternar = (id: string) => setSelecionados(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  async function aplicar() {
    if (!edicao) return;
    const troca = lerTroca(edicao.troca);
    if (typeof troca === 'string') return toast.error(troca);
    setSalvando(true);
    try {
      await definirTrocaUniforme(edicao.ids, troca.meses, troca.obrigatoria);
      toast.success(`Prazo de troca salvo para ${edicao.ids.length} posto(s)`);
      setEdicao(null); setSelecionados(new Set());
      onAlterado();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div>
          <CardTitle className="text-base">Prazo de troca por posto (contrato)</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            <b>Obrigatória</b>: o contrato exige a troca no prazo (atraso pode comprometer o faturamento).{' '}
            <b>Flexível</b>: o contrato prevê, mas a troca é feita conforme o uso. Posto sem análise usa {MESES_TROCA_PADRAO} meses.
            {semAnalise > 0 && <> <b>{semAnalise}</b> posto(s) ainda sem análise.</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input placeholder="Buscar posto (ex.: SESI)..." value={busca} onChange={e => setBusca(e.target.value)} className="max-w-xs" />
          <EstadoSelect value={estado} onChange={onEstado} permitirTodos className="w-44" />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={soSemAnalise} onCheckedChange={v => setSoSemAnalise(!!v)} /> Só os sem análise
          </label>
          {podeEditar && selecionados.size > 0 && (
            <Button size="sm" onClick={() => setEdicao({
              ids: [...selecionados], titulo: `${selecionados.size} posto(s) marcados`, troca: { tipo: 'obrigatoria', meses: '6' },
            })}>
              <Shirt className="h-4 w-4 mr-1" /> Definir prazo ({selecionados.size})
            </Button>
          )}
        </div>
        {semCadastro > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {semCadastro} colaborador(es) estão em postos que não existem no cadastro e usam {MESES_TROCA_PADRAO} meses.
            Cadastre-os em <Link to="/postos" className="underline">Postos</Link> ("Importar das fichas") para definir o prazo.
          </p>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {podeEditar && (
                <TableHead className="w-8">
                  <Checkbox checked={todosMarcados} aria-label="Marcar todos os postos da lista"
                    onCheckedChange={v => setSelecionados(s => {
                      const n = new Set(s);
                      for (const p of visiveis) { if (v) n.add(p.id); else n.delete(p.id); }
                      return n;
                    })} />
                </TableHead>
              )}
              <TableHead>Posto</TableHead>
              <TableHead>Prazo de troca</TableHead>
              <TableHead className="text-right">Colaboradores</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.map(p => (
              <TableRow key={p.id} className={podeEditar ? 'cursor-pointer' : ''}
                onClick={() => podeEditar && setEdicao({ ids: [p.id], titulo: p.nome, troca: trocaDoPosto(p) })}>
                {podeEditar && (
                  <TableCell onClick={e => e.stopPropagation()}>
                    <Checkbox checked={selecionados.has(p.id)} onCheckedChange={() => alternar(p.id)} aria-label={`Marcar ${p.nome}`} />
                  </TableCell>
                )}
                <TableCell>
                  <span className="font-medium">{p.nome}</span> <Badge variant="outline" className="ml-1 font-mono">{p.uf}</Badge>
                </TableCell>
                <TableCell className={`text-sm whitespace-nowrap ${!p.troca_uniforme_meses ? 'text-muted-foreground'
                  : p.troca_uniforme_obrigatoria ? 'text-destructive font-semibold' : ''}`}>
                  {regraTexto({
                    meses: p.troca_uniforme_meses ?? MESES_TROCA_PADRAO, obrigatoria: p.troca_uniforme_obrigatoria,
                    definida: !!p.troca_uniforme_meses,
                  })}
                </TableCell>
                <TableCell className="text-right tabular-nums">{porPosto.get(p.id) ?? 0}</TableCell>
              </TableRow>
            ))}
            {visiveis.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                {postos.length === 0 ? 'Nenhum posto cadastrado.' : 'Nenhum posto nesta lista.'}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!edicao} onOpenChange={o => !o && setEdicao(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Prazo de troca — {edicao?.titulo}</DialogTitle>
            <DialogDescription>
              A convocação conta o prazo a partir da assinatura da última ficha de uniforme do colaborador.
            </DialogDescription>
          </DialogHeader>
          {edicao && <CamposTroca troca={edicao.troca} onChange={troca => setEdicao({ ...edicao, troca })} />}
          <DialogFooter>
            <Button onClick={aplicar} disabled={salvando}><Save className="h-4 w-4 mr-1" /> Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
