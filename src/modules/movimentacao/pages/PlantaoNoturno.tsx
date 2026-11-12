import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Moon, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/hooks/use-confirm';
import {
  buscarCandidatoNoturno, listarNoturnos, removerNoturno, saidaDe, salvarNoturno, salvarTolerancia,
  type CandidatoNoturno, type FiscalNoturno,
} from '../lib/movimentacaoService';

/**
 * Plantão noturno (12 h): quem são os fiscais noturnos e a que horas entram.
 * Noturno que lança depois da meia-noite com a data do plantão (ontem) fica OK
 * até o fim do plantão + a tolerância.
 */

const horaValida = (h: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
const fimComTolerancia = (entrada: string, tol: number) => {
  const [h, m] = entrada.split(':').map(Number);
  const t = (h * 60 + m + 12 * 60 + tol) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

export default function PlantaoNoturno() {
  const { can } = useAuth();
  const podeEditar = can('movimentacao', 'edit');
  const { confirm, ConfirmDialog } = useConfirm();

  const [fiscais, setFiscais] = useState<FiscalNoturno[]>([]);
  const [tolerancia, setTolerancia] = useState(60);
  const [tolTexto, setTolTexto] = useState('60');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [entradaNova, setEntradaNova] = useState('19:00');
  const [achados, setAchados] = useState<CandidatoNoturno[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const seq = useRef(0);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await listarNoturnos();
      setFiscais(r.fiscais); setTolerancia(r.tolerancia_min); setTolTexto(String(r.tolerancia_min));
    } catch (e) { toast.error((e as Error).message); } finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // Busca na Senior: nome (3+ letras) ou matrícula.
  useEffect(() => {
    const t = busca.trim();
    const pronto = /^\d{1,9}$/.test(t) || t.replace(/\s/g, '').length >= 3;
    if (!pronto || !podeEditar) { setAchados(null); return; }
    const n = ++seq.current;
    const timer = setTimeout(async () => {
      setBuscando(true);
      try { const r = await buscarCandidatoNoturno(t); if (n === seq.current) setAchados(r); }
      catch (e) { if (n === seq.current) toast.error((e as Error).message); }
      finally { if (n === seq.current) setBuscando(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [busca, podeEditar]);

  const adicionar = async (c: CandidatoNoturno) => {
    if (!horaValida(entradaNova)) return toast.error('Informe a hora de entrada (ex.: 19:00).');
    setSalvando(c.id);
    try {
      await salvarNoturno(c.id, entradaNova);
      toast.success(`${c.nome} agora é fiscal noturno (${entradaNova} às ${saidaDe(entradaNova)}).`);
      setBusca(''); setAchados(null);
      await carregar();
    } catch (e) { toast.error((e as Error).message); } finally { setSalvando(null); }
  };

  const mudarEntrada = async (f: FiscalNoturno, entrada: string) => {
    if (!horaValida(entrada) || entrada === f.entrada) return;
    setSalvando(f.senior_id);
    try {
      await salvarNoturno(f.senior_id, entrada);
      setFiscais(xs => xs.map(x => (x.senior_id === f.senior_id ? { ...x, entrada, saida: saidaDe(entrada) } : x)));
      toast.success(`Plantão de ${f.nome}: ${entrada} às ${saidaDe(entrada)}.`);
    } catch (e) { toast.error((e as Error).message); } finally { setSalvando(null); }
  };

  const remover = async (f: FiscalNoturno) => {
    if (!(await confirm({ title: 'Tirar do plantão noturno', description: `${f.nome} volta a ser diurno: lançar depois da meia-noite com a data de ontem vai ficar DIVERGENTE.`, confirmLabel: 'Tirar' }))) return;
    setSalvando(f.senior_id);
    try { await removerNoturno(f.senior_id); setFiscais(xs => xs.filter(x => x.senior_id !== f.senior_id)); toast.success('Removido do plantão noturno.'); }
    catch (e) { toast.error((e as Error).message); } finally { setSalvando(null); }
  };

  const gravarTolerancia = async () => {
    const n = Number(tolTexto);
    if (!Number.isInteger(n) || n < 0 || n > 360) return toast.error('Tolerância entre 0 e 360 minutos.');
    setSalvando('tol');
    try { await salvarTolerancia(n); setTolerancia(n); toast.success('Tolerância salva.'); }
    catch (e) { toast.error((e as Error).message); } finally { setSalvando(null); }
  };

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Fiscalização" title="Plantão noturno"
        description="Fiscais de plantão de 12 horas que viram a meia-noite. Para eles, lançar depois da meia-noite com a data do plantão não fica divergente." />

      <Card>
        <CardContent className="p-4 text-sm flex gap-3">
          <Moon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p><strong>Como fica o status:</strong> o fiscal noturno que entra às 19:00 do dia 11 trabalha até 07:00 do dia 12.
              Se ele lançar à 01:00 do dia 12 com a data <strong>11</strong>, fica <strong>OK</strong> — é o mesmo plantão.</p>
            <p className="text-muted-foreground">
              Vale até o fim do plantão mais a tolerância ({tolerancia} min: até {fimComTolerancia('19:00', tolerancia)} no exemplo). Depois disso, ou com qualquer outra data, fica DIVERGENTE como antes.
              Fiscal que não está nesta lista é diurno: só a data do próprio dia fica OK.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Adicionar fiscal noturno</CardTitle>
            <CardDescription>Busque na Senior pelo nome ou pela matrícula.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!podeEditar && <p className="text-sm text-muted-foreground">Você só pode ver a lista. Para mudar, precisa da permissão de editar em Movimentação Diária.</p>}
            {podeEditar && (
              <>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-56">
                    <Label htmlFor="busca-noturno">Fiscal</Label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input id="busca-noturno" className="pl-8 pr-8" autoComplete="off" placeholder="Nome (3+ letras) ou matrícula"
                        value={busca} onChange={e => setBusca(e.target.value.slice(0, 80))} />
                      {buscando && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="entrada-noturno">Entrada</Label>
                    <Input id="entrada-noturno" type="time" className="w-32" value={entradaNova} onChange={e => setEntradaNova(e.target.value)} />
                  </div>
                  <p className="text-xs text-muted-foreground pb-2.5">Saída: {horaValida(entradaNova) ? saidaDe(entradaNova) : '—'} (12 h)</p>
                </div>
                {achados && (
                  <div className="rounded-md border divide-y max-h-72 overflow-y-auto">
                    {achados.length === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">Nenhum colaborador ativo na Senior com essa busca.</p>}
                    {achados.map(c => (
                      <div key={c.id} className="flex items-center gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium break-words">{c.nome}</p>
                          <p className="text-xs text-muted-foreground">Matrícula {c.matricula}{c.cargo ? ` · ${c.cargo}` : ''}{c.uf ? ` · ${c.uf}` : ''}</p>
                        </div>
                        {c.noturno
                          ? <span className="text-xs text-muted-foreground shrink-0">já é noturno</span>
                          : (
                            <Button size="sm" variant="outline" className="gap-1 shrink-0" disabled={salvando === c.id} onClick={() => adicionar(c)}>
                              {salvando === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar
                            </Button>
                          )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tolerância</CardTitle>
            <CardDescription>Minutos depois do fim do plantão em que a data do plantão ainda fica OK.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end gap-2">
            <div>
              <Label htmlFor="tol">Minutos</Label>
              <Input id="tol" type="number" min={0} max={360} step={15} className="w-28" value={tolTexto} disabled={!podeEditar}
                onChange={e => setTolTexto(e.target.value)} />
            </div>
            {podeEditar && (
              <Button onClick={gravarTolerancia} disabled={salvando === 'tol' || tolTexto === String(tolerancia)}>
                {salvando === 'tol' && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Salvar
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">Fiscais noturnos {carregando && <Loader2 className="h-4 w-4 animate-spin" />}</CardTitle>
          <CardDescription>{fiscais.length} fiscal(is). Para mudar o horário, troque a entrada: a saída é 12 h depois.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="pl-6">Fiscal</TableHead><TableHead>UF</TableHead><TableHead>Entrada</TableHead>
              <TableHead>Saída</TableHead><TableHead>Data do plantão vale até</TableHead><TableHead className="w-12 pr-6"><span className="sr-only">Ações</span></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {!carregando && fiscais.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum fiscal noturno ainda. Todos são tratados como diurnos.</TableCell></TableRow>
              )}
              {fiscais.map(f => (
                <TableRow key={f.senior_id}>
                  <TableCell className="pl-6">
                    <span className="font-medium">{f.nome}</span>
                    {!f.ativo && <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive">desligado na Senior</span>}
                    <span className="block text-[11px] text-muted-foreground">Mat. {f.matricula}{f.cargo ? ` · ${f.cargo}` : ''}{f.local ? ` · ${f.local}` : ''}</span>
                  </TableCell>
                  <TableCell>{f.uf ?? '—'}</TableCell>
                  <TableCell>
                    {podeEditar
                      ? <Input type="time" className="w-28 h-8" defaultValue={f.entrada} aria-label={`Entrada de ${f.nome}`}
                          onBlur={e => mudarEntrada(f, e.target.value)} disabled={salvando === f.senior_id} />
                      : f.entrada}
                  </TableCell>
                  <TableCell className="tabular-nums">{f.saida}</TableCell>
                  <TableCell className="tabular-nums text-sm text-muted-foreground">{fimComTolerancia(f.entrada, tolerancia)} do dia seguinte</TableCell>
                  <TableCell className="pr-6">
                    {podeEditar && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={salvando === f.senior_id} aria-label={`Tirar ${f.nome} do plantão noturno`}
                        onClick={() => remover(f)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <ConfirmDialog />
    </div>
  );
}
