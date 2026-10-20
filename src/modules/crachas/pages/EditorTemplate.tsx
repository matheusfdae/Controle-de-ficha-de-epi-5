import { obterUsuarioAtual } from '@/modules/crachas/lib/usuario';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EditorToolbar } from '@/modules/crachas/components/editor/EditorToolbar';
import { CanvasArea } from '@/modules/crachas/components/editor/CanvasArea';
import { ElementPanel } from '@/modules/crachas/components/editor/ElementPanel';
import { PropertiesPanel } from '@/modules/crachas/components/editor/PropertiesPanel';
import { EditorShortcutsHelp } from '@/modules/crachas/components/editor/EditorShortcutsHelp';
import { CanvasElement, ELEMENT_PRESETS } from '@/modules/crachas/components/editor/types';
import { useEditorHistory } from '@/modules/crachas/hooks/useEditorHistory';

const EditorTemplate = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = id === 'novo';

  const { elements, setElements, loadElements, undo, redo, canUndo, canRedo } = useEditorHistory([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(3);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [canvasWidth, setCanvasWidth] = useState(85.6);
  const [canvasHeight, setCanvasHeight] = useState(53.98);
  const [backgroundColor, setBackgroundColor] = useState('#FFFFFF');
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | undefined>();
  const [hasBackSide, setHasBackSide] = useState(false);
  const [activeSide, setActiveSide] = useState<'front' | 'back'>('front');
  const [isSaving, setIsSaving] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showSafeArea, setShowSafeArea] = useState(true);
  const [safeAreaMargin, setSafeAreaMargin] = useState(3);
  const clipboardRef = useRef<CanvasElement | null>(null);

  // Fetch template
  const { data: templateData, isLoading } = useQuery({
    queryKey: ['badge_template', id],
    queryFn: async () => {
      if (isNew) return null;
      const { data, error } = await supabase
        .from('cracha_badge_templates')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !isNew && !!id,
  });

  // Fetch elements
  const { data: elementsData } = useQuery({
    queryKey: ['template_elements', id],
    queryFn: async () => {
      if (isNew) return [];
      const { data, error } = await supabase
        .from('cracha_template_elements')
        .select('*')
        .eq('template_id', id)
        .order('z_index');
      if (error) throw error;
      return data;
    },
    enabled: !isNew && !!id,
  });

  useEffect(() => {
    if (templateData) {
      setTemplateName(templateData.name);
      setTemplateDescription(templateData.description || '');
      setCanvasWidth(Number(templateData.width_mm));
      setCanvasHeight(Number(templateData.height_mm));
      setBackgroundColor(templateData.background_color || '#FFFFFF');
      setBackgroundImageUrl(templateData.background_image_url || undefined);
      setHasBackSide(templateData.has_back_side);
    }
  }, [templateData]);

  useEffect(() => {
    if (elementsData) {
      loadElements(elementsData.map(el => ({
        id: el.id,
        type: el.element_type as CanvasElement['type'],
        x: Number(el.x_position),
        y: Number(el.y_position),
        width: Number(el.width || 20),
        height: Number(el.height || 10),
        fieldBinding: el.field_binding || undefined,
        nameDisplayMode: (el as any).name_display_mode || 'short',
        staticValue: el.static_value || undefined,
        fontFamily: el.font_family || 'Inter',
        fontSize: Number(el.font_size || 10),
        fontWeight: el.font_weight || 'normal',
        fontColor: el.font_color || '#1e3a5f',
        textAlign: (el.text_align as any) || 'left',
        backgroundColor: el.background_color || undefined,
        borderColor: el.border_color || undefined,
        borderWidth: Number(el.border_width || 0),
        borderRadius: Number((el as any).border_radius || 0),
        objectFit: ((el as any).object_fit as any) || 'cover',
        showLabel: (el as any).show_label !== false,
        opacity: 1,
        zIndex: el.z_index,
        side: el.side as 'front' | 'back',
      })));
    }
  }, [elementsData, loadElements]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }

      // Delete
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        handleDeleteElement(selectedId);
        return;
      }

      // Duplicate
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedId) {
        e.preventDefault();
        handleDuplicateElement(selectedId);
        return;
      }

      // Copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedId) {
        const el = elements.find(el => el.id === selectedId);
        if (el) {
          clipboardRef.current = el;
          toast.success('Elemento copiado');
        }
        return;
      }

      // Paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboardRef.current) {
        e.preventDefault();
        const src = clipboardRef.current;
        const newEl: CanvasElement = {
          ...src,
          id: crypto.randomUUID(),
          x: Math.min(canvasWidth - src.width, src.x + 3),
          y: Math.min(canvasHeight - src.height, src.y + 3),
          zIndex: elements.length,
          side: activeSide,
        };
        setElements(prev => [...prev, newEl]);
        setSelectedId(newEl.id);
        toast.success('Elemento colado');
        return;
      }

      // Arrow keys to nudge
      if (selectedId && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 0.5;
        const el = elements.find(el => el.id === selectedId);
        if (!el || el.locked) return;
        const updates: Partial<CanvasElement> = {};
        if (e.key === 'ArrowUp') updates.y = Math.max(0, el.y - step);
        if (e.key === 'ArrowDown') updates.y = Math.min(canvasHeight - el.height, el.y + step);
        if (e.key === 'ArrowLeft') updates.x = Math.max(0, el.x - step);
        if (e.key === 'ArrowRight') updates.x = Math.min(canvasWidth - el.width, el.x + step);
        handleUpdateElement(el.id, updates);
      }

      // Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, elements, canvasWidth, canvasHeight]);

  const handleAddElement = useCallback((type: string) => {
    const preset = ELEMENT_PRESETS.find(p => p.type === type);
    if (!preset) return;

    const newEl: CanvasElement = {
      id: crypto.randomUUID(),
      type: type as CanvasElement['type'],
      x: canvasWidth / 2 - preset.defaultWidth / 2,
      y: canvasHeight / 2 - preset.defaultHeight / 2,
      width: preset.defaultWidth,
      height: preset.defaultHeight,
      fontFamily: 'Inter',
      fontSize: 10,
      fontWeight: 'normal',
      fontColor: '#1e3a5f',
      textAlign: 'left',
      opacity: 1,
      zIndex: elements.length,
      side: activeSide,
    };
    setElements(prev => [...prev, newEl]);
    setSelectedId(newEl.id);
  }, [elements.length, activeSide, canvasWidth, canvasHeight, setElements]);

  const handleUpdateElement = useCallback((id: string, updates: Partial<CanvasElement>) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
  }, [setElements]);

  const handleApplyNameMode = useCallback((elementId: string, mode: string, target: 'current' | 'front' | 'back' | 'both') => {
    setElements(prev => prev.map(el => {
      const isTarget = target === 'current'
        ? el.id === elementId
        : el.fieldBinding === 'full_name' && (target === 'both' || el.side === target);
      return isTarget ? { ...el, nameDisplayMode: mode } : el;
    }));
  }, [setElements]);


  const handleDeleteElement = useCallback((id: string) => {
    setElements(prev => prev.filter(el => el.id !== id));
    if (selectedId === id) setSelectedId(null);
    toast.success('Elemento removido');
  }, [selectedId, setElements]);

  const handleDuplicateElement = useCallback((id: string) => {
    const el = elements.find(e => e.id === id);
    if (!el) return;
    const newEl = { ...el, id: crypto.randomUUID(), x: el.x + 3, y: el.y + 3, zIndex: elements.length };
    setElements(prev => [...prev, newEl]);
    setSelectedId(newEl.id);
    toast.success('Elemento duplicado');
  }, [elements, setElements]);

  const handleAddMappedElement = useCallback((elementData: Omit<CanvasElement, 'id'>) => {
    const newEl: CanvasElement = {
      ...elementData,
      id: crypto.randomUUID(),
    };
    setElements(prev => [...prev, newEl]);
    setSelectedId(newEl.id);
    toast.success('Campo mapeado adicionado');
  }, [elements, setElements]);

  const handleUpdateTemplate = useCallback((updates: Record<string, any>) => {
    if ('templateName' in updates) setTemplateName(updates.templateName);
    if ('templateDescription' in updates) setTemplateDescription(updates.templateDescription);
    if ('canvasWidth' in updates) setCanvasWidth(updates.canvasWidth);
    if ('canvasHeight' in updates) setCanvasHeight(updates.canvasHeight);
    if ('backgroundColor' in updates) setBackgroundColor(updates.backgroundColor);
    if ('hasBackSide' in updates) setHasBackSide(updates.hasBackSide);
  }, []);

  const handleUploadBackground = useCallback(async (file: File) => {
    try {
      const { data: { user } } = await obterUsuarioAtual();
      if (!user) throw new Error('Não autenticado');
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('cracha-assets').upload(fileName, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('cracha-assets').getPublicUrl(fileName);

      // Load image to get dimensions and scale canvas + elements proportionally
      const img = new Image();
      img.onload = () => {
        const imgRatio = img.naturalWidth / img.naturalHeight;
        const oldW = canvasWidth;
        const oldH = canvasHeight;

        // Keep the larger dimension and adjust the other based on aspect ratio
        let newW: number, newH: number;
        if (imgRatio >= 1) {
          // Landscape or square: keep width, adjust height
          newW = oldW;
          newH = oldW / imgRatio;
        } else {
          // Portrait: keep height, adjust width
          newH = oldH;
          newW = oldH * imgRatio;
        }

        const scaleX = newW / oldW;
        const scaleY = newH / oldH;

        // Scale all elements proportionally
        setElements(prev => prev.map(el => ({
          ...el,
          x: parseFloat((el.x * scaleX).toFixed(2)),
          y: parseFloat((el.y * scaleY).toFixed(2)),
          width: parseFloat((el.width * scaleX).toFixed(2)),
          height: parseFloat((el.height * scaleY).toFixed(2)),
        })));

        setCanvasWidth(parseFloat(newW.toFixed(2)));
        setCanvasHeight(parseFloat(newH.toFixed(2)));
        setBackgroundImageUrl(urlData.publicUrl);
        toast.success('Imagem de fundo atualizada e campos ajustados proporcionalmente');
      };
      img.onerror = () => {
        // If we can't load image dimensions, just set background without scaling
        setBackgroundImageUrl(urlData.publicUrl);
        toast.success('Imagem de fundo atualizada');
      };
      img.src = urlData.publicUrl;
    } catch (err: any) {
      toast.error('Erro no upload: ' + err.message);
    }
  }, [canvasWidth, canvasHeight, setElements]);

  const handleAlign = useCallback((alignment: string) => {
    if (!selectedId) return;
    const el = elements.find(e => e.id === selectedId);
    if (!el) return;

    const updates: Partial<CanvasElement> = {};
    switch (alignment) {
      case 'left': updates.x = 0; break;
      case 'center-h': updates.x = (canvasWidth - el.width) / 2; break;
      case 'right': updates.x = canvasWidth - el.width; break;
      case 'top': updates.y = 0; break;
      case 'center-v': updates.y = (canvasHeight - el.height) / 2; break;
      case 'bottom': updates.y = canvasHeight - el.height; break;
    }
    handleUpdateElement(selectedId, updates);
  }, [selectedId, elements, canvasWidth, canvasHeight, handleUpdateElement]);

  const handleSave = async () => {
    if (!templateName.trim()) {
      toast.error('Nome do template é obrigatório');
      return;
    }
    setIsSaving(true);
    try {
      const { data: { user } } = await obterUsuarioAtual();
      if (!user) throw new Error('Não autenticado');

      let templateId = id;

      if (isNew) {
        const { data, error } = await supabase.from('cracha_badge_templates').insert({
          user_id: user.id, name: templateName, description: templateDescription || null,
          width_mm: canvasWidth, height_mm: canvasHeight, background_color: backgroundColor,
          background_image_url: backgroundImageUrl || null, has_back_side: hasBackSide,
        }).select().single();
        if (error) throw error;
        templateId = data.id;
      } else {
        const { error } = await supabase.from('cracha_badge_templates').update({
          name: templateName, description: templateDescription || null,
          width_mm: canvasWidth, height_mm: canvasHeight, background_color: backgroundColor,
          background_image_url: backgroundImageUrl || null, has_back_side: hasBackSide,
          updated_at: new Date().toISOString(),
        }).eq('id', id);
        if (error) throw error;
        await supabase.from('cracha_template_elements').delete().eq('template_id', id!);
      }

      if (elements.length > 0) {
        const { error } = await supabase.from('cracha_template_elements').insert(elements.map(el => ({
          template_id: templateId!, element_type: el.type,
          x_position: el.x, y_position: el.y, width: el.width, height: el.height,
          field_binding: el.fieldBinding || null, static_value: el.staticValue || null,
          name_display_mode: el.nameDisplayMode || 'short',
          font_family: el.fontFamily || 'Inter', font_size: el.fontSize || 10,
          font_weight: el.fontWeight || 'normal', font_color: el.fontColor || '#1e3a5f',
          text_align: el.textAlign || 'left', background_color: el.backgroundColor || null,
          border_color: el.borderColor || null, border_width: el.borderWidth || 0,
          border_radius: el.borderRadius || 0, object_fit: el.objectFit || 'cover',
          show_label: el.showLabel !== false,
          z_index: el.zIndex, side: el.side,
        })));
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['cracha_badge_templates'] });
      queryClient.invalidateQueries({ queryKey: ['badge_template', templateId] });
      queryClient.invalidateQueries({ queryKey: ['template_elements', templateId] });
      queryClient.invalidateQueries({ queryKey: ['badge-templates-with-elements'] });
      queryClient.invalidateQueries({ queryKey: ['active-template-for-colaboradores'] });
      toast.success('Template salvo com sucesso!');
      if (isNew) navigate(`/crachas/modelos/${templateId}`);
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedElement = elements.find(el => el.id === selectedId) || null;

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/crachas/modelos')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-sm font-semibold text-foreground">
              {templateName || (isNew ? 'Novo Template' : 'Editor')}
            </h1>
            <Popover>
              <PopoverTrigger asChild>
                <button className="text-[10px] text-muted-foreground hover:text-foreground hover:underline cursor-pointer transition-colors">
                  {canvasWidth}×{canvasHeight}mm • {elements.filter(e => e.side === activeSide).length} elementos
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-3" align="start">
                <p className="text-xs font-medium mb-2 text-foreground">Dimensões do crachá</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground">Largura (mm)</label>
                    <Input
                      type="number"
                      value={canvasWidth}
                      onChange={(e) => setCanvasWidth(Number(e.target.value))}
                      className="h-7 text-xs"
                      step={0.1}
                      min={20}
                      max={300}
                    />
                  </div>
                  <span className="text-muted-foreground mt-3">×</span>
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground">Altura (mm)</label>
                    <Input
                      type="number"
                      value={canvasHeight}
                      onChange={(e) => setCanvasHeight(Number(e.target.value))}
                      className="h-7 text-xs"
                      step={0.1}
                      min={20}
                      max={300}
                    />
                  </div>
                </div>
                <div className="flex gap-1 mt-2 flex-wrap">
                  {[
                    { label: 'CR-80', w: 85.6, h: 53.98 },
                    { label: 'A7', w: 74, h: 105 },
                    { label: 'A8', w: 52, h: 74 },
                  ].map(preset => (
                    <Button
                      key={preset.label}
                      variant={canvasWidth === preset.w && canvasHeight === preset.h ? 'default' : 'outline'}
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => { setCanvasWidth(preset.w); setCanvasHeight(preset.h); }}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasBackSide && (
          <Tabs value={activeSide} onValueChange={(v) => setActiveSide(v as 'front' | 'back')}>
              <TabsList className="h-8">
                <TabsTrigger value="front" className="text-xs h-6 px-3">Frente</TabsTrigger>
                <TabsTrigger value="back" className="text-xs h-6 px-3">Verso</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          <EditorShortcutsHelp />
          <Button size="sm" className="gap-2 h-8" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <EditorToolbar
        onAddElement={handleAddElement}
        zoom={zoom}
        onZoomChange={setZoom}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid(g => !g)}
        showSafeArea={showSafeArea}
        onToggleSafeArea={() => setShowSafeArea(s => !s)}
        safeAreaMargin={safeAreaMargin}
        onSafeAreaMarginChange={setSafeAreaMargin}
        onAlign={selectedId ? handleAlign : undefined}
        elements={elements}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        activeSide={activeSide}
        backgroundImageUrl={backgroundImageUrl}
        templateId={id}
        onApplyAISuggestion={(newElements) => {
          setElements(() => newElements);
          setSelectedId(null);
        }}
      />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        <ElementPanel
          elements={elements}
          selectedId={selectedId}
          activeSide={activeSide}
          onSelectElement={setSelectedId}
          onDeleteElement={handleDeleteElement}
          onDuplicateElement={handleDuplicateElement}
          onUpdateElement={handleUpdateElement}
          onAddElement={handleAddElement}
          onAddMappedElement={handleAddMappedElement}
        />

        <CanvasArea
          elements={elements}
          selectedId={selectedId}
          onSelectElement={setSelectedId}
          onUpdateElement={handleUpdateElement}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          onCanvasResize={(w, h) => { setCanvasWidth(w); setCanvasHeight(h); }}
          zoom={zoom}
          backgroundImageUrl={backgroundImageUrl}
          backgroundColor={backgroundColor}
          activeSide={activeSide}
          showGrid={showGrid}
          showSafeArea={showSafeArea}
          safeAreaMargin={safeAreaMargin}
        />

        <PropertiesPanel
          element={selectedElement}
          onUpdateElement={handleUpdateElement}
          templateName={templateName}
          templateDescription={templateDescription}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          backgroundColor={backgroundColor}
          hasBackSide={hasBackSide}
          activeSide={activeSide}
          backgroundImageUrl={backgroundImageUrl}
          onUpdateTemplate={handleUpdateTemplate}
          onUploadBackground={handleUploadBackground}
          onApplyNameMode={handleApplyNameMode}
        />
      </div>
    </div>
  );
};

export default EditorTemplate;
