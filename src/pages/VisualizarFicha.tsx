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
        </div>

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
