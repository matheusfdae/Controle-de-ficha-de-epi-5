import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { CanvasElement } from './types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface LayoutSuggestion {
  photo: { x: number; y: number; width: number; height: number };
  elements: Array<{
    fieldBinding: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    fontWeight?: string;
    fontColor: string;
    textAlign?: string;
  }>;
  reasoning: string;
}

interface AILayoutSuggestionProps {
  elements: CanvasElement[];
  canvasWidth: number;
  canvasHeight: number;
  activeSide: 'front' | 'back';
  backgroundImageUrl?: string;
  templateId?: string;
  onApplySuggestion: (newElements: CanvasElement[]) => void;
}

export const AILayoutSuggestion = ({
  elements,
  canvasWidth,
  canvasHeight,
  activeSide,
  backgroundImageUrl,
  templateId,
  onApplySuggestion,
}: AILayoutSuggestionProps) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestion, setSuggestion] = useState<LayoutSuggestion | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [savedSuggestion, setSavedSuggestion] = useState<LayoutSuggestion | null>(null);
  const [savedBgUrl, setSavedBgUrl] = useState<string | null>(null);
  const autoSuggestedRef = useRef(false);

  // Load saved suggestion from DB
  useEffect(() => {
    if (!templateId || templateId === 'novo') return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('cracha_badge_templates')
        .select('ai_layout_suggestion, ai_layout_bg_url')
        .eq('id', templateId)
        .maybeSingle();
      if (cancelled || error || !data) return;
      const s = (data as any).ai_layout_suggestion as LayoutSuggestion | null;
      const bg = (data as any).ai_layout_bg_url as string | null;
      if (s && s.photo && Array.isArray(s.elements)) {
        setSavedSuggestion(s);
        setSavedBgUrl(bg);
      }
    })();
    return () => { cancelled = true; };
  }, [templateId]);

  // Auto-suggest on first load when saved mapping exists for the same background
  useEffect(() => {
    if (autoSuggestedRef.current) return;
    if (!savedSuggestion || !backgroundImageUrl) return;
    if (savedBgUrl !== backgroundImageUrl) return;
    // Only auto-trigger if there are no mapped elements yet on this side
    const hasMapped = elements.some((el) => el.side === activeSide && el.fieldBinding);
    if (hasMapped) return;
    autoSuggestedRef.current = true;
    setSuggestion(savedSuggestion);
    setShowDialog(true);
    toast.info('Mapeamento salvo encontrado para este modelo. Revise e aplique.');
  }, [savedSuggestion, savedBgUrl, backgroundImageUrl, elements, activeSide]);

  const persistSuggestion = async (s: LayoutSuggestion) => {
    if (!templateId || templateId === 'novo') return;
    try {
      await supabase
        .from('cracha_badge_templates')
        .update({
          ai_layout_suggestion: s as any,
          ai_layout_bg_url: backgroundImageUrl || null,
          ai_layout_updated_at: new Date().toISOString(),
        })
        .eq('id', templateId);
      setSavedSuggestion(s);
      setSavedBgUrl(backgroundImageUrl || null);
    } catch (e) {
      console.warn('Falha ao salvar mapeamento de IA:', e);
    }
  };

  const runAnalysis = async () => {
    if (!backgroundImageUrl) {
      toast.error('Adicione uma imagem de fundo ao template antes de usar a sugestão de IA');
      return;
    }

    let imagePayload: string;
    try {
      const resp = await fetch(backgroundImageUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      if (blob.type.includes('text/html')) throw new Error('Expected image');
      imagePayload = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      toast.error('Não foi possível carregar a imagem de fundo do template');
      return;
    }

    const existingFields = elements
      .filter((el) => el.side === activeSide && el.fieldBinding)
      .map((el) => el.fieldBinding!);

    const fields = existingFields.length > 0
      ? existingFields
      : ['photo_url', 'full_name', 'role', 'employee_id'];

    setIsAnalyzing(true);

    try {
      const { data, error } = await supabase.functions.invoke('analyze-photo-layout', {
        body: {
          backgroundImageUrl: imagePayload,
          canvasWidth,
          canvasHeight,
          existingFields: fields,
        },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      if (data?.suggestion) {
        setSuggestion(data.suggestion);
        setShowDialog(true);
      }
    } catch (err: any) {
      console.error('AI layout error:', err);
      toast.error('Erro ao analisar layout: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUseSaved = () => {
    if (!savedSuggestion) return;
    setSuggestion(savedSuggestion);
    setShowDialog(true);
  };

  const applySuggestion = async () => {
    if (!suggestion) return;

    const newElements: CanvasElement[] = [];
    let zIndex = 0;

    if (suggestion.photo) {
      const existingPhoto = elements.find(
        (el) => el.type === 'image' && el.fieldBinding === 'photo_url' && el.side === activeSide
      );
      newElements.push({
        id: existingPhoto?.id || crypto.randomUUID(),
        type: 'image',
        x: suggestion.photo.x,
        y: suggestion.photo.y,
        width: suggestion.photo.width,
        height: suggestion.photo.height,
        fieldBinding: 'photo_url',
        opacity: 1,
        zIndex: zIndex++,
        side: activeSide,
        objectFit: 'cover',
        borderRadius: existingPhoto?.borderRadius,
      });
    }

    for (const el of suggestion.elements) {
      const existing = elements.find(
        (e) => e.fieldBinding === el.fieldBinding && e.side === activeSide
      );
      newElements.push({
        id: existing?.id || crypto.randomUUID(),
        type: existing?.type || 'text',
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        fieldBinding: el.fieldBinding,
        staticValue: existing?.staticValue,
        fontFamily: existing?.fontFamily || 'Inter',
        fontSize: el.fontSize,
        fontWeight: el.fontWeight || 'normal',
        fontColor: el.fontColor,
        textAlign: (el.textAlign as any) || 'left',
        opacity: 1,
        zIndex: zIndex++,
        side: activeSide,
      });
    }

    const preservedElements = elements.filter(
      (el) =>
        el.side !== activeSide ||
        (!el.fieldBinding && el.type !== 'image')
    );

    onApplySuggestion([...preservedElements, ...newElements]);
    setShowDialog(false);

    // Persist as saved mapping for this template
    await persistSuggestion(suggestion);

    setSuggestion(null);
    toast.success('Mapeamento aplicado e salvo no modelo!');
  };

  const hasSavedForCurrentBg = !!(savedSuggestion && backgroundImageUrl && savedBgUrl === backgroundImageUrl);

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-primary"
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            Mapeamento por IA{hasSavedForCurrentBg ? ' (mapeamento salvo disponível)' : ''}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="w-64">
          {hasSavedForCurrentBg && (
            <>
              <DropdownMenuItem onClick={handleUseSaved}>
                <Sparkles className="h-4 w-4 mr-2 text-primary" />
                Aplicar mapeamento salvo
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={runAnalysis}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {hasSavedForCurrentBg ? 'Reanalisar com IA' : 'Analisar com IA'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Mapeamento Automático por IA
            </DialogTitle>
            <DialogDescription>
              {suggestion === savedSuggestion
                ? 'Mapeamento salvo deste modelo. Aplique para reutilizar o posicionamento.'
                : 'A IA analisou a imagem de fundo do template e sugere o seguinte posicionamento:'}
            </DialogDescription>
          </DialogHeader>

          {suggestion && (
            <div className="space-y-3">
              <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                {suggestion.reasoning}
              </div>

              <div className="text-xs space-y-1">
                <p className="font-medium text-foreground">Elementos mapeados:</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                  <li>
                    Foto: {suggestion.photo.width.toFixed(1)}×{suggestion.photo.height.toFixed(1)}mm
                    em ({suggestion.photo.x.toFixed(1)}, {suggestion.photo.y.toFixed(1)})
                  </li>
                  {suggestion.elements.map((el, i) => (
                    <li key={i}>
                      {el.fieldBinding}: fonte {el.fontSize}pt, cor {el.fontColor}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={applySuggestion} className="gap-2">
              <Sparkles className="h-4 w-4" />
              Aplicar Mapeamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
