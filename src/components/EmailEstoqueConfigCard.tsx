import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BellRing, Loader2, Save, Send } from 'lucide-react';
import { toast } from 'sonner';
import { formatarData } from '@/lib/convocacaoUniforme';
import { listEstados, Estado } from '@/services/estadosService';
import { lerListaEmails } from '@/services/emailConvocacaoService';
import {
  EmailEstoqueConfig, contarReposicaoPendente, enviarPedidoReposicao, enviarRelatorioEstoque, lerConfigEstoque,
  salvarConfigEstoque,
} from '@/services/relatorioEstoqueService';
import { useAuth } from '@/contexts/AuthContext';

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

/** Configurações > E-mail: relatório de estoque (planilha completa + itens sem estoque ou abaixo do mínimo). */
export default function EmailEstoqueConfigCard({ podeEditar }: { podeEditar: boolean }) {
  const { can } = useAuth();
  const [cfg, setCfg] = useState<EmailEstoqueConfig | null>(null);
  const [texto, setTexto] = useState('');
  const [textoCopia, setTextoCopia] = useState('');
  const [estados, setEstados] = useState<Estado[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [pendentes, setPendentes] = useState(0);
  const [enviandoReposicao, setEnviandoReposicao] = useState(false);

  useEffect(() => {
    lerConfigEstoque().then(c => {
      setCfg(c);
      setTexto(c?.destinatarios.join('\n') ?? '');
      setTextoCopia(c?.copia?.join('\n') ?? '');
    }).catch(e => toast.error(`Erro ao carregar o relatório de estoque: ${(e as { message?: string })?.message ?? e}`));
    listEstados().then(setEstados).catch(() => {});
    contarReposicaoPendente().then(setPendentes).catch(() => {});
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
    if ((cfg.automatico || cfg.alerta_reposicao) && !validos.length) return toast.error('Para o envio automático, informe ao menos um destinatário');
    setSalvando(true);
    try {
      await salvarConfigEstoque({
        destinatarios: validos, copia: copiaValidos, automatico: cfg.automatico, dia_semana: cfg.dia_semana, ufs: cfg.ufs,
        alerta_reposicao: cfg.alerta_reposicao,
      });
      toast.success('Relatório de estoque salvo');
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
      const r = await enviarRelatorioEstoque({ destinatarios: validos, copia: copiaValidos, ufs: cfg.ufs });
      toast.success(`Relatório enviado para ${r.destinatarios} e-mail(s)${r.copia ? ` + ${r.copia} em cópia` : ''} · ${r.alerta} item(ns) em alerta.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao enviar'); }
    finally { setEnviando(false); }
  }

  async function enviarReposicao() {
    if (!validos.length) return toast.error('Informe ao menos um destinatário');
    setEnviandoReposicao(true);
    try {
      const r = await enviarPedidoReposicao({ destinatarios: validos, copia: copiaValidos });
      if (r.enviado) toast.success(`Pedido de reposição enviado: ${r.itens} item(ns).`);
      else toast.info(`Nada enviado: ${r.motivo ?? 'sem itens pendentes'}.`);
      setPendentes(await contarReposicaoPendente().catch(() => 0));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao enviar'); }
    finally { setEnviandoReposicao(false); }
  }

  const alternarUf = (uf: string, marcado: boolean) =>
    setCfg({ ...cfg, ufs: marcado ? [...cfg.ufs, uf].sort() : cfg.ufs.filter(u => u !== uf) });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">E-mail do relatório de estoque</CardTitle>
        <CardDescription>
          Planilha Excel com o estoque completo por estado e tamanho; no e-mail, o destaque dos itens sem estoque ou
          abaixo do mínimo (mesma regra da tela Estoque). Enviado pelo Microsoft 365.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="est-dest">Destinatários (um por linha)</Label>
          <Textarea id="est-dest" rows={4} value={texto} disabled={!podeEditar}
            onChange={e => setTexto(e.target.value)} placeholder="compras@grupo5estrelas.com.br" />
          {invalidos.length > 0 && <p className="text-xs text-destructive">Inválido: {invalidos.join(', ')}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="est-copia">Em cópia (Cc), um por linha</Label>
          <Textarea id="est-copia" rows={2} value={textoCopia} disabled={!podeEditar}
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
          <p className="text-xs text-muted-foreground mt-1">Nenhum marcado = os estados que têm estoque cadastrado.</p>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor="est-auto" className="cursor-pointer">Envio automático semanal</Label>
            <p className="text-xs text-muted-foreground">
              Às 7h do dia escolhido.
              {cfg.ultimo_envio_automatico && ` Último envio: ${formatarData(cfg.ultimo_envio_automatico)}.`}
            </p>
          </div>
          <Switch id="est-auto" checked={cfg.automatico} disabled={!podeEditar}
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

        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor="est-reposicao" className="cursor-pointer">Pedido de reposição automático</Label>
            <p className="text-xs text-muted-foreground">
              Quando o saldo de um item num estado chega ao estoque mínimo (definido na tela Estoque, por estado),
              os destinatários acima recebem um e-mail pedindo a reposição — em até 15 minutos.
              {pendentes > 0 && ` ${pendentes} item(ns) aguardando envio.`}
            </p>
          </div>
          <Switch id="est-reposicao" checked={cfg.alerta_reposicao} disabled={!podeEditar}
            onCheckedChange={v => setCfg({ ...cfg, alerta_reposicao: v })} />
        </div>

        <div className="flex flex-wrap gap-2">
          {podeEditar && (
            <Button onClick={salvar} disabled={salvando}><Save className="h-4 w-4 mr-1" /> Salvar</Button>
          )}
          {can('estoque', 'view') && (
            <Button variant="outline" onClick={enviarAgora} disabled={enviando || !validos.length}
              title="Envia agora para os destinatários acima (só os estados liberados para você)" data-guia="btn-estoque-enviar-relatorio">
              {enviando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} Enviar agora
            </Button>
          )}
          {can('estoque', 'view') && pendentes > 0 && (
            <Button variant="outline" onClick={enviarReposicao} disabled={enviandoReposicao || !validos.length}
              title="Envia já o pedido de reposição dos itens que chegaram ao mínimo">
              {enviandoReposicao ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <BellRing className="h-4 w-4 mr-1" />}
              Enviar pedido de reposição ({pendentes})
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
