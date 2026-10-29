import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Send } from 'lucide-react';
import { toast } from 'sonner';
import { formatarData } from '@/lib/convocacaoUniforme';
import { listEstados, Estado } from '@/services/estadosService';
import { lerListaEmails } from '@/services/emailConvocacaoService';
import {
  EmailPendentesConfig, enviarRelatorioPendentes, lerConfigPendentes, salvarConfigPendentes,
} from '@/services/relatorioPendentesService';
import { useAuth } from '@/contexts/AuthContext';

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

/** Configurações > E-mail: relatório semanal das fichas pendentes de assinatura. */
export default function EmailPendentesConfigCard({ podeEditar }: { podeEditar: boolean }) {
  const { can } = useAuth();
  const [cfg, setCfg] = useState<EmailPendentesConfig | null>(null);
  const [texto, setTexto] = useState('');
  const [textoCopia, setTextoCopia] = useState('');
  const [estados, setEstados] = useState<Estado[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    lerConfigPendentes().then(c => {
      setCfg(c);
      setTexto(c?.destinatarios.join('\n') ?? '');
      setTextoCopia(c?.copia?.join('\n') ?? '');
    }).catch(e => toast.error(`Erro ao carregar o relatório de fichas pendentes: ${(e as { message?: string })?.message ?? e}`));
    listEstados().then(setEstados).catch(() => {});
  }, []);

  if (!cfg) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Carregando…</CardContent></Card>;

  const { validos, invalidos } = lerListaEmails(texto);
  const copia = lerListaEmails(textoCopia);
  const copiaValidos = copia.validos.filter(e => !validos.includes(e));

  async function salvar() {
    if (!cfg) return;
    if (invalidos.length || copia.invalidos.length) {
      return toast.error(`E-mail inválido: ${[...invalidos, ...copia.invalidos].join(', ')}`);
    }
    if (cfg.automatico && !validos.length) return toast.error('Para o envio automático, informe ao menos um destinatário');
    setSalvando(true);
    try {
      await salvarConfigPendentes({
        destinatarios: validos, copia: copiaValidos, automatico: cfg.automatico, dia_semana: cfg.dia_semana, ufs: cfg.ufs,
      });
      toast.success('Relatório de fichas pendentes salvo');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  async function enviarAgora() {
    if (!cfg) return;
    if (invalidos.length || copia.invalidos.length) {
      return toast.error(`E-mail inválido: ${[...invalidos, ...copia.invalidos].join(', ')}`);
    }
    if (!validos.length) return toast.error('Informe ao menos um destinatário');
    setEnviando(true);
    try {
      const r = await enviarRelatorioPendentes({ destinatarios: validos, copia: copiaValidos, ufs: cfg.ufs });
      toast.success(`Relatório enviado para ${r.destinatarios} e-mail(s)${r.copia ? ` + ${r.copia} em cópia` : ''} · ${r.fichas} ficha(s) pendente(s).`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao enviar'); }
    finally { setEnviando(false); }
  }

  const alternarUf = (uf: string, marcado: boolean) =>
    setCfg({ ...cfg, ufs: marcado ? [...cfg.ufs, uf].sort() : cfg.ufs.filter(u => u !== uf) });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">E-mail das fichas pendentes de assinatura</CardTitle>
        <CardDescription>
          Resumo por estado e lista das fichas que ainda não foram assinadas (das mais antigas para as mais novas),
          com há quantos dias estão paradas, as fichas sem itens e a situação do link. Planilha Excel em anexo.
          Enviado pelo Microsoft 365.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="pend-dest">Destinatários (um por linha)</Label>
          <Textarea id="pend-dest" rows={4} value={texto} disabled={!podeEditar}
            onChange={e => setTexto(e.target.value)} placeholder="supervisao@grupo5estrelas.com.br" />
          {invalidos.length > 0 && <p className="text-xs text-destructive">Inválido: {invalidos.join(', ')}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="pend-copia">Em cópia (Cc), um por linha</Label>
          <Textarea id="pend-copia" rows={2} value={textoCopia} disabled={!podeEditar}
            onChange={e => setTextoCopia(e.target.value)} placeholder="gestor@grupo5estrelas.com.br" />
          {copia.invalidos.length > 0 && <p className="text-xs text-destructive">Inválido: {copia.invalidos.join(', ')}</p>}
        </div>

        <div>
          <Label>Estados do relatório</Label>
          <div className="flex flex-wrap gap-3 mt-2">
            {estados.map(e => (
              <label key={e.uf} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="checkbox" className="h-4 w-4" disabled={!podeEditar}
                  checked={cfg.ufs.includes(e.uf)} onChange={ev => alternarUf(e.uf, ev.target.checked)} />
                <span className="font-mono">{e.uf}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Nenhum marcado = os estados que têm ficha pendente.</p>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor="pend-auto" className="cursor-pointer">Envio automático semanal</Label>
            <p className="text-xs text-muted-foreground">
              Às 7h do dia escolhido.
              {cfg.ultimo_envio_automatico && ` Último envio: ${formatarData(cfg.ultimo_envio_automatico)}.`}
            </p>
          </div>
          <Switch id="pend-auto" checked={cfg.automatico} disabled={!podeEditar}
            onCheckedChange={v => setCfg({ ...cfg, automatico: v })} />
        </div>

        {cfg.automatico && (
          <div className="max-w-xs">
            <Label>Dia da semana</Label>
            <Select value={String(cfg.dia_semana)} disabled={!podeEditar}
              onValueChange={v => setCfg({ ...cfg, dia_semana: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DIAS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {podeEditar && (
            <Button onClick={salvar} disabled={salvando}><Save className="h-4 w-4 mr-1" /> Salvar</Button>
          )}
          {can('fichas_epi', 'view') && (
            <Button variant="outline" onClick={enviarAgora} disabled={enviando || !validos.length}
              title="Envia agora para os destinatários acima (só os estados liberados para você)">
              {enviando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} Enviar agora
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
