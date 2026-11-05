import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tablet, Link2, CheckCircle2, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import SignaturePad from '@/components/SignaturePad';
import BackButton from '@/components/BackButton';
import { useConfirm } from '@/hooks/use-confirm';
import { pdfTermoEntregaEpi } from '@/lib/termoEpiPdf';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TermoOficialView from '@/components/TermoOficialView';
import { assinarItemColetivo, finalizarTermo, getTermoColetivoFull, gerarTokenTermoItem, TermoColetivoFull } from '@/services/termoColetivoService';

export default function TermoColetivoView() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<TermoColetivoFull | null>(null);
  const [signing, setSigning] = useState<string | null>(null); // item id
  const [pad, setPad] = useState('');
  const [sequencial, setSequencial] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();

  const load = async () => {
    if (!id) return;
    const d = await getTermoColetivoFull(id);
    setData(d);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const pendentes = useMemo(
    () => (data?.itens ?? []).filter(i => !i.data_assinatura),
    [data]
  );

  const startTablet = () => {
    if (pendentes.length === 0) return toast.info('Nada pendente para assinar');
    setSequencial(true);
    setSigning(pendentes[0].id!);
    setPad('');
  };

  const confirmar = async () => {
    if (!signing || !pad) return toast.error('Assine antes de confirmar');
    const r = await assinarItemColetivo(signing, pad);
    if (!r.ok) return toast.error(r.error ?? 'Erro ao salvar');
    toast.success('Assinatura registrada');
    await load();
    if (sequencial) {
      const novosPend = (data?.itens ?? []).filter(i => !i.data_assinatura && i.id !== signing);
      if (novosPend.length > 0) {
        setSigning(novosPend[0].id!);
        setPad('');
      } else {
        setSigning(null);
        setSequencial(false);
      }
    } else {
      setSigning(null);
    }
  };

  const copyLink = async (itemId: string) => {
    const token = await gerarTokenTermoItem(itemId);
    if (!token) { toast.error('Erro ao gerar link'); return; }
    const url = `${window.location.origin}/assinar-termo-coletivo/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copiado');
  };

  const finalizar = async () => {
    if (!id) return;
    if (pendentes.length > 0 && !(await confirm('Ainda há assinaturas pendentes. Finalizar mesmo assim?'))) return;
    try { await finalizarTermo(id); } catch (e) { return toast.error((e as Error).message); }
    toast.success('Termo finalizado');
    load();
  };

  if (!data) return <p className="p-6 text-sm">Carregando…</p>;
  const { termo, itens } = data;
  const itemAtivo = itens.find(i => i.id === signing);

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <BackButton />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => pdfTermoEntregaEpi({
              posto: termo.posto, mes_referencia: termo.mes_referencia, lider: termo.lider ?? null,
              linhas: itens.map(i => ({ colaborador_nome: i.colaborador_nome, material: i.material, ca: i.ca ?? null, quantidade: i.quantidade,
                assinatura_url: i.assinatura_url ?? null, data_assinatura: i.data_assinatura ?? null })),
            }).catch(e => toast.error((e as Error).message))}><FileDown className="h-4 w-4 mr-1" /> Baixar PDF</Button>
            <Button variant="outline" onClick={startTablet} disabled={pendentes.length === 0}><Tablet className="h-4 w-4 mr-1" /> Assinar no tablet ({pendentes.length})</Button>
            <Button variant="default" onClick={finalizar} disabled={termo.status === 'finalizado'}>Finalizar</Button>
          </div>
        </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            Termo Coletivo — {termo.posto}
            <Badge variant={termo.status === 'finalizado' ? 'default' : 'secondary'}>
              {termo.status === 'finalizado' ? 'Finalizado' : 'Em assinatura'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-4 gap-2 text-sm">
          <div><span className="text-muted-foreground">MÊS:</span> {termo.mes_referencia}</div>
          <div><span className="text-muted-foreground">LÍDER:</span> {termo.lider || '—'}</div>
          <div><span className="text-muted-foreground">Empresa:</span> {termo.empresa || '—'}</div>
          <div><span className="text-muted-foreground">Pendentes:</span> {pendentes.length}/{itens.length}</div>
        </CardContent>
      </Card>

      <Tabs defaultValue="termo">
        <TabsList>
          <TabsTrigger value="termo">Visualizar termo</TabsTrigger>
          <TabsTrigger value="linhas">Linhas e assinaturas</TabsTrigger>
        </TabsList>
        <TabsContent value="termo"><TermoOficialView termo={termo} itens={itens} /></TabsContent>
        <TabsContent value="linhas">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Linhas</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground border-b">
              <tr className="text-left">
                <th className="p-2">#</th>
                <th className="p-2">Colaborador</th>
                <th className="p-2">CPF</th>
                <th className="p-2">Material</th>
                <th className="p-2">CA</th>
                <th className="p-2">Tam</th>
                <th className="p-2">Qtd</th>
                <th className="p-2">Assinatura</th>
                <th className="p-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((it, idx) => (
                <tr key={it.id} className="border-b hover:bg-muted/30">
                  <td className="p-2">{idx + 1}</td>
                  <td className="p-2">{it.colaborador_nome}</td>
                  <td className="p-2">{it.colaborador_cpf || '—'}</td>
                  <td className="p-2">{it.material}</td>
                  <td className="p-2">{it.ca || '—'}</td>
                  <td className="p-2">{it.tamanho || '—'}</td>
                  <td className="p-2">{it.quantidade}</td>
                  <td className="p-2">
                    {it.assinatura_url ? (
                      <img src={it.assinatura_url} alt="assinatura" className="h-8 inline-block bg-white border rounded" />
                    ) : <span className="text-muted-foreground">pendente</span>}
                  </td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      {!it.assinatura_url && (
                        <Button variant="outline" size="sm" onClick={() => { setSequencial(false); setSigning(it.id!); setPad(''); }}>
                          <CheckCircle2 className="h-3 w-3 mr-1" />Assinar
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => copyLink(it.id!)} title="Copiar link público">
                        <Link2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!signing} onOpenChange={open => { if (!open) { setSigning(null); setSequencial(false); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {itemAtivo ? `Assinatura: ${itemAtivo.colaborador_nome} — ${itemAtivo.material}` : 'Assinar'}
            </DialogTitle>
          </DialogHeader>
          {itemAtivo && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Declaro ter recebido o EPI descrito acima em perfeito estado de conservação,
                comprometendo-me com seu uso correto conforme NR-06.
              </p>
              <SignaturePad label="Assinatura do colaborador" onSave={setPad} />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setSigning(null); setSequencial(false); }}>Cancelar</Button>
                <Button onClick={confirmar}>Confirmar e {sequencial ? 'próximo' : 'fechar'}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
      <ConfirmDialog />
    </div>
  );
}
