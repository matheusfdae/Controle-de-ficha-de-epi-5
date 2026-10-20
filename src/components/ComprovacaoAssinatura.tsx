import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { EPIFicha } from '@/types/epi';
import { buscarSelfieAssinatura, SelfieAssinatura } from '@/services/fichaService';

const dataHora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }) : '—';

/**
 * Prova da assinatura (selfie, data/hora, forma, IP), fora da ficha oficial e
 * do PDF. Só admin/RH: a selfie fica numa tabela que só eles leem.
 */
export default function ComprovacaoAssinatura({ ficha }: { ficha: EPIFicha }) {
  const { isAdmin } = useAuth();
  const [selfie, setSelfie] = useState<SelfieAssinatura | null>(null);
  const [carregado, setCarregado] = useState(false);
  const [ampliada, setAmpliada] = useState(false);

  useEffect(() => {
    if (!isAdmin || ficha.status !== 'assinada') return;
    buscarSelfieAssinatura(ficha.id).then(setSelfie).finally(() => setCarregado(true));
  }, [ficha.id, ficha.status, isAdmin]);

  if (!isAdmin || ficha.status !== 'assinada') return null;

  const forma = ficha.ipAssinatura ? 'Pelo link / tablet (sem login)' : 'Presencial, no sistema';
  const linhas: [string, string][] = [
    ['Assinada em', dataHora(ficha.assinadoEm)],
    ['Selfie tirada em', selfie ? dataHora(selfie.tiradaEm) : '—'],
    ['Forma', forma],
    ...(ficha.ipAssinatura ? [['IP', ficha.ipAssinatura] as [string, string]] : []),
    ...(selfie?.colhidaPor ? [['Colhida por', selfie.colhidaPor] as [string, string]] : []),
  ];

  return (
    <Card className="border-sky-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-sky-700" /> Comprovação da assinatura
          <span className="text-xs font-normal text-muted-foreground">· visível só para Admin/RH, não vai na ficha</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-start gap-5">
        {selfie ? (
          <button type="button" onClick={() => setAmpliada(true)} title="Ampliar">
            <img src={selfie.selfie} alt="Selfie do funcionário na assinatura" className="h-32 w-24 rounded-md border object-cover" />
          </button>
        ) : (
          <div className="flex h-32 w-24 items-center justify-center rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground">
            {carregado ? 'Sem selfie (assinada antes da selfie obrigatória)' : 'Carregando…'}
          </div>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {linhas.map(([rotulo, valor]) => (
            <div key={rotulo} className="contents">
              <dt className="text-muted-foreground">{rotulo}</dt>
              <dd className="font-medium">{valor}</dd>
            </div>
          ))}
        </dl>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => baixarComprovante(ficha, selfie, linhas)}>
          <Download className="h-4 w-4 mr-1" /> Baixar comprovante
        </Button>
      </CardContent>
      {selfie && (
        <Dialog open={ampliada} onOpenChange={setAmpliada}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Selfie da assinatura</DialogTitle></DialogHeader>
            <img src={selfie.selfie} alt="Selfie ampliada" className="w-full rounded-md" />
            <p className="text-xs text-muted-foreground">Tirada em {dataHora(selfie.tiradaEm)}</p>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

/** PDF separado com a prova da assinatura (para fiscalização ou ação trabalhista). */
async function baixarComprovante(ficha: EPIFicha, selfie: SelfieAssinatura | null, linhas: [string, string][]) {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Comprovante de assinatura da ficha de EPI/Uniforme', 15, y);
  y += 10;
  doc.setFontSize(10);
  const campo = (rotulo: string, valor: string) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${rotulo}:`, 15, y);
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(valor || '—', 125), 60, y);
    y += 6;
  };
  campo('Ficha', ficha.numero ? `Nº ${ficha.numero}` : ficha.id);
  campo('Colaborador', ficha.nomeFuncionario);
  campo('CPF', ficha.cpf);
  campo('Matrícula', ficha.matricula);
  campo('Empresa', ficha.empresa);
  campo('Estado', ficha.uf);
  campo('Data de entrega', ficha.dataEntrega ? new Date(`${ficha.dataEntrega}T12:00:00`).toLocaleDateString('pt-BR') : '');
  campo('Itens recebidos', ficha.itens.filter(i => i.recebido).map(i => `${i.quantidade}x ${i.descricao}`).join('; '));
  for (const [rotulo, valor] of linhas) campo(rotulo, valor);
  y += 4;
  if (selfie) {
    doc.setFont('helvetica', 'bold');
    doc.text('Selfie tirada logo após a rubrica:', 15, y);
    y += 3;
    try { doc.addImage(selfie.selfie, selfie.selfie.startsWith('data:image/png') ? 'PNG' : 'JPEG', 15, y, 45, 60); } catch { /* imagem inválida */ }
    y += 64;
  }
  if (ficha.assinaturaColaborador) {
    doc.setFont('helvetica', 'bold');
    doc.text('Rubrica do colaborador:', 15, y);
    y += 3;
    try { doc.addImage(ficha.assinaturaColaborador, 'PNG', 15, y, 60, 20); } catch { /* imagem inválida */ }
    y += 24;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} pelo Sistema de Fichas de EPI/Uniforme — Grupo 5 Estrelas.`, 15, 285);
  doc.save(`comprovante-assinatura-ficha-${ficha.numero ?? ficha.id}.pdf`);
}
