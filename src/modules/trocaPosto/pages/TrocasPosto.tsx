import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowRight, Info, Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import {
  STATUS_ROTULO, dataBr, dataHoraBr, filtrarTrocas, listarTrocas, nomePosto, type StatusTroca, type TrocaPosto,
} from '../lib/trocaPostoService';
import NovaTrocaDialog from '../components/NovaTrocaDialog';
import DetalheTrocaDialog from '../components/DetalheTrocaDialog';
import SeloStatusTroca from '../components/SeloStatusTroca';

const FILTROS: (StatusTroca | 'todas')[] = ['pendente', 'aprovada', 'enviada', 'erro_envio', 'recusada', 'cancelada', 'desfeita', 'todas'];

/**
 * Troca de posto: pedido (quem tem "criar") e aprovação (quem tem "editar").
 * Por enquanto não grava na Senior: a aprovação só registra e mostra a prévia.
 */
export default function TrocasPosto() {
  const { can, user } = useAuth();
  const podeCriar = can('troca_posto', 'create');
  const podeAprovar = can('troca_posto', 'edit');
  // Envio à Senior: só administrador de verdade (o servidor confere de novo).
  const adminSenior = user?.role === 'admin';

  const [trocas, setTrocas] = useState<TrocaPosto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [status, setStatus] = useState<StatusTroca | 'todas'>('pendente');
  const [busca, setBusca] = useState('');
  const [nova, setNova] = useState(false);
  const [aberta, setAberta] = useState<TrocaPosto | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setTrocas(await listarTrocas()); }
    catch (e) { toast.error((e as Error).message); } finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = { todas: trocas.length };
    for (const t of trocas) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [trocas]);
  const lista = useMemo(() => filtrarTrocas(trocas, status, busca), [trocas, status, busca]);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Senior" title="Troca de posto"
        description="Pedido de mudança de posto do colaborador, com aprovação antes de ir para a Senior."
        actions={<>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={carregar} disabled={carregando}>
            <RefreshCw className={cn('h-4 w-4', carregando && 'animate-spin')} /> Atualizar
          </Button>
          {podeCriar && <Button size="sm" className="gap-1.5" onClick={() => setNova(true)}><Plus className="h-4 w-4" /> Nova solicitação</Button>}
        </>} />

      <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40 p-3 text-sm flex gap-2 text-blue-950 dark:text-blue-100">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <p>Pedir e aprovar <strong>não grava na Senior</strong>. Depois de aprovada, um administrador abre a troca e clica em <strong>Enviar à Senior</strong> (com a prévia e a confirmação pela matrícula). A troca gravada pode ser desfeita.</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {FILTROS.map(f => (
          <button key={f} type="button" onClick={() => setStatus(f)}
            className={cn('rounded-full border px-3 py-1 text-sm', status === f ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted')}>
            {f === 'todas' ? 'Todas' : STATUS_ROTULO[f]} <span className="opacity-70">({contagem[f] ?? 0})</span>
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input className="pl-8" placeholder="Nome, matrícula, posto, código" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {carregando ? (
            <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : lista.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {trocas.length === 0 ? 'Nenhuma troca de posto pedida ainda.' : 'Nada com esse filtro.'}
            </p>
          ) : (
            <>
              {/* Celular: cartões */}
              <div className="divide-y md:hidden">
                {lista.map(t => (
                  <button key={t.id} type="button" onClick={() => setAberta(t)} className="w-full text-left p-3 hover:bg-muted/50 space-y-1">
                    <div className="flex justify-between gap-2"><span className="font-semibold text-sm">{t.colaborador_nome}</span><SeloStatusTroca status={t.status} /></div>
                    <p className="text-xs text-muted-foreground">{t.codigo} · matrícula {t.num_cad} · início {dataBr(t.data_inicio)}</p>
                    <p className="text-xs">{t.posto_atual_descricao ?? '—'} <ArrowRight className="inline h-3 w-3" /> <strong>{t.posto_novo_descricao ?? t.posto_novo_codigo}</strong></p>
                  </button>
                ))}
              </div>
              {/* Tela grande: tabela */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>De → para</TableHead>
                      <TableHead>Início</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lista.map(t => (
                      <TableRow key={t.id} className="cursor-pointer" onClick={() => setAberta(t)}>
                        <TableCell>
                          <p className="font-medium">{t.colaborador_nome}</p>
                          <p className="text-xs text-muted-foreground">{t.codigo} · {t.num_cad}{t.uf ? ` · ${t.uf}` : ''}</p>
                        </TableCell>
                        <TableCell className="text-sm max-w-[360px]">
                          <p className="text-muted-foreground truncate">{nomePosto(t.posto_atual_descricao, t.posto_atual_estrutura, t.posto_atual_codigo)}</p>
                          <p className="font-medium truncate"><ArrowRight className="inline h-3 w-3 mr-1" />{nomePosto(t.posto_novo_descricao, t.posto_novo_estrutura, t.posto_novo_codigo)}</p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{dataBr(t.data_inicio)}</TableCell>
                        <TableCell className="text-sm">{t.motivo}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{t.solicitante_nome ?? '—'}<br />{dataHoraBr(t.created_at)}</TableCell>
                        <TableCell><SeloStatusTroca status={t.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <NovaTrocaDialog aberto={nova} fechar={() => setNova(false)}
        criada={codigo => { toast.success(`Troca ${codigo} enviada para aprovação.`); setStatus('pendente'); carregar(); }} />
      <DetalheTrocaDialog key={aberta?.id ?? 'nenhuma'} troca={aberta} fechar={() => setAberta(null)} mudou={carregar}
        podeAprovar={podeAprovar} podeCriar={podeCriar} meuId={user?.id ?? null} adminSenior={adminSenior} />
    </div>
  );
}
