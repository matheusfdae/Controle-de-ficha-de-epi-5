import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Download, Copy, MessageCircle, Mail, CheckCircle2, Pencil, Plus, Trash2, Save, X } from 'lucide-react';
import { EPIFicha, EPIItem } from '@/types/epi';
import { getFichaById, saveFicha, generateId } from '@/services/fichaService';
import { generatePDF } from '@/services/pdfService';
import SignaturePad from '@/components/SignaturePad';
import { useAuth } from '@/contexts/AuthContext';
import FichaOficialView from '@/components/FichaOficialView';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import BackButton from '@/components/BackButton';
import { listEpis, EPI } from '@/services/estoqueService';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function VisualizarFicha() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [ficha, setFicha] = useState<EPIFicha | null>(null);
  const [assinaturaColaborador, setAssinaturaColaborador] = useState('');
  const [assinaturaResponsavel, setAssinaturaResponsavel] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EPIFicha | null>(null);
  const [epis, setEpis] = useState<EPI[]>([]);

  useEffect(() => {
    if (id) {
      getFichaById(id).then(f => {
        if (f) {
          setFicha(f);
          setAssinaturaColaborador(f.assinaturaColaborador || '');
          setAssinaturaResponsavel(f.assinaturaResponsavel || '');
        }
      });
    }
    listEpis().then(setEpis).catch(() => {});
  }, [id]);

  if (!ficha) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Ficha não encontrada.</p>
          <Link to="/"><Button variant="outline">Voltar</Button></Link>
        </div>
      </div>
    );
  }

  const isSigned = ficha.status === 'assinada';

  const handleSign = async () => {
    if (!assinaturaColaborador || !assinaturaResponsavel) {
      toast.error('É necessário ambas as assinaturas');
      return;
    }
    const updated: EPIFicha = {
      ...ficha,
      assinaturaColaborador,
      assinaturaResponsavel,
      status: 'assinada',
      assinadoEm: new Date().toISOString(),
    };
    try {
      await saveFicha(updated);
      setFicha(updated);
      toast.success('Ficha assinada com sucesso!');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    }
  };

  const shareLink = () => {
    const url = `${window.location.origin}/assinar/${ficha.id}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copiado para a área de transferência!');
  };

  const shareUrl = `${window.location.origin}/assinar/${ficha.id}`;
  const shareMessage = `Olá ${ficha.nomeFuncionario}, segue o link para assinatura da sua ficha de EPI: ${shareUrl}`;

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    toast.success('Link copiado!');
  };
  const sendWhatsApp = () => {
    const phone = (ficha.telefone || '').replace(/\D/g, '');
    const url = phone
      ? `https://wa.me/55${phone}?text=${encodeURIComponent(shareMessage)}`
      : `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
    window.open(url, '_blank');
  };
  const sendEmail = () => {
    const subject = encodeURIComponent('Assinatura de Ficha de EPI');
    const body = encodeURIComponent(shareMessage);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-4">
        <BackButton />
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Ficha de EPI</h2>
            <p className="text-sm text-muted-foreground">{ficha.nomeFuncionario} · {new Date(ficha.criadoEm).toLocaleDateString('pt-BR')}</p>
          </div>
          <Badge variant={isSigned ? 'default' : 'secondary'}
            className={isSigned ? 'bg-success text-success-foreground' : ''}>
            {isSigned ? 'Assinada' : 'Pendente'}
          </Badge>
        </div>

        {/* Ações */}
        <div className="flex flex-wrap gap-2">
          {!isSigned && isAdmin && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <MessageCircle className="h-4 w-4 mr-2" /> Enviar Link de Assinatura
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Enviar para assinatura remota</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Link público</Label>
                    <Input readOnly value={shareUrl} onClick={(e) => e.currentTarget.select()} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    O colaborador abre o link, marca os itens recebidos e assina diretamente do celular.
                  </p>
                </div>
                <DialogFooter className="flex-wrap gap-2 sm:flex-row">
                  <Button variant="outline" onClick={copyLink}>
                    <Copy className="h-4 w-4 mr-2" /> Copiar
                  </Button>
                  <Button variant="outline" onClick={sendEmail}>
                    <Mail className="h-4 w-4 mr-2" /> Email
                  </Button>
                  <Button onClick={sendWhatsApp} className="bg-[#25D366] hover:bg-[#20bd5a] text-white">
                    <MessageCircle className="h-4 w-4 mr-2" /> WhatsApp
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          <Button variant={isSigned ? 'default' : 'outline'} onClick={() => generatePDF(ficha)}>
            <Download className="h-4 w-4 mr-2" /> Baixar PDF
          </Button>
          {isAdmin && !editing && (
            <Button variant="outline" onClick={() => { setDraft(JSON.parse(JSON.stringify(ficha))); setEditing(true); }}>
              <Pencil className="h-4 w-4 mr-2" /> Editar Ficha
            </Button>
          )}
        </div>

        {/* Painel de edição */}
        {editing && draft && (
          <Card className="border-primary">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Editar Ficha</CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setDraft(null); }}>
                  <X className="h-4 w-4 mr-1" /> Cancelar
                </Button>
                <Button size="sm" onClick={async () => {
                  try {
                    await saveFicha(draft);
                    setFicha(draft);
                    setEditing(false);
                    setDraft(null);
                    toast.success('Ficha atualizada!');
                  } catch (e: any) {
                    toast.error(e.message || 'Erro ao salvar');
                  }
                }}>
                  <Save className="h-4 w-4 mr-1" /> Salvar Alterações
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>Nome</Label><Input value={draft.nomeFuncionario} onChange={e => setDraft({ ...draft, nomeFuncionario: e.target.value })} /></div>
                <div><Label>Função</Label><Input value={draft.funcao} onChange={e => setDraft({ ...draft, funcao: e.target.value })} /></div>
                <div><Label>CPF</Label><Input value={draft.cpf} onChange={e => setDraft({ ...draft, cpf: e.target.value })} /></div>
                <div><Label>Matrícula</Label><Input value={draft.matricula} onChange={e => setDraft({ ...draft, matricula: e.target.value })} /></div>
                <div><Label>Telefone</Label><Input value={draft.telefone} onChange={e => setDraft({ ...draft, telefone: e.target.value })} /></div>
                <div><Label>Posto</Label><Input value={draft.posto} onChange={e => setDraft({ ...draft, posto: e.target.value })} /></div>
                <div><Label>Empresa</Label>
                  <Select value={draft.empresa} onValueChange={v => setDraft({ ...draft, empresa: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MATRIZ">MATRIZ</SelectItem>
                      <SelectItem value="APOIO">APOIO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Data de Entrega</Label><Input type="date" value={draft.dataEntrega} onChange={e => setDraft({ ...draft, dataEntrega: e.target.value })} /></div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Itens</Label>
                  <Button variant="outline" size="sm" onClick={() => setDraft({
                    ...draft,
                    itens: [...draft.itens, { id: generateId(), descricao: '', ca: '', quantidade: 1, tamanho: '', dataEntrega: draft.dataEntrega, postoServico: draft.posto || '', recebido: true } as EPIItem],
                  })}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
                </div>
                {draft.itens.map((it, idx) => (
                  <div key={it.id} className="grid gap-2 sm:grid-cols-6 p-2 rounded border bg-muted/30">
                    <div className="sm:col-span-2">
                      {epis.length > 0 ? (
                        <Select
                          value={it.epiId || '__manual__'}
                          onValueChange={(v) => {
                            const arr = [...draft.itens];
                            if (v === '__manual__') { arr[idx] = { ...arr[idx], epiId: undefined }; }
                            else {
                              const epi = epis.find(e => e.id === v);
                              if (epi) arr[idx] = { ...arr[idx], epiId: epi.id, descricao: epi.nome, ca: epi.ca_numero || '' };
                            }
                            setDraft({ ...draft, itens: arr });
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Item do catálogo" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__manual__">— Manual —</SelectItem>
                            {epis.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}{e.ca_numero ? ` (CA ${e.ca_numero})` : ''}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : null}
                      {(!it.epiId || epis.length === 0) && (
                        <Input className={epis.length > 0 ? 'mt-2' : ''} placeholder="Descrição" value={it.descricao} onChange={e => {
                          const arr = [...draft.itens]; arr[idx] = { ...arr[idx], descricao: e.target.value }; setDraft({ ...draft, itens: arr });
                        }} />
                      )}
                    </div>
                    <Input placeholder="C.A." value={it.ca} onChange={e => { const arr = [...draft.itens]; arr[idx] = { ...arr[idx], ca: e.target.value }; setDraft({ ...draft, itens: arr }); }} />
                    <Input placeholder="Qtd" type="number" min={1} value={it.quantidade} onChange={e => { const arr = [...draft.itens]; arr[idx] = { ...arr[idx], quantidade: parseInt(e.target.value) || 1 }; setDraft({ ...draft, itens: arr }); }} />
                    <Input placeholder="Tam." value={it.tamanho} onChange={e => { const arr = [...draft.itens]; arr[idx] = { ...arr[idx], tamanho: e.target.value }; setDraft({ ...draft, itens: arr }); }} />
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDraft({ ...draft, itens: draft.itens.filter(x => x.id !== it.id) })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ficha oficial */}
        <FichaOficialView ficha={ficha} />

        {/* Assinatura presencial (admin) */}
        {!isSigned && isAdmin && (
          <Card>
            <CardHeader><CardTitle className="text-base">Assinatura presencial</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <SignaturePad label="Assinatura do Funcionário" onSave={setAssinaturaColaborador} initialValue={assinaturaColaborador} />
              <SignaturePad label="Assinatura do Responsável (Empresa)" onSave={setAssinaturaResponsavel} initialValue={assinaturaResponsavel} />
              <Button className="w-full" onClick={handleSign}>
                <CheckCircle2 className="h-4 w-4 mr-2" /> Assinar e Finalizar
              </Button>
            </CardContent>
          </Card>
        )}

        {ficha.assinadoEm && (
          <p className="text-xs text-muted-foreground text-center">
            Assinado em: {new Date(ficha.assinadoEm).toLocaleString('pt-BR')}
          </p>
        )}
      </div>
    </div>
  );
}
