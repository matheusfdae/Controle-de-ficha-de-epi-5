import { obterUsuarioAtual } from '@/modules/crachas/lib/usuario';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CanvasElement, FIELD_BINDINGS } from './types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, X, Link, Clipboard } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PropertiesPanelProps {
  element: CanvasElement | null;
  onUpdateElement: (id: string, updates: Partial<CanvasElement>) => void;
  templateName: string;
  templateDescription: string;
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  hasBackSide: boolean;
  activeSide: 'front' | 'back';
  backgroundImageUrl?: string;
  onUpdateTemplate: (updates: Record<string, any>) => void;
  onUploadBackground: (file: File) => void;
  onApplyNameMode?: (elementId: string, mode: string, target: 'current' | 'front' | 'back' | 'both') => void;
}


const TYPE_LABELS: Record<string, string> = {
  text: 'Texto',
  image: 'Imagem',
  qrcode: 'QR Code',
  rectangle: 'Retângulo',
  line: 'Linha',
};

export const PropertiesPanel = ({
  element,
  onUpdateElement,
  templateName,
  templateDescription,
  canvasWidth,
  canvasHeight,
  backgroundColor,
  hasBackSide,
  activeSide,
  backgroundImageUrl,
  onUpdateTemplate,
  onUploadBackground,
  onApplyNameMode,
}: PropertiesPanelProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const elementImageRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [nameSideTarget, setNameSideTarget] = useState<'current' | 'front' | 'back' | 'both'>('current');


  const handleElementImageUpload = async (file: File) => {
    setIsUploadingImage(true);
    try {
      const { data: { user } } = await obterUsuarioAtual();
      if (!user) throw new Error('Não autenticado');
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/elements/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('cracha-assets').upload(fileName, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('cracha-assets').getPublicUrl(fileName);
      if (element) {
        onUpdateElement(element.id, { staticValue: urlData.publicUrl });
      }
      toast.success('Imagem carregada!');
    } catch (err: any) {
      toast.error('Erro no upload: ' + err.message);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        // Check for image types first
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], `pasted-${Date.now()}.png`, { type: imageType });
          await handleElementImageUpload(file);
          return;
        }
        // Fallback to text URL
        if (item.types.includes('text/plain')) {
          const blob = await item.getType('text/plain');
          const text = await blob.text();
          if (text && element && (text.startsWith('http://') || text.startsWith('https://'))) {
            onUpdateElement(element.id, { staticValue: text });
            toast.success('URL colada!');
            return;
          }
        }
      }
      toast.error('Nenhuma imagem ou URL válida na área de transferência');
    } catch {
      // Fallback for browsers that don't support clipboard.read()
      try {
        const text = await navigator.clipboard.readText();
        if (text && element && (text.startsWith('http://') || text.startsWith('https://'))) {
          onUpdateElement(element.id, { staticValue: text });
          toast.success('URL colada!');
        } else {
          toast.error('Nenhuma imagem ou URL válida na área de transferência');
        }
      } catch {
        toast.error('Não foi possível acessar a área de transferência');
      }
    }
  };

  // Handle paste event (Ctrl+V) when image element is selected
  const handlePasteEvent = async (e: React.ClipboardEvent) => {
    if (!element || (element.type !== 'image' && element.type !== 'qrcode')) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          await handleElementImageUpload(file);
        }
        return;
      }
    }
  };
  return (
    <div className="w-72 bg-card border-l border-border flex flex-col h-full" onPaste={handlePasteEvent}>
      <Tabs defaultValue={element ? 'element' : 'template'} className="flex flex-col flex-1 min-h-0">
        <TabsList className="grid w-full grid-cols-2 rounded-none border-b border-border bg-transparent h-10 shrink-0">
          <TabsTrigger value="template" className="text-xs rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
            Template
          </TabsTrigger>
          <TabsTrigger value="element" className="text-xs rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary" disabled={!element}>
            Elemento
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1 min-h-0">
          <TabsContent value="template" className="p-4 space-y-4 mt-0">
            <div className="space-y-2">
              <Label className="text-xs">Nome</Label>
              <Input
                value={templateName}
                onChange={(e) => onUpdateTemplate({ templateName: e.target.value })}
                placeholder="Nome do template"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Descrição</Label>
              <Input
                value={templateDescription}
                onChange={(e) => onUpdateTemplate({ templateDescription: e.target.value })}
                placeholder="Descrição"
                className="h-8 text-sm"
              />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Largura (mm)</Label>
                <Input
                  type="number"
                  value={canvasWidth}
                  onChange={(e) => onUpdateTemplate({ canvasWidth: parseFloat(e.target.value) })}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Altura (mm)</Label>
                <Input
                  type="number"
                  value={canvasHeight}
                  onChange={(e) => onUpdateTemplate({ canvasHeight: parseFloat(e.target.value) })}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Cor de Fundo</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => onUpdateTemplate({ backgroundColor: e.target.value })}
                  className="w-10 h-8 p-0.5 cursor-pointer"
                />
                <Input
                  value={backgroundColor}
                  onChange={(e) => onUpdateTemplate({ backgroundColor: e.target.value })}
                  className="h-8 text-sm font-mono flex-1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Imagem de Fundo</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onUploadBackground(e.target.files[0])}
              />
              <div
                className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {backgroundImageUrl ? (
                  <img src={backgroundImageUrl} alt="bg" className="w-full h-20 object-contain rounded" />
                ) : (
                  <>
                    <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xs text-muted-foreground">Clique para upload</p>
                  </>
                )}
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <Label className="text-xs">Frente e Verso</Label>
              <Switch
                checked={hasBackSide}
                onCheckedChange={(v) => onUpdateTemplate({ hasBackSide: v })}
              />
            </div>
          </TabsContent>

          <TabsContent value="element" className="p-4 space-y-4 mt-0">
            {element && (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                    {TYPE_LABELS[element.type]}
                  </span>
                </div>

                {/* Position */}
                <div>
                  <Label className="text-xs text-muted-foreground">Posição</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">X (mm)</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={element.x}
                        onChange={(e) => onUpdateElement(element.id, { x: parseFloat(e.target.value) })}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Y (mm)</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={element.y}
                        onChange={(e) => onUpdateElement(element.id, { y: parseFloat(e.target.value) })}
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Size */}
                <div>
                  <Label className="text-xs text-muted-foreground">Tamanho</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Largura</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={element.width}
                        onChange={(e) => onUpdateElement(element.id, { width: parseFloat(e.target.value) })}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Altura</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={element.height}
                        onChange={(e) => onUpdateElement(element.id, { height: parseFloat(e.target.value) })}
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Text properties */}
                {element.type === 'text' && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs">Vincular Campo</Label>
                      <Select
                        value={element.fieldBinding || ''}
                        onValueChange={(v) => onUpdateElement(element.id, { fieldBinding: v })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Selecione um campo..." />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_BINDINGS.map(f => (
                            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {element.fieldBinding === 'full_name' && (
                      <div className="space-y-2">
                        <Label className="text-xs">Exibição do Nome</Label>
                        {(() => {
                          const mode = element.nameDisplayMode || 'short';
                          const selectedParts: number[] = mode === 'short'
                            ? [0, 1]
                            : mode.startsWith('parts:')
                              ? mode.slice(6).split(',').map(n => parseInt(n, 10)).filter(n => !isNaN(n))
                              : [];
                          const isCustom = mode === 'short' || mode.startsWith('parts:');
                          const ordinal = (i: number) => `${i + 1}º nome`;
                          const applyMode = (newMode: string) => {
                            if (onApplyNameMode) {
                              onApplyNameMode(element.id, newMode, nameSideTarget);
                            } else {
                              onUpdateElement(element.id, { nameDisplayMode: newMode });
                            }
                          };
                          const setParts = (parts: number[]) => {
                            applyMode(parts.length === 0 ? 'none' : `parts:${parts.join(',')}`);
                          };

                          return (
                            <>
                              {/* Onde aplicar */}
                              <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground">Aplicar em</Label>
                                <div className="flex gap-1.5">
                                  {([
                                    { key: 'current' as const, label: element.side === 'back' ? 'Só este (verso)' : 'Só este (frente)' },
                                    { key: 'front' as const, label: 'Frente' },
                                    { key: 'back' as const, label: 'Verso' },
                                    { key: 'both' as const, label: 'Ambos' },
                                  ]).map(opt => (
                                    <button
                                      key={opt.key}
                                      type="button"
                                      onClick={() => setNameSideTarget(opt.key)}
                                      className={`px-2 py-1 rounded-md border text-[10px] transition-colors ${nameSideTarget === opt.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 text-muted-foreground border-border hover:border-primary/50'}`}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Presets */}
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => applyMode('full')}
                                  className={`px-2 py-1 rounded-md border text-[10px] transition-colors ${mode === 'full' ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 text-muted-foreground border-border hover:border-primary/50'}`}
                                >
                                  Nome Completo
                                </button>
                                <button
                                  type="button"
                                  onClick={() => applyMode('none')}
                                  className={`px-2 py-1 rounded-md border text-[10px] transition-colors ${mode === 'none' ? 'bg-destructive text-destructive-foreground border-destructive' : 'bg-muted/50 text-muted-foreground border-border hover:border-destructive/50'}`}
                                >
                                  Ocultar Nome
                                </button>
                                <button
                                  type="button"
                                  onClick={() => applyMode('short')}
                                  className={`px-2 py-1 rounded-md border text-[10px] transition-colors ${mode === 'short' ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 text-muted-foreground border-border hover:border-primary/50'}`}
                                >
                                  1º + 2º
                                </button>
                              </div>


                              {/* Selected parts as removable rectangles */}
                              {isCustom && (
                                <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/30 p-1.5 min-h-[30px]">
                                  {selectedParts.length === 0 && (
                                    <span className="text-[10px] text-muted-foreground px-1">Nenhuma parte selecionada</span>
                                  )}
                                  {selectedParts.map((partIdx, pos) => (
                                    <span
                                      key={`${partIdx}-${pos}`}
                                      className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-foreground"
                                    >
                                      {ordinal(partIdx)}
                                      <button
                                        type="button"
                                        onClick={() => setParts(selectedParts.filter((_, i) => i !== pos))}
                                        className="text-muted-foreground hover:text-destructive transition-colors"
                                        title="Remover esta parte do nome"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Available parts to add */}
                              {mode !== 'full' && mode !== 'none' && (
                                <div className="flex flex-wrap gap-1">
                                  {Array.from({ length: 8 }, (_, i) => i).map(i => (
                                    <button
                                      key={i}
                                      type="button"
                                      onClick={() => setParts([...selectedParts, i])}
                                      className="px-1.5 py-0.5 rounded-md border border-dashed border-border text-[10px] text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
                                    >
                                      + {ordinal(i)}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {mode !== 'full' && mode !== 'none' && (
                                <p className="text-[10px] text-muted-foreground">
                                  Monte o nome adicionando partes na ordem desejada. Clique no X para excluir uma parte.
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label className="text-xs">Família da Fonte</Label>
                      <Select
                        value={element.fontFamily || 'Inter'}
                        onValueChange={(v) => onUpdateElement(element.id, { fontFamily: v })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Poppins">Poppins</SelectItem>
                          <SelectItem value="Inter">Inter</SelectItem>
                          <SelectItem value="Arial">Arial</SelectItem>
                          <SelectItem value="Helvetica">Helvetica</SelectItem>
                          <SelectItem value="Georgia">Georgia</SelectItem>
                          <SelectItem value="Times New Roman">Times New Roman</SelectItem>
                          <SelectItem value="Courier New">Courier New</SelectItem>
                          <SelectItem value="Verdana">Verdana</SelectItem>
                          <SelectItem value="Trebuchet MS">Trebuchet MS</SelectItem>
                          <SelectItem value="Impact">Impact</SelectItem>
                          <SelectItem value="Roboto">Roboto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Texto Estático (rótulo / prefixo)</Label>
                      <Input
                        value={element.staticValue || ''}
                        onChange={(e) => onUpdateElement(element.id, { staticValue: e.target.value })}
                        placeholder="Ex: Data de Emissão "
                        className="h-8 text-xs"
                      />
                      {element.fieldBinding && element.staticValue && (
                        <div className="flex items-center justify-between pt-1">
                          <Label className="text-xs text-muted-foreground">
                            Mostrar rótulo junto ao valor
                          </Label>
                          <Switch
                            checked={element.showLabel !== false}
                            onCheckedChange={(v) => onUpdateElement(element.id, { showLabel: v })}
                          />
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Tamanho da Fonte</Label>
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[element.fontSize || 10]}
                          onValueChange={([v]) => onUpdateElement(element.id, { fontSize: v })}
                          min={4}
                          max={36}
                          step={1}
                          className="flex-1"
                        />
                        <span className="text-xs font-mono w-8 text-right">{element.fontSize || 10}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Peso da Fonte</Label>
                      <Select
                        value={element.fontWeight || 'normal'}
                        onValueChange={(v) => onUpdateElement(element.id, { fontWeight: v })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="bold">Negrito</SelectItem>
                          <SelectItem value="600">Semi-Negrito</SelectItem>
                          <SelectItem value="300">Leve</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Cor do Texto</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={element.fontColor || '#1e3a5f'}
                          onChange={(e) => onUpdateElement(element.id, { fontColor: e.target.value })}
                          className="w-10 h-8 p-0.5 cursor-pointer"
                        />
                        <Input
                          value={element.fontColor || '#1e3a5f'}
                          onChange={(e) => onUpdateElement(element.id, { fontColor: e.target.value })}
                          className="h-8 text-xs font-mono flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Alinhamento</Label>
                      <Select
                        value={element.textAlign || 'left'}
                        onValueChange={(v) => onUpdateElement(element.id, { textAlign: v as any })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="left">Esquerda</SelectItem>
                          <SelectItem value="center">Centro</SelectItem>
                          <SelectItem value="right">Direita</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label className="text-xs">Cor da Borda</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={element.borderColor || '#cccccc'}
                          onChange={(e) => onUpdateElement(element.id, { borderColor: e.target.value })}
                          className="w-10 h-8 p-0.5 cursor-pointer"
                        />
                        <Input
                          value={element.borderColor || ''}
                          onChange={(e) => onUpdateElement(element.id, { borderColor: e.target.value })}
                          placeholder="Sem borda"
                          className="h-8 text-xs font-mono flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Espessura da Borda</Label>
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[element.borderWidth || 0]}
                          onValueChange={([v]) => onUpdateElement(element.id, { borderWidth: v })}
                          min={0}
                          max={5}
                          step={0.5}
                          className="flex-1"
                        />
                        <span className="text-xs font-mono w-8 text-right">{element.borderWidth || 0}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Raio da Borda</Label>
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[element.borderRadius || 0]}
                          onValueChange={([v]) => onUpdateElement(element.id, { borderRadius: v })}
                          min={0}
                          max={20}
                          step={1}
                          className="flex-1"
                        />
                        <span className="text-xs font-mono w-8 text-right">{element.borderRadius || 0}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Cor de Fundo</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={element.backgroundColor || '#ffffff'}
                          onChange={(e) => onUpdateElement(element.id, { backgroundColor: e.target.value })}
                          className="w-10 h-8 p-0.5 cursor-pointer"
                        />
                        <Input
                          value={element.backgroundColor || ''}
                          onChange={(e) => onUpdateElement(element.id, { backgroundColor: e.target.value })}
                          placeholder="Transparente"
                          className="h-8 text-xs font-mono flex-1"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Image/QR binding */}
                {(element.type === 'image' || element.type === 'qrcode') && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs">Vincular Campo</Label>
                      <Select
                        value={element.fieldBinding || ''}
                        onValueChange={(v) => onUpdateElement(element.id, { fieldBinding: v, staticValue: undefined })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_BINDINGS.filter(f => 
                            element.type === 'image' ? f.value === 'photo_url' : f.value === 'qr_value'
                          ).map(f => (
                            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {element.type === 'image' && (
                      <>
                        <Separator />
                        <div className="space-y-2">
                          <Label className="text-xs">Imagem Estática</Label>
                          <input
                            ref={elementImageRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => e.target.files?.[0] && handleElementImageUpload(e.target.files[0])}
                          />
                          
                          {element.staticValue && !element.fieldBinding ? (
                            <div className="relative">
                              <img src={element.staticValue} alt="element" className="w-full h-24 object-contain rounded border border-border" />
                              <Button
                                variant="destructive"
                                size="icon"
                                className="absolute top-1 right-1 h-5 w-5"
                                onClick={() => onUpdateElement(element.id, { staticValue: undefined })}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : !element.fieldBinding ? (
                            <div
                              className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/40 transition-colors"
                              onClick={() => elementImageRef.current?.click()}
                            >
                              <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                              <p className="text-xs text-muted-foreground">
                                {isUploadingImage ? 'Enviando...' : 'Clique para carregar imagem'}
                              </p>
                            </div>
                          ) : null}

                          {!element.fieldBinding && (
                            <div className="flex gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 h-7 text-xs gap-1"
                                onClick={() => elementImageRef.current?.click()}
                                disabled={isUploadingImage}
                              >
                                <Upload className="h-3 w-3" />
                                Upload
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 h-7 text-xs gap-1"
                                onClick={handlePasteFromClipboard}
                              >
                                <Clipboard className="h-3 w-3" />
                                Colar Imagem
                              </Button>
                            </div>
                          )}

                          {!element.fieldBinding && (
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">URL da imagem</Label>
                              <Input
                                value={element.staticValue || ''}
                                onChange={(e) => onUpdateElement(element.id, { staticValue: e.target.value })}
                                placeholder="https://..."
                                className="h-7 text-xs"
                              />
                            </div>
                          )}
                        </div>

                        <Separator />
                        <div className="space-y-2">
                          <Label className="text-xs">Ajuste da Imagem</Label>
                          <Select
                            value={element.objectFit || 'cover'}
                            onValueChange={(v) => onUpdateElement(element.id, { objectFit: v as any })}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cover">Cobrir</SelectItem>
                              <SelectItem value="contain">Conter</SelectItem>
                              <SelectItem value="fill">Esticar</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* Border radius for image/qrcode */}
                {(element.type === 'image' || element.type === 'qrcode') && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <Label className="text-xs">Arredondamento</Label>
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[element.borderRadius || 0]}
                          onValueChange={([v]) => onUpdateElement(element.id, { borderRadius: v })}
                          min={0}
                          max={50}
                          step={1}
                          className="flex-1"
                        />
                        <span className="text-xs font-mono w-8 text-right">{element.borderRadius || 0}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Cor da Borda</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={element.borderColor || '#cccccc'}
                          onChange={(e) => onUpdateElement(element.id, { borderColor: e.target.value })}
                          className="w-10 h-8 p-0.5 cursor-pointer"
                        />
                        <Input
                          value={element.borderColor || ''}
                          onChange={(e) => onUpdateElement(element.id, { borderColor: e.target.value })}
                          placeholder="Sem borda"
                          className="h-8 text-xs font-mono flex-1"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Espessura da Borda</Label>
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[element.borderWidth || 0]}
                          onValueChange={([v]) => onUpdateElement(element.id, { borderWidth: v })}
                          min={0}
                          max={5}
                          step={0.5}
                          className="flex-1"
                        />
                        <span className="text-xs font-mono w-8 text-right">{element.borderWidth || 0}</span>
                      </div>
                    </div>
                  </>
                )}

                {/* Rectangle properties */}
                {element.type === 'rectangle' && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs">Cor de Fundo</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={element.backgroundColor || '#3b82f6'}
                          onChange={(e) => onUpdateElement(element.id, { backgroundColor: e.target.value })}
                          className="w-10 h-8 p-0.5 cursor-pointer"
                        />
                        <Input
                          value={element.backgroundColor || '#3b82f6'}
                          onChange={(e) => onUpdateElement(element.id, { backgroundColor: e.target.value })}
                          className="h-8 text-xs font-mono flex-1"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Borda</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={element.borderColor || '#000000'}
                          onChange={(e) => onUpdateElement(element.id, { borderColor: e.target.value })}
                          className="w-10 h-8 p-0.5 cursor-pointer"
                        />
                        <Input
                          type="number"
                          value={element.borderWidth || 0}
                          onChange={(e) => onUpdateElement(element.id, { borderWidth: parseFloat(e.target.value) })}
                          className="h-8 text-xs w-16"
                          placeholder="px"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Arredondamento</Label>
                      <Slider
                        value={[element.borderRadius || 0]}
                        onValueChange={([v]) => onUpdateElement(element.id, { borderRadius: v })}
                        min={0}
                        max={50}
                        step={1}
                      />
                    </div>
                  </>
                )}

                {/* Line properties */}
                {element.type === 'line' && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs">Cor</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={element.borderColor || '#1e3a5f'}
                          onChange={(e) => onUpdateElement(element.id, { borderColor: e.target.value })}
                          className="w-10 h-8 p-0.5 cursor-pointer"
                        />
                        <Input
                          value={element.borderColor || '#1e3a5f'}
                          onChange={(e) => onUpdateElement(element.id, { borderColor: e.target.value })}
                          className="h-8 text-xs font-mono flex-1"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Espessura</Label>
                      <Slider
                        value={[element.borderWidth || 1]}
                        onValueChange={([v]) => onUpdateElement(element.id, { borderWidth: v })}
                        min={1}
                        max={10}
                        step={0.5}
                      />
                    </div>
                  </>
                )}

                <Separator />

                {/* Rotation */}
                <div className="space-y-2">
                  <Label className="text-xs">Rotação</Label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[element.rotation || 0]}
                      onValueChange={([v]) => onUpdateElement(element.id, { rotation: v })}
                      min={0}
                      max={360}
                      step={1}
                      className="flex-1"
                    />
                    <span className="text-xs font-mono w-10 text-right">{element.rotation || 0}°</span>
                  </div>
                </div>

                {/* Opacity */}
                <div className="space-y-2">
                  <Label className="text-xs">Opacidade</Label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[(element.opacity ?? 1) * 100]}
                      onValueChange={([v]) => onUpdateElement(element.id, { opacity: v / 100 })}
                      min={0}
                      max={100}
                      step={5}
                      className="flex-1"
                    />
                    <span className="text-xs font-mono w-10 text-right">{Math.round((element.opacity ?? 1) * 100)}%</span>
                  </div>
                </div>
              </>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
};
