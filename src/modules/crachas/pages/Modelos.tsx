import { obterUsuarioAtual } from '@/modules/crachas/lib/usuario';
import { useState, useRef } from 'react';
import { MainLayout } from '@/modules/crachas/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit, Copy, Trash2, CreditCard, Loader2, Upload, LayoutTemplate } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import template5estrelas from '@/modules/crachas/assets/template-5estrelas.png';
import { DEFAULT_TEMPLATES, DefaultTemplate } from '@/modules/crachas/lib/defaultTemplates';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface BadgeTemplate {
  id: string;
  name: string;
  description: string | null;
  width_mm: number;
  height_mm: number;
  background_image_url: string | null;
  created_at: string;
  updated_at: string;
}

const Modelos = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showNewTemplateDialog, setShowNewTemplateDialog] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    description: '',
    width_mm: 85,
    height_mm: 54,
  });
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingPreset, setIsCreatingPreset] = useState(false);

  // Fetch templates from database
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['cracha_badge_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cracha_badge_templates')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as BadgeTemplate[];
    },
  });

  // Create template mutation
  const createMutation = useMutation({
    mutationFn: async (template: typeof newTemplate & { imageUrl?: string }) => {
      const { data: { user } } = await obterUsuarioAtual();
      if (!user) throw new Error('Não autenticado');

      const { data, error } = await supabase
        .from('cracha_badge_templates')
        .insert({
          user_id: user.id,
          name: template.name,
          description: template.description || null,
          width_mm: template.width_mm,
          height_mm: template.height_mm,
          background_image_url: template.imageUrl || null,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cracha_badge_templates'] });
      toast.success('Modelo criado com sucesso!');
      setShowNewTemplateDialog(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error('Erro ao criar modelo: ' + error.message);
    },
  });

  // Duplicate template mutation
  const duplicateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const template = templates.find(t => t.id === templateId);
      if (!template) throw new Error('Modelo não encontrado');

      const { data: { user } } = await obterUsuarioAtual();
      if (!user) throw new Error('Não autenticado');

      const { data, error } = await supabase
        .from('cracha_badge_templates')
        .insert({
          user_id: user.id,
          name: `${template.name} (cópia)`,
          description: template.description,
          width_mm: template.width_mm,
          height_mm: template.height_mm,
          background_image_url: template.background_image_url,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cracha_badge_templates'] });
      toast.success('Modelo duplicado com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao duplicar: ' + error.message);
    },
  });

  // Delete template mutation
  const deleteMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase
        .from('cracha_badge_templates')
        .delete()
        .eq('id', templateId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cracha_badge_templates'] });
      toast.success('Modelo excluído com sucesso!');
      setDeleteConfirmId(null);
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir: ' + error.message);
    },
  });

  const resetForm = () => {
    setNewTemplate({ name: '', description: '', width_mm: 85, height_mm: 54 });
    setUploadedFile(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Arquivo muito grande. Máximo: 5MB');
        return;
      }
      setUploadedFile(file);
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplate.name.trim()) {
      toast.error('Nome do modelo é obrigatório');
      return;
    }

    setIsCreating(true);
    try {
      let imageUrl: string | undefined;

      if (uploadedFile) {
        const { data: { user } } = await obterUsuarioAtual();
        if (!user) throw new Error('Não autenticado');

        const fileExt = uploadedFile.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('cracha-assets')
          .upload(fileName, uploadedFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('cracha-assets')
          .getPublicUrl(fileName);

        imageUrl = urlData.publicUrl;
      }

      await createMutation.mutateAsync({ ...newTemplate, imageUrl });
    } catch (error: any) {
      toast.error('Erro ao criar modelo: ' + error.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateFromPreset = async (preset: DefaultTemplate) => {
    setIsCreatingPreset(true);
    try {
      const { data: { user } } = await obterUsuarioAtual();
      if (!user) throw new Error('Não autenticado');

      // Create the template
      const { data: templateData, error: templateError } = await supabase
        .from('cracha_badge_templates')
        .insert({
          user_id: user.id,
          name: preset.name,
          description: preset.description,
          width_mm: preset.width_mm,
          height_mm: preset.height_mm,
          background_color: preset.backgroundColor,
          background_image_url: preset.backgroundImageUrl || null,
          back_background_image_url: preset.backBackgroundImageUrl || null,
          has_back_side: preset.hasBackSide,
        })
        .select()
        .single();

      if (templateError) throw templateError;

      // Insert all elements
      if (preset.elements.length > 0) {
        const { error: elemError } = await supabase
          .from('cracha_template_elements')
          .insert(preset.elements.map((el, idx) => ({
            template_id: templateData.id,
            element_type: el.type,
            x_position: el.x,
            y_position: el.y,
            width: el.width,
            height: el.height,
            field_binding: el.fieldBinding || null,
            static_value: el.staticValue || null,
            font_family: el.fontFamily || 'Inter',
            font_size: el.fontSize || 10,
            font_weight: el.fontWeight || 'normal',
            font_color: el.fontColor || '#1e3a5f',
            text_align: el.textAlign || 'left',
            background_color: el.backgroundColor || null,
            border_color: el.borderColor || null,
            border_width: el.borderWidth || 0,
            border_radius: el.borderRadius || 0,
            name_display_mode: el.nameDisplayMode || 'short',
            z_index: el.zIndex,
            side: el.side,
          })));
        if (elemError) throw elemError;
      }

      queryClient.invalidateQueries({ queryKey: ['cracha_badge_templates'] });
      toast.success('Modelo criado com sucesso! Clique em Editar para personalizar.');
      navigate(`/crachas/modelos/${templateData.id}`);
    } catch (error: any) {
      toast.error('Erro ao criar modelo: ' + error.message);
    } finally {
      setIsCreatingPreset(false);
    }
  };

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Modelos de Crachá</h1>
          <p className="text-muted-foreground mt-1">
            Crie e gerencie os modelos de layout para os crachás
          </p>
        </div>
        <Button className="gap-2" onClick={() => navigate('/crachas/modelos/novo')} data-guia="btn-crachas-novo-modelo">
          <Plus className="h-4 w-4" />
          Novo Modelo
        </Button>
        <Dialog open={showNewTemplateDialog} onOpenChange={setShowNewTemplateDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Criar Novo Modelo</DialogTitle>
              <DialogDescription>
                Configure as propriedades básicas do modelo de crachá
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome do Modelo *</Label>
                <Input 
                  id="nome" 
                  placeholder="Ex: Crachá Funcionário Padrão"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea 
                  id="descricao" 
                  placeholder="Descreva o uso deste modelo..."
                  value={newTemplate.description}
                  onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="largura">Largura (mm)</Label>
                  <Input 
                    id="largura" 
                    type="number" 
                    value={newTemplate.width_mm}
                    onChange={(e) => setNewTemplate({ ...newTemplate, width_mm: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="altura">Altura (mm)</Label>
                  <Input 
                    id="altura" 
                    type="number" 
                    value={newTemplate.height_mm}
                    onChange={(e) => setNewTemplate({ ...newTemplate, height_mm: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Upload do Layout Base (opcional)</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div 
                  className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadedFile ? (
                    <div className="flex items-center justify-center gap-2">
                      <Upload className="h-5 w-5 text-primary" />
                      <span className="text-sm text-foreground">{uploadedFile.name}</span>
                    </div>
                  ) : (
                    <>
                      <CreditCard className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Arraste uma imagem ou clique para selecionar
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        PNG, JPG ou PDF (máx. 5MB)
                      </p>
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={() => {
                    setShowNewTemplateDialog(false);
                    resetForm();
                  }}
                >
                  Cancelar
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleCreateTemplate}
                  disabled={isCreating}
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    'Criar Modelo'
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Preset Templates - Always visible */}
      {!isLoading && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-1">Comece um Novo Crachá</h2>
          <p className="text-sm text-muted-foreground mb-4">Crie do zero ou use um modelo pré-configurado</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {/* Blank Canvas Card */}
            <Card 
              className="group hover:shadow-lg transition-all border-dashed border-2 border-primary/30 bg-gradient-to-br from-background to-muted/30 cursor-pointer hover:border-primary/60"
              onClick={() => navigate('/crachas/modelos/novo')}
            >
              <CardContent className="flex flex-col items-center justify-center h-full min-h-[240px] py-8">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <Plus className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">Criar do Zero</h3>
                <p className="text-xs text-muted-foreground text-center">
                  Canvas em branco estilo Canva com ferramentas de design completas
                </p>
                <Badge variant="outline" className="mt-3 text-xs">
                  85.6 × 53.98mm
                </Badge>
              </CardContent>
            </Card>

            {/* Preset Templates */}
            {DEFAULT_TEMPLATES.map((preset, idx) => (
              <Card key={idx} className="group hover:shadow-lg transition-all border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <LayoutTemplate className="h-5 w-5 text-primary" />
                        {preset.name}
                      </CardTitle>
                      <CardDescription className="mt-1">{preset.description}</CardDescription>
                    </div>
                    <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-0">
                      Pronto
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="aspect-[85/54] bg-card rounded-lg border border-border mb-4 p-3 flex gap-2">
                    <div className="w-1/3 flex flex-col gap-1">
                      <div className="h-2 bg-[#1e3a5f] rounded-sm" />
                      <div className="flex-1 bg-muted rounded border border-border" />
                      <div className="h-2 bg-[#1e3a5f] rounded-sm" />
                      <div className="h-1.5 bg-muted rounded-sm" />
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <div className="h-2 bg-[#1e3a5f] rounded-sm" />
                      <div className="flex-1 flex items-center justify-center">
                        <div className="w-8 h-8 border-2 border-dashed border-muted-foreground/30 rounded" />
                      </div>
                      <div className="h-1.5 bg-muted rounded-sm" />
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mb-4">
                    {preset.width_mm}×{preset.height_mm}mm • {preset.hasBackSide ? 'Frente e Verso' : 'Frente'} • {preset.elements.length} elementos
                  </div>
                  <Button
                    className="w-full gap-2"
                    onClick={() => handleCreateFromPreset(preset)}
                    disabled={isCreatingPreset}
                  >
                    {isCreatingPreset ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Criando...
                      </>
                    ) : (
                      <>
                        <LayoutTemplate className="h-4 w-4" />
                        Usar Este Modelo
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* My Templates Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : templates.length > 0 ? (
        <>
          <h2 className="text-lg font-semibold text-foreground mb-4">Meus Modelos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <Card key={template.id} className="group hover:shadow-card-lg transition-shadow animate-fade-in">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <CardDescription className="mt-1">{template.description || 'Sem descrição'}</CardDescription>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {template.width_mm}x{template.height_mm}mm
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {/* Preview */}
                <div className="aspect-[85/54] bg-gradient-to-br from-primary/5 to-accent/5 rounded-lg border border-border mb-4 flex items-center justify-center overflow-hidden">
                  {template.background_image_url ? (
                    <img 
                      src={template.background_image_url} 
                      alt={template.name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full bg-card m-1 rounded-md p-3 flex gap-3">
                      <div className="w-1/4 bg-muted rounded animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-muted rounded w-3/4 animate-pulse" />
                        <div className="h-2 bg-muted/50 rounded w-1/2 animate-pulse" />
                        <div className="h-2 bg-muted/50 rounded w-2/3 animate-pulse" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Template Info */}
                <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
                  <span>Atualizado em {new Date(template.updated_at).toLocaleDateString('pt-BR')}</span>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 gap-1.5"
                    onClick={() => navigate(`/crachas/modelos/${template.id}`)}
                  >
                    <Edit className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-1.5"
                    onClick={() => duplicateMutation.mutate(template.id)}
                    disabled={duplicateMutation.isPending}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteConfirmId(template.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Add New Template Card */}
          <Card
            className="border-dashed hover:border-primary/50 cursor-pointer transition-colors group"
            onClick={() => navigate('/crachas/modelos/novo')}
          >
            <CardContent className="flex flex-col items-center justify-center h-full min-h-[280px] text-muted-foreground group-hover:text-primary transition-colors">
              <div className="h-12 w-12 rounded-full bg-muted group-hover:bg-primary/10 flex items-center justify-center mb-3 transition-colors">
                <Plus className="h-6 w-6" />
              </div>
              <p className="font-medium">Criar Novo Modelo</p>
              <p className="text-sm mt-1">Clique para adicionar</p>
            </CardContent>
          </Card>
        </div>
        </>
      ) : null}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Modelo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este modelo? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Excluir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
};

export default Modelos;
