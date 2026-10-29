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
import { lerListaEmails } from '@/services/emailConvocacaoService';
import {
  EmailPendentesEstado, enviarRelatorioPendentes, listarConfigPendentes, salvarConfigPendentes,
} from '@/services/relatorioPendentesService';
import EstadoSelect, { useEstadoLembrado } from '@/components/EstadoSelect';
import { useAuth } from '@/contexts/AuthContext';

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

const padrao = (uf: string): EmailPendentesEstado =>
  ({ uf, destinatarios: [], copia: [], automatico: false, dia_semana: 1, ultimo_envio_automatico: null });

/** Configurações > E-mail: relatório semanal das fichas pendentes de assinatura, configurado por estado. */
export default function EmailPendentesConfigCard({ podeEditar }: { podeEditar: boolean }) {
  const { can } = useAuth();
  const [uf, setUf] = useEstadoLembrado('email-pendentes');
  const [todos, setTodos] = useState<EmailPendentesEstado[] | null>(null);
  const [cfg, setCfg] = useState<EmailPendentesEstado | null>(null);
  const [texto, setTexto] = useState('');
  const [textoCopia, setTextoCopia] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    listarConfigPendentes().then(setTodos)
      .catch(e => toast.error(`Erro ao carregar o relatório de fichas pendentes: ${(e as { message?: string })?.message ?? e}`));
  }, []);

  // Troca de estado: carrega a configuração dele (ou a padrão, se ainda não tem).
  useEffect(() => {
    if (!todos || !uf) return;
    const c = todos.find(t => t.uf === uf) ?? padrao(uf);
    setCfg(c);
    setTexto(c.destinatarios.join('\n'));
    setTextoCopia(c.copia.join('\n'));
  }, [todos, uf]);

  if (!todos) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Carregando…</CardContent></Card>;

  const { validos, invalidos } = lerListaEmails(texto);
  const copia = lerListaEmails(textoCopia);
  const copiaValidos = copia.validos.filter(e => !validos.includes(e));
  const ligados = todos.filter(t => t.automatico);

  async function salvar() {
    if (!cfg) return;
    if (invalidos.length || copia.invalidos.length) {
      return toast.error(`E-mail inválido: ${[...invalidos, ...copia.invalidos].join(', ')}`);
    }
    if (cfg.automatico && !validos.length) return toast.error('Para o envio automático, informe ao menos um destinatário');
    setSalvando(true);
    try {
      const novo = { uf: cfg.uf, destinatarios: validos, copia: copiaValidos, automatico: cfg.automatico, dia_semana: cfg.dia_semana };
      await salvarConfigPendentes(novo);
      setTodos(t => [...(t ?? []).filter(x => x.uf !== cfg.uf), { ...novo, ultimo_envio_automatico: cfg.ultimo_envio_automatico }]
        .sort((a, b) => a.uf.localeCompare(b.uf)));
      toast.success(`Relatório de fichas pendentes de ${cfg.uf} salvo`);
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
      const r = await enviarRelatorioPendentes({ uf: cfg.uf, destinatarios: validos, copia: copiaValidos });
      toast.success(`Relatório de ${cfg.uf} enviado para ${r.destinatarios} e-mail(s)${r.copia ? ` + ${r.copia} em cópia` : ''} · ${r.fichas} ficha(s) pendente(s).`);
      if (r.erro_imagem) toast.warning(`O e-mail saiu sem a imagem do painel: ${r.erro_imagem}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao enviar'); }
    finally { setEnviando(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">E-mail das fichas pendentes de assinatura</CardTitle>
        <CardDescription>
          Configurado por estado: cada estado tem os seus destinatários e o seu dia. O e-mail traz só as fichas do estado
          que ainda não foram assinadas (das mais antigas para as mais novas), com há quantos dias estão paradas, as
          fichas sem itens e a situação do link. Em anexo: imagem do painel do estado (como em Consultar Fichas) e planilha Excel. Enviado pelo Microsoft 365.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="max-w-xs space-y-2">
          <Label htmlFor="pend-uf">Estado</Label>
          <EstadoSelect id="pend-uf" value={uf} onChange={setUf} />
          <p className="text-xs text-muted-foreground">
            Envio automático ligado: {ligados.length
              ? ligados.map(t => `${t.uf} (${DIAS[t.dia_semana].toLowerCase()})`).join(', ')
              : 'nenhum estado'}.
          </p>
        </div>

        {cfg && (<>
          <div className="space-y-2">
            <Label htmlFor="pend-dest">Destinatários de {cfg.uf} (um por linha)</Label>
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

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="pend-auto" className="cursor-pointer">Envio automático semanal de {cfg.uf}</Label>
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
              <Button onClick={salvar} disabled={salvando}><Save className="h-4 w-4 mr-1" /> Salvar {cfg.uf}</Button>
            )}
            {can('fichas_epi', 'view') && (
              <Button variant="outline" onClick={enviarAgora} disabled={enviando || !validos.length}
                title={`Envia agora o relatório de ${cfg.uf} para os destinatários acima`}>
                {enviando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} Enviar agora
              </Button>
            )}
          </div>
        </>)}
      </CardContent>
    </Card>
  );
}
