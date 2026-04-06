import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Download, Share2, CheckCircle2, Circle } from 'lucide-react';
import { EPIFicha } from '@/types/epi';
import { getFichaById, saveFicha } from '@/services/fichaService';
import { generatePDF } from '@/services/pdfService';
import SignaturePad from '@/components/SignaturePad';
import { toast } from 'sonner';

const motivoLabels: Record<string, string> = {
  admissao: 'Admissão', substituicao: 'Substituição',
  perda_extravio: 'Perda/Extravio', demissao: 'Demissão', complemento: 'Complemento',
};

export default function VisualizarFicha() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ficha, setFicha] = useState<EPIFicha | null>(null);
  const [assinaturaColaborador, setAssinaturaColaborador] = useState('');
  const [assinaturaResponsavel, setAssinaturaResponsavel] = useState('');

  useEffect(() => {
    if (id) {
      const f = getFichaById(id);
      if (f) {
        setFicha(f);
        setAssinaturaColaborador(f.assinaturaColaborador || '');
        setAssinaturaResponsavel(f.assinaturaResponsavel || '');
      }
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

  const handleSign = () => {
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
    saveFicha(updated);
    setFicha(updated);
    toast.success('Ficha assinada com sucesso!');
  };

  const shareLink = () => {
    const url = `${window.location.origin}/assinar/${ficha.id}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copiado para a área de transferência!');
  };

  return (
    <div className="min-h-screen p-4 pb-20">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground">Ficha de EPI</h1>
          </div>
          <Badge variant={isSigned ? 'default' : 'secondary'}
            className={isSigned ? 'bg-success text-success-foreground' : ''}>
            {isSigned ? 'Assinada' : 'Pendente'}
          </Badge>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Dados do Funcionário</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              {[
                ['Nome', ficha.nomeFuncionario],
                ['Função', ficha.funcao],
                ['Telefone', ficha.telefone],
                ['CPF', ficha.cpf],
                ['Matrícula', ficha.matricula],
                ['Motivo', motivoLabels[ficha.motivo] || ficha.motivo],
                ['Turno', ficha.turno === 'diurno' ? 'Diurno' : 'Noturno'],
                ['Setor', ficha.setor],
                ['Empresa', ficha.empresa],
                ['Data de Entrega', ficha.dataEntrega],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd className="font-medium text-foreground">{value || '—'}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Itens de Uniforme/EPI</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {ficha.itens.map(item => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                {item.recebido ? (
                  <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground">{item.descricao}</p>
                  <p className="text-xs text-muted-foreground">
                    CA: {item.ca || '—'} · Qtd: {item.quantidade} · Tam: {item.tamanho || '—'}
                    {item.dataValidade && ` · Val: ${item.dataValidade}`}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{item.recebido ? 'Recebido' : 'Pendente'}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Assinaturas</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            {isSigned && ficha.assinaturaColaborador ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Assinatura do Funcionário</p>
                <img src={ficha.assinaturaColaborador} alt="Assinatura" className="border rounded-lg max-h-32 bg-card" />
              </div>
            ) : !isSigned ? (
              <SignaturePad label="Assinatura do Funcionário" onSave={setAssinaturaColaborador} />
            ) : null}

            {isSigned && ficha.assinaturaResponsavel ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Assinatura do Responsável</p>
                <img src={ficha.assinaturaResponsavel} alt="Assinatura" className="border rounded-lg max-h-32 bg-card" />
              </div>
            ) : !isSigned ? (
              <SignaturePad label="Assinatura do Responsável" onSave={setAssinaturaResponsavel} />
            ) : null}

            {ficha.assinadoEm && (
              <p className="text-xs text-muted-foreground">
                Assinado em: {new Date(ficha.assinadoEm).toLocaleString('pt-BR')}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-3">
          {!isSigned && (
            <>
              <Button variant="outline" className="flex-1" onClick={shareLink}>
                <Share2 className="h-4 w-4 mr-2" /> Copiar Link para Assinatura
              </Button>
              <Button className="flex-1" onClick={handleSign}>
                Assinar e Finalizar
              </Button>
            </>
          )}
          <Button variant={isSigned ? 'default' : 'outline'} className="flex-1" onClick={() => generatePDF(ficha)}>
            <Download className="h-4 w-4 mr-2" /> Baixar PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
