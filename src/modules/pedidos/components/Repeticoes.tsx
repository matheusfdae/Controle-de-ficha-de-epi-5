import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Repeat, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  FREQUENCIAS, dataBr, encerrarRecorrencia, formatarNumero, hojeBr, nomeMaterial, proximaData, repetirPedido, rotuloFrequencia,
  type Frequencia, type Material, type Recorrencia,
} from '../lib/pedidosService';

type Freq = Exclude<Frequencia, 'unica'>;
const OPCOES = FREQUENCIAS.filter(f => f.valor !== 'unica') as { valor: Freq; rotulo: string }[];

const itensTexto = (r: Recorrencia, materiais: Material[]) => r.itens
  .map(i => { const m = materiais.find(x => x.id === i.material_id); return `${formatarNumero(i.quantidade)} ${m?.unidade ?? ''} ${nomeMaterial(m, materiais)}`; })
  .join(', ');

/** Aba "Repetições": pedidos que se repetem, de quem pediu ou do supervisor. */
export function ListaRepeticoes({ recorrencias, materiais, nomePosto, nomeUsuario, podeEncerrar, onMudou }: {
  recorrencias: Recorrencia[]; materiais: Material[]; nomePosto: (id: string) => string; nomeUsuario: (id: string) => string;
  podeEncerrar: (r: Recorrencia) => boolean; onMudou: () => Promise<void>;
}) {
  const [encerrando, setEncerrando] = useState<string | null>(null);
  const encerrar = async (r: Recorrencia) => {
    if (!confirm(`Encerrar a repetição de ${nomePosto(r.posto_id)} (${rotuloFrequencia(r.frequencia).toLowerCase()})? Os pedidos já feitos continuam.`)) return;
    setEncerrando(r.id);
    try { await encerrarRecorrencia(r.id); toast.success('Repetição encerrada.'); await onMudou(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setEncerrando(null); }
  };
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Posto</TableHead>
              <TableHead>Frequência</TableHead>
              <TableHead>Próximo pedido</TableHead>
              <TableHead>Itens</TableHead>
              <TableHead>Programado por</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {recorrencias.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                Nenhum pedido se repetindo. O encarregado programa pelo link, e o supervisor pelo botão "Repetir este pedido" dentro do pedido.
              </TableCell></TableRow>
            )}
            {recorrencias.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{nomePosto(r.posto_id)}</TableCell>
                <TableCell className="whitespace-nowrap"><Repeat className="inline h-3.5 w-3.5 mr-1 text-muted-foreground" />{rotuloFrequencia(r.frequencia)}</TableCell>
                <TableCell className="whitespace-nowrap">{dataBr(r.proxima_data)}</TableCell>
                <TableCell className="text-sm max-w-md">{itensTexto(r, materiais)}</TableCell>
                <TableCell className="text-sm">
                  {r.criado_por ? <>{nomeUsuario(r.criado_por)} <span className="block text-xs text-muted-foreground">no sistema</span></>
                    : <>{r.solicitante_nome} <span className="block text-xs text-muted-foreground">encarregado, pelo link</span></>}
                </TableCell>
                <TableCell className="text-right">
                  {podeEncerrar(r) && (
                    <Button variant="ghost" size="sm" className="gap-1" disabled={encerrando === r.id} onClick={() => encerrar(r)}>
                      {encerrando === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Encerrar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** Dentro do pedido: mostra a repetição ativa ou deixa o supervisor programar uma. */
export function RepetirPedido({ pedidoId, repeticao, podeRepetir, podeEncerrar, onMudou }: {
  pedidoId: string; repeticao: Recorrencia | undefined; podeRepetir: boolean; podeEncerrar: boolean; onMudou: () => Promise<void>;
}) {
  const [freq, setFreq] = useState<Freq>('semanal');
  const [primeira, setPrimeira] = useState(proximaData(hojeBr(), 'semanal'));
  const [salvando, setSalvando] = useState(false);

  if (repeticao) {
    return (
      <div className="rounded-lg border bg-muted/40 p-3 text-sm flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <Repeat className="h-4 w-4 text-primary" />
          Este pedido se repete <strong>{rotuloFrequencia(repeticao.frequencia).toLowerCase()}</strong> · próximo em {dataBr(repeticao.proxima_data)}
        </span>
        {podeEncerrar && (
          <Button variant="outline" size="sm" className="gap-1" disabled={salvando} onClick={async () => {
            if (!confirm('Encerrar a repetição deste pedido? Os pedidos já feitos continuam.')) return;
            setSalvando(true);
            try { await encerrarRecorrencia(repeticao.id); toast.success('Repetição encerrada.'); await onMudou(); }
            catch (e) { toast.error((e as Error).message); }
            finally { setSalvando(false); }
          }}><X className="h-4 w-4" /> Encerrar repetição</Button>
        )}
      </div>
    );
  }
  if (!podeRepetir) return null;

  const salvar = async () => {
    if (!primeira || primeira <= hojeBr()) return toast.error('A primeira repetição tem de ser depois de hoje.');
    setSalvando(true);
    try {
      const r = await repetirPedido(pedidoId, freq, primeira);
      toast.success(`Repetição programada: ${rotuloFrequencia(freq).toLowerCase()}, a partir de ${dataBr(r.proxima_data)}.`);
      await onMudou();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSalvando(false); }
  };
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <p className="text-sm font-medium flex items-center gap-2"><Repeat className="h-4 w-4 text-primary" /> Repetir este pedido</p>
      <p className="text-xs text-muted-foreground">
        Cria um pedido igual (com as quantidades atuais) na frequência escolhida. Cada repetição chega para conferência como um pedido novo.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs">Frequência</Label>
          <Select value={freq} onValueChange={v => { setFreq(v as Freq); setPrimeira(proximaData(hojeBr(), v as Freq)); }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{OPCOES.map(o => <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="primeira-rep" className="text-xs">Primeira repetição</Label>
          <Input id="primeira-rep" type="date" className="w-44" value={primeira} min={proximaData(hojeBr(), 'diaria')} onChange={e => setPrimeira(e.target.value)} />
        </div>
        <Button className="gap-2" disabled={salvando} onClick={salvar}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />} Programar repetição
        </Button>
      </div>
    </div>
  );
}
