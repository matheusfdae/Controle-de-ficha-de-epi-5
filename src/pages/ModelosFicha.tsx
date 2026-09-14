import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Plus, FileStack, Save, Star, Trash2, ImageIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';
import { useConfirm } from '@/hooks/use-confirm';
import {
  ModeloFicha, LayoutCabecalho, ColunaExtra,
  listModelos, upsertModelo, deleteModelo, setModeloPadrao,
} from '@/services/modelosFichaService';

const EMPTY_FORM: Omit<ModeloFicha, 'id' | 'padrao'> = {
  nome: '',
  ativo: true,
  tituloDocumento: "TERMO DE RECEBIMENTO DE UNIFORME/EPI's - REV -00",
  textoTermoResponsabilidade: '',
  textoDeclaracao: '',
  layoutCabecalho: 'completo',
  colunaExtra: 'tamanho',
  mostrarSegundoLogo: false,
  textoSecaoExtra: '',
  logoDataUrl: null,
};

export default function ModelosFicha() {
  const [modelos, setModelos] = useState<ModeloFicha[]>([]);
  const [editing, setEditing] = useState<ModeloFicha | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const { confirm, ConfirmDialog } = useConfirm();

  const load = async () => {
    try { setModelos(await listModelos()); }
    catch (err: any) { toast.error(err.message); }
  };
  useEffect(() => { load(); }, []);

  const openEdit = (m: ModeloFicha) => {
    setEditing(m);
    setForm({
      nome: m.nome,
      ativo: m.ativo,
      tituloDocumento: m.tituloDocumento,
      textoTermoResponsabilidade: m.textoTermoResponsabilidade,
      textoDeclaracao: m.textoDeclaracao,
      layoutCabecalho: m.layoutCabecalho,
      colunaExtra: m.colunaExtra,
      mostrarSegundoLogo: m.mostrarSegundoLogo,
      textoSecaoExtra: m.textoSecaoExtra ?? '',
      logoDataUrl: m.logoDataUrl,
    });
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setCreating(true);
  };

  const closeDialog = () => { setEditing(null); setCreating(false); };

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error('Informe o nome do modelo'); return; }
    if (!form.textoTermoResponsabilidade.trim() || !form.textoDeclaracao.trim()) {
      toast.error('Preencha o texto do termo e da declaração'); return;
    }
    try {
      await upsertModelo({ id: editing?.id, ...form });
      toast.success(editing ? 'Modelo atualizado' : 'Modelo criado');
      closeDialog();
      load();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleSetPadrao = async () => {
    if (!editing) return;
    try {
      await setModeloPadrao(editing.id);
      toast.success(`"${editing.nome}" agora é o modelo padrão`);
      closeDialog();
      load();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async () => {
    if (!editing) return;
    if (editing.padrao) {
      toast.error('Marque outro modelo como padrão antes de excluir este.');
      return;
    }
    if (!(await confirm(`Excluir o modelo "${editing.nome}"? Fichas que usam esse modelo passarão a usar o padrão.`))) return;
    try {
      await deleteModelo(editing.id);
      toast.success('Modelo excluído');
      closeDialog();
      load();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) { toast.error('Imagem muito grande (máx 1MB)'); return; }
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, logoDataUrl: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const dialogOpen = creating || !!editing;

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-6">
        <BackButton />
        <PageHeader
          eyebrow="Layout do documento"
          title="Modelos de Ficha"
          description="Cada modelo define o layout do PDF gerado (título, textos, colunas e logos). A ficha nova permite escolher qual modelo usar."
          actions={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Novo modelo</Button>}
        />

        <div className="grid gap-4 md:grid-cols-2">
          {modelos.map(m => (
            <Card key={m.id} className="hover:border-primary/50 cursor-pointer transition-colors"
                  onClick={() => openEdit(m)}>
              <CardContent className="p-5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileStack className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-lg">{m.nome}</h3>
                    {m.padrao && <Badge>Padrão</Badge>}
                    {!m.ativo && <Badge variant="outline">Inativo</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{m.tituloDocumento}</p>
                </div>
              </CardContent>
            </Card>
          ))}
          {modelos.length === 0 && (
            <p className="text-center text-muted-foreground py-12 col-span-full">Nenhum modelo cadastrado.</p>
          )}
        </div>

        <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? `Editar "${editing.nome}"` : 'Novo Modelo'}</DialogTitle></DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="modelo-nome">Nome *</Label>
                <Input id="modelo-nome" value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex.: Padrão, SS Serviços..." />
              </div>

              <div>
                <Label>Logo do modelo (opcional)</Label>
                <p className="text-xs text-muted-foreground mb-1">
                  Se vazio, usa a logo padrão do sistema (Configurações). Útil quando esse modelo é de uma empresa diferente.
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-16 border rounded-md flex items-center justify-center bg-muted/30 shrink-0">
                    {form.logoDataUrl ? (
                      <img src={form.logoDataUrl} alt="Logo do modelo" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('modelo-logo-input')?.click()}>
                      Enviar imagem
                    </Button>
                    {form.logoDataUrl && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setForm(f => ({ ...f, logoDataUrl: null }))}>
                        <X className="h-4 w-4 mr-1" /> Remover
                      </Button>
                    )}
                  </div>
                  <input id="modelo-logo-input" type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </div>
              </div>

              <div>
                <Label htmlFor="modelo-titulo">Título do documento *</Label>
                <Input id="modelo-titulo" value={form.tituloDocumento}
                  onChange={e => setForm(f => ({ ...f, tituloDocumento: e.target.value }))} />
              </div>

              <div>
                <Label htmlFor="modelo-termo">Texto do termo de responsabilidade *</Label>
                <Textarea id="modelo-termo" rows={5} value={form.textoTermoResponsabilidade}
                  onChange={e => setForm(f => ({ ...f, textoTermoResponsabilidade: e.target.value }))} />
              </div>

              <div>
                <Label htmlFor="modelo-declaracao">Texto da declaração de experimentação *</Label>
                <Textarea id="modelo-declaracao" rows={3} value={form.textoDeclaracao}
                  onChange={e => setForm(f => ({ ...f, textoDeclaracao: e.target.value }))} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Layout do cabeçalho</Label>
                  <Select value={form.layoutCabecalho}
                    onValueChange={(v: LayoutCabecalho) => setForm(f => ({ ...f, layoutCabecalho: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="completo">Completo (nome do funcionário, função, fone)</SelectItem>
                      <SelectItem value="compacto">Compacto (nome completo, cargo, celular, siglas A/S/D/P/C)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Coluna extra da tabela</Label>
                  <Select value={form.colunaExtra}
                    onValueChange={(v: ColunaExtra) => setForm(f => ({ ...f, colunaExtra: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tamanho">Tamanho / Nº</SelectItem>
                      <SelectItem value="ca">C.A.</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox id="modelo-logo2" checked={form.mostrarSegundoLogo}
                  onCheckedChange={(v) => setForm(f => ({ ...f, mostrarSegundoLogo: !!v }))} />
                <Label htmlFor="modelo-logo2" className="cursor-pointer">Mostrar logo também do lado direito do cabeçalho</Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox id="modelo-ativo" checked={form.ativo}
                  onCheckedChange={(v) => setForm(f => ({ ...f, ativo: !!v }))} />
                <Label htmlFor="modelo-ativo" className="cursor-pointer">Ativo (aparece pra escolher na Nova Ficha)</Label>
              </div>

              <div>
                <Label htmlFor="modelo-extra">Texto da seção extra (opcional)</Label>
                <p className="text-xs text-muted-foreground mb-1">
                  Se preenchido, adiciona um bloco no fim do documento com esse texto e 3 linhas de assinatura em branco.
                </p>
                <Textarea id="modelo-extra" rows={2} value={form.textoSecaoExtra ?? ''}
                  onChange={e => setForm(f => ({ ...f, textoSecaoExtra: e.target.value }))}
                  placeholder="Deixe em branco pra não mostrar esse bloco" />
              </div>
            </div>

            <DialogFooter className="flex justify-between sm:justify-between flex-wrap gap-2">
              <div className="flex gap-2">
                {editing && (
                  <>
                    <Button variant="destructive" onClick={handleDelete}>
                      <Trash2 className="h-4 w-4 mr-1" /> Excluir
                    </Button>
                    {!editing.padrao && (
                      <Button variant="outline" onClick={handleSetPadrao}>
                        <Star className="h-4 w-4 mr-1" /> Definir como padrão
                      </Button>
                    )}
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
                <Button onClick={handleSave}><Save className="h-4 w-4 mr-1" /> Salvar</Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <ConfirmDialog />
    </div>
  );
}
