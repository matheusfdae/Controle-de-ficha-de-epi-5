import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Eye, Download, ClipboardList, MessageCircle, Upload, FileSpreadsheet, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { EPIFicha } from '@/types/epi';
import { getFichas, deleteFicha } from '@/services/fichaService';
import { generatePDF } from '@/services/pdfService';
import { useAuth } from '@/contexts/AuthContext';
import { importFichasFromExcel, downloadTemplateExcel } from '@/services/importFichasService';
import BackButton from '@/components/BackButton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function ConsultarFichas() {
  const { isAdmin } = useAuth();
  const [fichas, setFichas] = useState<EPIFicha[]>([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = () => getFichas().then(setFichas);

  useEffect(() => {
    reload();
  }, []);

  const handleFiles = async (files: FileList) => {
    setImporting(true);
    const list = Array.from(files);
    const tid = toast.loading(`Importando ${list.length} arquivo(s)...`);
    let totalOk = 0;
    let totalErr = 0;
    const falhas: string[] = [];
    try {
      for (const file of list) {
        try {
          const r = await importFichasFromExcel(file);
          totalOk += r.sucesso;
          totalErr += r.erros.length;
          if (r.erros.length) falhas.push(`${file.name}: ${r.erros.length} erro(s)`);
        } catch (err: any) {
          totalErr++;
          falhas.push(`${file.name}: ${err.message || 'falha'}`);
        }
      }
      toast.dismiss(tid);
      if (totalOk > 0) toast.success(`${totalOk} ficha(s) importada(s) de ${list.length} arquivo(s)`);
      if (totalErr > 0) toast.error(`${totalErr} erro(s). ${falhas[0] || ''}`);
      reload();
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-4xl mx-auto space-y-6">
        <BackButton />
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Consultar Fichas</h2>
            <p className="text-sm text-muted-foreground">Todas as fichas de EPI cadastradas no sistema.</p>
          </div>
          {isAdmin && (
            <div className="flex gap-2 flex-wrap">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                multiple
                className="hidden"
                onChange={(e) => e.target.files?.length && handleFiles(e.target.files)}
              />
              <Button size="sm" variant="outline" onClick={() => downloadTemplateExcel()}>
                <FileSpreadsheet className="h-4 w-4 mr-1" /> Modelo Excel
              </Button>
              <Button size="sm" variant="outline" disabled={importing} onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1" /> {importing ? 'Importando...' : 'Importar Excel (lote)'}
              </Button>
              <Link to="/nova-ficha"><Button size="sm">Nova Ficha</Button></Link>
            </div>
          )}
        </div>

        {fichas.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground">Nenhuma ficha encontrada.</p>
            {isAdmin && <Link to="/nova-ficha"><Button>Criar Nova Ficha</Button></Link>}
          </div>
        ) : (
          <div className="space-y-3">
            {fichas.map(ficha => (
              <Card key={ficha.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="flex items-center justify-between p-4 gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">{ficha.nomeFuncionario}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(ficha.criadoEm).toLocaleDateString('pt-BR')} · {ficha.itens.filter(i => i.recebido).length} itens
                    </p>
                  </div>
                  <Badge variant={ficha.status === 'assinada' ? 'default' : 'secondary'}
                    className={ficha.status === 'assinada' ? 'bg-success text-success-foreground' : ''}>
                    {ficha.status === 'assinada' ? 'Assinada' : 'Pendente'}
                  </Badge>
                  <div className="flex gap-1 shrink-0">
                    <Link to={`/ficha/${ficha.id}`}>
                      <Button variant="ghost" size="icon" title="Visualizar"><Eye className="h-4 w-4" /></Button>
                    </Link>
                    <Button variant="ghost" size="icon" title="Baixar PDF" onClick={() => generatePDF(ficha)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    {ficha.status !== 'assinada' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Enviar link de assinatura via WhatsApp"
                        onClick={() => {
                          const tel = (ficha.telefone || '').replace(/\D/g, '');
                          if (!tel) { toast.error('Telefone do colaborador não cadastrado'); return; }
                          const numero = tel.startsWith('55') ? tel : `55${tel}`;
                          const url = `${window.location.origin}/assinar/${ficha.id}`;
                          const msg = encodeURIComponent(`Olá ${ficha.nomeFuncionario}, segue o link para assinatura da sua ficha de EPI/Uniforme: ${url}`);
                          window.open(`https://wa.me/${numero}?text=${msg}`, '_blank');
                        }}
                      >
                        <MessageCircle className="h-4 w-4 text-success" />
                      </Button>
                    )}
                    {isAdmin && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" title="Excluir ficha">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir ficha?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. A ficha de <strong>{ficha.nomeFuncionario}</strong> e seus itens serão removidos permanentemente. O estoque dos itens será devolvido automaticamente.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={async () => {
                                try {
                                  await deleteFicha(ficha.id);
                                  toast.success('Ficha excluída com sucesso!');
                                  reload();
                                } catch (e: any) {
                                  toast.error(e.message || 'Erro ao excluir ficha');
                                }
                              }}
                            >Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
