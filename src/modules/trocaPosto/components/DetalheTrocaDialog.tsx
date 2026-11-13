import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowDown, Ban, Check, CheckCircle2, Info, Loader2, RefreshCw, RotateCcw, Send, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  acaoSenior, cancelarTroca, conferirSenior, dataBr, dataHoraBr, decidirTroca, envioParado, nomePosto, previaSenior, type TrocaPosto,
} from '../lib/trocaPostoService';
import SeloStatusTroca from './SeloStatusTroca';
import PadraoPostoCard from './PadraoPostoCard';

const hojeIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

/** Detalhe da troca: de → para, histórico, prévia, aprovação e (administrador) envio à Senior. */
export default function DetalheTrocaDialog({ troca, fechar, mudou, podeAprovar, meuId, podeCriar, adminSenior }: {
  troca: TrocaPosto | null; fechar: () => void; mudou: () => void;
  podeAprovar: boolean; podeCriar: boolean; meuId: string | null; adminSenior: boolean;
}) {
  const [obs, setObs] = useState('');
  const [acao, setAcao] = useState<'aprovar' | 'recusar' | 'cancelar' | 'enviar' | 'desfazer' | 'conferir' | null>(null);
  const [confirmando, setConfirmando] = useState<'enviar' | 'desfazer' | null>(null);
  const [atual, setAtual] = useState<TrocaPosto | null>(troca);

  if (!atual) return null;
  const t = atual;
  const pendente = t.status === 'pendente';
  const podeCancelar = pendente && (podeAprovar || (podeCriar && !!meuId && t.solicitante_id === meuId));
  const demo = /^TP-DEMO/i.test(t.codigo);
  const outraEstrutura = t.posto_atual_estrutura != null && t.posto_atual_estrutura !== t.posto_novo_estrutura;
  const podeEnviar = adminSenior && !demo && !outraEstrutura && (t.status === 'aprovada' || t.status === 'erro_envio' || envioParado(t));
  const podeConferir = adminSenior && !demo && ['enviando', 'enviada', 'erro_envio', 'desfeita'].includes(t.status);
  const podeDesfazer = adminSenior && !demo && t.status === 'enviada';
  const jaVale = t.data_inicio <= hojeIso();

  const decidir = async (aprovar: boolean) => {
    if (!aprovar && !obs.trim()) return toast.error('Escreva o motivo da recusa.');
    setAcao(aprovar ? 'aprovar' : 'recusar');
    try {
      await decidirTroca(t.id, aprovar, obs.trim());
      toast.success(aprovar ? `Troca ${t.codigo} aprovada.` : `Troca ${t.codigo} recusada.`);
      setObs(''); mudou(); fechar();
    } catch (e) { toast.error((e as Error).message); } finally { setAcao(null); }
  };
  const cancelar = async () => {
    if (!window.confirm(`Cancelar a troca ${t.codigo}?`)) return;
    setAcao('cancelar');
    try { await cancelarTroca(t.id); toast.success(`Troca ${t.codigo} cancelada.`); mudou(); fechar(); }
    catch (e) { toast.error((e as Error).message); } finally { setAcao(null); }
  };
  // Relê na Senior e confirma (chamada separada: cada uma cabe no limite de 60 s do servidor).
  const conferir = async (base: TrocaPosto, automatico = false) => {
    setAcao('conferir');
    try {
      const novo = await conferirSenior(base);
      setAtual(novo); mudou();
      if (novo.status !== base.status) {
        if (novo.status === 'enviada') toast.success(`Confirmado: a troca ${novo.codigo} está gravada na Senior.`);
        else if (novo.status === 'desfeita') toast.success(`Confirmado: a troca ${novo.codigo} foi desfeita na Senior.`);
        else if (novo.status === 'erro_envio') toast.error('A troca não apareceu na Senior. Pode tentar enviar de novo.', { duration: 12000 });
      } else if (!automatico) toast.success('Conferido na Senior.');
    } catch (e) {
      toast.error(automatico ? `Não deu para conferir agora: ${(e as Error).message}` : (e as Error).message, { duration: 12000 });
    } finally { setAcao(null); }
  };
  const executarSenior = async (qual: 'enviar' | 'desfazer') => {
    setAcao(qual);
    let depois: TrocaPosto | null = null;
    try {
      const r = await acaoSenior(t, qual);
      setAtual(r.troca); setConfirmando(null); mudou();
      if (r.erro) toast.error(`A Senior recusou: ${r.erro}`, { duration: 15000 });
      else {
        if (r.pendente) toast.warning('A Senior não respondeu a tempo. Conferindo se gravou…', { duration: 10000 });
        else toast.success(qual === 'enviar' ? `Troca ${t.codigo} gravada na Senior. Conferindo…` : `Troca ${t.codigo} desfeita na Senior. Conferindo…`);
        depois = r.troca;
      }
    } catch (e) {
      toast.error((e as Error).message, { duration: 15000 });
      mudou();
    } finally { setAcao(null); setConfirmando(null); }
    if (depois) await conferir(depois, true);
  };

  const Linha = ({ r, v }: { r: string; v: React.ReactNode }) => (
    <div className="grid grid-cols-[120px_1fr] gap-2 text-sm py-1"><span className="text-muted-foreground">{r}</span><span className="break-words">{v}</span></div>
  );

  const lido = t.senior_lido;
  const conferido = !!lido && !lido.erro_leitura && (
    t.status === 'enviada' ? (jaVale ? lido.posto === t.posto_novo_codigo : true)
      : t.status === 'desfeita' ? lido.posto === t.posto_atual_codigo : false);

  return (
    <Dialog open onOpenChange={v => { if (!v) fechar(); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">Troca {t.codigo} <SeloStatusTroca status={t.status} /></DialogTitle>
          <DialogDescription>{t.colaborador_nome} · matrícula {t.num_cad} · empresa {t.num_emp}{t.cargo ? ` · ${t.cargo}` : ''}{t.uf ? ` · ${t.uf}` : ''}</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border overflow-hidden text-sm">
          <div className="p-3 bg-muted/40">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Posto atual</p>
            <p className="font-semibold">{nomePosto(t.posto_atual_descricao, t.posto_atual_estrutura, t.posto_atual_codigo)}</p>
            <p className="text-xs text-muted-foreground">
              Escala {t.escala_atual_nome ?? t.escala_atual_codigo ?? '—'}{t.cargo ? ` · Cargo ${t.cargo_atual_codigo ? `${t.cargo_atual_codigo} – ` : ''}${t.cargo}` : ''}
              {t.centro_custo_atual ? ` · C. custo ${t.centro_custo_atual}` : ''}
            </p>
          </div>
          <div className="flex justify-center -my-2.5 relative"><span className="rounded-full bg-background border p-1"><ArrowDown className="h-4 w-4" /></span></div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Posto novo a partir de {dataBr(t.data_inicio)}</p>
            <p className="font-semibold">{nomePosto(t.posto_novo_descricao, t.posto_novo_estrutura, t.posto_novo_codigo)}</p>
            <p className="text-xs text-muted-foreground">Escala {t.escala_nova_codigo == null ? 'mantida' : (t.escala_nova_nome ?? t.escala_nova_codigo)}</p>
          </div>
        </div>

        {t.padrao_posto
          ? <PadraoPostoCard padrao={t.padrao_posto} cargoAtual={t.cargo_atual_codigo} cargoAtualNome={t.cargo} manterCargo={t.manter_cargo} />
          : <p className="text-xs text-muted-foreground">Cargo/local/centro de custo do posto novo não foram lidos na Senior no pedido. A Senior aplica os do posto{t.manter_cargo ? ' (mantendo o cargo)' : ''}.</p>}

        <div>
          <Linha r="Motivo" v={t.motivo} />
          {t.observacao && <Linha r="Observação" v={t.observacao} />}
          <Linha r="Pedido por" v={`${t.solicitante_nome ?? '—'} em ${dataHoraBr(t.created_at)}`} />
          {t.decidido_em && (
            <Linha r={t.status === 'cancelada' ? 'Cancelada por' : t.status === 'recusada' ? 'Recusada por' : 'Aprovada por'}
              v={`${t.decidido_nome ?? '—'} em ${dataHoraBr(t.decidido_em)}${t.decisao_obs ? ` — "${t.decisao_obs}"` : ''}`} />
          )}
          {t.senior_enviado_em && <Linha r="Na Senior" v={`gravada por ${t.senior_enviado_por ?? '—'} em ${dataHoraBr(t.senior_enviado_em)}`} />}
          {t.senior_desfeito_em && <Linha r="Desfeita" v={dataHoraBr(t.senior_desfeito_em)} />}
          {t.senior_resposta && t.status !== 'enviada' && <Linha r="Senior disse" v={t.senior_resposta} />}
        </div>

        {lido && (
          <div className={cn('rounded-md border p-3 text-xs space-y-1', conferido ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30' : 'border-amber-300 bg-amber-50 dark:bg-amber-950/30')}>
            <p className="font-medium text-sm flex items-center gap-1.5">
              {conferido ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-amber-600" />}
              Relido na Senior
            </p>
            {lido.erro_leitura ? <p>Não deu para reler: {lido.erro_leitura}</p> : (
              <p>Posto {lido.posto ?? '—'} · cargo {lido.cargo ?? '—'} · local {lido.local ?? '—'} · centro de custo {lido.centroCusto ?? '—'} · escala {lido.escala ?? '—'}</p>
            )}
            {t.status === 'enviada' && !jaVale && <p>A troca vale a partir de {dataBr(t.data_inicio)}: até lá a Senior ainda mostra o posto atual.</p>}
          </div>
        )}

        <details className="rounded-md border p-3 text-sm" open={t.status === 'aprovada' || t.status === 'erro_envio' || t.status === 'enviando'}>
          <summary className="cursor-pointer font-medium">O que vai para a Senior (historicos · Posto_4)</summary>
          <table className="mt-2 w-full text-xs">
            <tbody>
              {previaSenior(t).map(c => (
                <tr key={c.campo} className="border-t">
                  <td className="py-1 pr-2 font-mono">{c.campo}</td>
                  <td className="py-1 pr-2 font-medium break-all">{c.valor}</td>
                  <td className="py-1 text-muted-foreground">{c.nota}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!adminSenior && t.status === 'aprovada' && (
            <p className="text-xs text-muted-foreground mt-2 flex gap-1.5"><Info className="h-3.5 w-3.5 shrink-0 mt-0.5" /> Um administrador envia a troca aprovada para a Senior.</p>
          )}
        </details>

        {outraEstrutura && (t.status === 'aprovada' || t.status === 'pendente' || t.status === 'erro_envio') && (
          <p className="text-xs rounded-md bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100 p-2">
            <strong>Movimentação entre empresas não é permitida.</strong> O colaborador é da empresa {t.num_emp} e o posto novo é de outra empresa (estrutura {t.posto_novo_estrutura}). Esta troca não pode ser enviada: recuse ou cancele e peça de novo com um posto da empresa {t.num_emp}.
          </p>
        )}
        {demo && adminSenior && t.status === 'aprovada' && (
          <p className="text-xs rounded-md bg-muted p-2">Troca fictícia (demonstração): o botão Enviar à Senior não aparece.</p>
        )}
        {import.meta.env.DEV && (podeEnviar || podeDesfazer) && (
          <p className="text-xs rounded-md bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100 p-2">
            Localhost ligado na <strong>Senior de verdade</strong>: só as matrículas de teste (padrão 3/3008990) podem ser enviadas.
          </p>
        )}
        {(t.status === 'aprovada' || t.status === 'enviada') && (
          <p className="text-xs rounded-md bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100 p-2">
            Confira a ficha de uniforme e EPI: o posto novo pode pedir outro uniforme.
          </p>
        )}

        {t.status === 'enviando' && (
          <p className="text-xs rounded-md bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100 p-2">
            Enviada à Senior{t.senior_envio_iniciado_em ? ` em ${dataHoraBr(t.senior_envio_iniciado_em)}` : ''}, sem confirmação ainda.
            Clique em <strong>Conferir na Senior</strong>{envioParado(t) ? '. Se não gravou, envie de novo.' : ' (o reenvio fica liberado depois de 3 minutos).'}
          </p>
        )}

        {/* Envio / desfazer / conferir na Senior (administrador) */}
        {(podeEnviar || podeDesfazer || podeConferir) && (
          <div className="border-t pt-3 space-y-2">
            {acao === 'conferir' && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Conferindo na Senior… pode levar até 1 minuto.</p>}
            {!confirmando ? (
              <div className="flex flex-wrap gap-2 justify-end">
                {podeConferir && (
                  <Button variant="outline" className="gap-1.5" disabled={!!acao} onClick={() => conferir(t)}>
                    {acao === 'conferir' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Conferir na Senior
                  </Button>
                )}
                {podeEnviar && <Button className="gap-1.5" disabled={!!acao} onClick={() => setConfirmando('enviar')}><Send className="h-4 w-4" /> {t.status === 'aprovada' ? 'Enviar à Senior' : 'Tentar enviar de novo'}</Button>}
                {podeDesfazer && <Button variant="outline" className="gap-1.5 text-destructive" disabled={!!acao} onClick={() => setConfirmando('desfazer')}><RotateCcw className="h-4 w-4" /> Desfazer na Senior</Button>}
              </div>
            ) : (
              <div className={cn('rounded-md border p-3 space-y-2', confirmando === 'desfazer' ? 'border-red-300 bg-red-50 dark:bg-red-950/30' : 'border-primary/40 bg-primary/5')}>
                <p className="text-sm">
                  {confirmando === 'enviar'
                    ? <>Isto <strong>grava na Senior</strong> a troca de {t.colaborador_nome} para o posto {t.posto_novo_codigo} a partir de {dataBr(t.data_inicio)}, com o cargo, local e centro de custo mostrados acima{jaVale ? <> — <strong>vale já, entra na folha</strong></> : ''}.</>
                    : <>Isto <strong>apaga da Senior</strong> a troca de {dataBr(t.data_inicio)} (posto e o cargo, local e centro de custo lançados junto). O colaborador volta para {t.posto_atual_codigo}.</>}
                </p>
                <p className="text-sm font-medium">{confirmando === 'enviar' ? 'Confirma gravar na Senior?' : 'Confirma apagar da Senior?'}</p>
                <div className="flex flex-wrap gap-2 items-center">
                  <Button className="gap-1.5 min-w-24" autoFocus variant={confirmando === 'desfazer' ? 'destructive' : 'default'} disabled={!!acao} onClick={() => executarSenior(confirmando)}>
                    {acao === confirmando && <Loader2 className="h-4 w-4 animate-spin" />} Sim
                  </Button>
                  <Button variant="outline" className="min-w-24" disabled={!!acao} onClick={() => setConfirmando(null)}>Não</Button>
                </div>
                {(acao === 'enviar' || acao === 'desfazer') && <p className="text-xs text-muted-foreground">Falando com a Senior… pode levar até 1 minuto. Não feche esta janela.</p>}
              </div>
            )}
          </div>
        )}

        {pendente && podeAprovar && (
          <div className="space-y-2 border-t pt-3">
            <Textarea rows={2} value={obs} onChange={e => setObs(e.target.value.slice(0, 500))}
              placeholder="Comentário (obrigatório para recusar)" />
            <div className="flex flex-wrap gap-2 justify-end">
              {podeCancelar && (
                <Button variant="ghost" className="gap-1.5" disabled={!!acao} onClick={cancelar}>
                  {acao === 'cancelar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Cancelar pedido
                </Button>
              )}
              <Button variant="outline" className="gap-1.5 text-destructive" disabled={!!acao} onClick={() => decidir(false)}>
                {acao === 'recusar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Recusar
              </Button>
              <Button className="gap-1.5" disabled={!!acao} onClick={() => decidir(true)}>
                {acao === 'aprovar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aprovar
              </Button>
            </div>
          </div>
        )}
        {pendente && !podeAprovar && podeCancelar && (
          <div className="flex justify-end border-t pt-3">
            <Button variant="ghost" className="gap-1.5" disabled={!!acao} onClick={cancelar}><Ban className="h-4 w-4" /> Cancelar pedido</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
