import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { formatarData } from '@/lib/convocacaoUniforme';
import { listEstados, Estado } from '@/services/estadosService';
import {
  EmailConvocacaoConfig, lerConfigEmail, lerListaEmails, salvarConfigEmail,
} from '@/services/emailConvocacaoService';

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

/** Configurações > E-mail: destinatários e envio automático da convocação de uniforme. */
export default function EmailConvocacaoConfigCard({ podeEditar }: { podeEditar: boolean }) {
  const [cfg, setCfg] = useState<EmailConvocacaoConfig | null>(null);
  const [texto, setTexto] = useState('');
  const [textoCopia, setTextoCopia] = useState('');
  const [estados, setEstados] = useState<Estado[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    lerConfigEmail().then(c => {
      setCfg(c);
      setTexto(c?.destinatarios.join('\n') ?? '');
      setTextoCopia(c?.copia?.join('\n') ?? '');
    })
      .catch(e => toast.error(`Erro ao carregar a configuração do e-mail: ${(e as { message?: string })?.message ?? e}`));
    listEstados().then(setEstados).catch(() => {});
  }, []);

  if (!cfg) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Carregando…</CardContent></Card>;

  const { validos, invalidos } = lerListaEmails(texto);
  const copia = lerListaEmails(textoCopia);

  async function salvar() {
    if (!cfg) return;
    if (invalidos.length || copia.invalidos.length) {
      return toast.error(`E-mail inválido: ${[...invalidos, ...copia.invalidos].join(', ')}`);
    }
    if (cfg.automatico && !validos.length) return toast.error('Para o envio automático, informe ao menos um destinatário');
    setSalvando(true);
    try {
      await salvarConfigEmail({
        destinatarios: validos, copia: copia.validos.filter(e => !validos.includes(e)),
        automatico: cfg.automatico, dia_semana: cfg.dia_semana, ufs: cfg.ufs,
      });
      toast.success('Configuração de e-mail salva');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  const alternarUf = (uf: string, marcado: boolean) =>
    setCfg({ ...cfg, ufs: marcado ? [...cfg.ufs, uf].sort() : cfg.ufs.filter(u => u !== uf) });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">E-mail da convocação de uniforme</CardTitle>
        <CardDescription>
          Lista de quem precisa trocar o uniforme (vencidos e quem vence em até 30 dias), enviada pelo Microsoft 365
          com a planilha em anexo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="cfg-dest">Destinatários (um por linha)</Label>
          <Textarea id="cfg-dest" rows={5} value={texto} disabled={!podeEditar}
            onChange={e => setTexto(e.target.value)} placeholder="rh@grupo5estrelas.com.br" />
          {invalidos.length > 0 && <p className="text-xs text-destructive">Inválido: {invalidos.join(', ')}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="cfg-copia">Em cópia (Cc), um por linha</Label>
          <Textarea id="cfg-copia" rows={3} value={textoCopia} disabled={!podeEditar}
            onChange={e => setTextoCopia(e.target.value)} placeholder="gestor@grupo5estrelas.com.br" />
          {copia.invalidos.length > 0 && <p className="text-xs text-destructive">Inválido: {copia.invalidos.join(', ')}</p>}
          <p className="text-xs text-muted-foreground">
            Destinatários e cópia valem para o envio automático e aparecem preenchidos no botão "Enviar por e-mail" da tela Vencimentos.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor="cfg-auto" className="cursor-pointer">Envio automático semanal</Label>
            <p className="text-xs text-muted-foreground">
              Às 7h do dia escolhido.
              {cfg.ultimo_envio_automatico && ` Último envio: ${formatarData(cfg.ultimo_envio_automatico)}.`}
            </p>
          </div>
          <Switch id="cfg-auto" checked={cfg.automatico} disabled={!podeEditar}
            onCheckedChange={v => setCfg({ ...cfg, automatico: v })} />
        </div>

        {cfg.automatico && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Dia da semana</Label>
              <Select value={String(cfg.dia_semana)} disabled={!podeEditar}
                onValueChange={v => setCfg({ ...cfg, dia_semana: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIAS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estados</Label>
              <div className="flex flex-wrap gap-3 mt-2">
                {estados.map(e => (
                  <label key={e.uf} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="checkbox" className="h-4 w-4" disabled={!podeEditar}
                      checked={cfg.ufs.includes(e.uf)} onChange={ev => alternarUf(e.uf, ev.target.checked)} />
                    <span className="font-mono">{e.uf}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Nenhum marcado = todos os estados.</p>
            </div>
          </div>
        )}

        {podeEditar && (
          <Button onClick={salvar} disabled={salvando}><Save className="h-4 w-4 mr-1" /> Salvar</Button>
        )}
      </CardContent>
    </Card>
  );
}
