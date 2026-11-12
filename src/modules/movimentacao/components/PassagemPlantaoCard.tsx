import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDays, CheckCircle2, Handshake, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import type { Solicitante } from '@/modules/crachas/lib/solicitacaoService';
import { dataBr, passarPlantao, type ColaboradorSenior, type FiscalIdentificado } from '../lib/movimentacaoService';
import EscolherColaborador from './EscolherColaborador';

/** Dia (AAAA-MM-DD) n dias antes. */
const diasAntes = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/**
 * Passagem de plantão no link do fiscal: registra quem entrega, quem recebe e
 * as observações; o sistema manda por e-mail o relatório do dia em PDF.
 */
export default function PassagemPlantaoCard({ quem, fiscal, dataPlantao }: {
  quem: Solicitante; fiscal: FiscalIdentificado; dataPlantao: string;
}) {
  const [data, setData] = useState(dataPlantao || fiscal.hoje);
  const [recebe, setRecebe] = useState<ColaboradorSenior | null>(null);
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<{ codigo: string; data: string; lancamentos: number } | null>(null);

  const enviar = async () => {
    if (!data) return toast.error('Escolha o dia do plantão.');
    const doDia = fiscal.lancamentos.filter(l => l.data === data || l.data_lancamento === data).length;
    if (!window.confirm(
      `Passar o plantão de ${dataBr(data)}${recebe ? ` para ${recebe.nome}` : ''}?\n\n`
      + `O relatório com os seus lançamentos desse dia${doDia ? ` (${doDia})` : ''} vai por e-mail em PDF para a fiscalização.`)) return;
    setEnviando(true);
    try {
      const r = await passarPlantao(quem, { data, recebe_senior_id: recebe?.id ?? null, observacao: obs.trim() });
      setFeito(r);
      setObs(''); setRecebe(null);
    } catch (e) { toast.error((e as Error).message); } finally { setEnviando(false); }
  };

  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Handshake className="h-4 w-4 text-primary" /> Passagem de plantão</CardTitle>
        <CardDescription>
          No fim do plantão: o relatório dos seus lançamentos do dia vai por e-mail, em PDF, para a fiscalização.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {feito && (
          <div role="status" className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-sm flex gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-semibold">Passagem {feito.codigo} registrada.</p>
              <p>Plantão de {dataBr(feito.data)} com {feito.lancamentos} lançamento(s). O e-mail com o PDF sai em até 5 minutos.</p>
              <button type="button" className="text-primary underline text-xs" onClick={() => setFeito(null)}>Fechar</button>
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="pas-dia" className="text-sm">Dia do plantão</Label>
          <div className="relative">
            <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input id="pas-dia" type="date" className="pl-8" min={diasAntes(fiscal.hoje, 2)} max={fiscal.hoje} value={data}
              onChange={e => setData(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Quem recebe o plantão (opcional)</Label>
          <EscolherColaborador quem={quem} rotulo="quem recebe o plantão" valor={recebe} mudar={setRecebe} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pas-obs" className="text-sm">Observações (opcional)</Label>
          <Textarea id="pas-obs" rows={3} value={obs} onChange={e => setObs(e.target.value.slice(0, 1000))}
            placeholder="Pendências, postos descobertos, recados para o próximo fiscal…" />
        </div>
        <Button type="button" className="w-full gap-2" disabled={enviando} onClick={enviar}>
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Passar o plantão e enviar o PDF
        </Button>
      </CardContent>
    </Card>
  );
}
