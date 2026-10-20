import { IA_DISPONIVEL } from '@/modules/crachas/lib/recursos';
import { Type, Image, QrCode, Square, Minus, MousePointer2, ZoomIn, ZoomOut, Undo2, Redo2, Grid3X3, AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter, AlignStartHorizontal, AlignStartVertical, AlignEndHorizontal, AlignEndVertical, RotateCw, ShieldCheck } from 'lucide-react';
import { CanvasElement } from './types';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ELEMENT_PRESETS } from './types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AILayoutSuggestion } from './AILayoutSuggestion';

const ICONS: Record<string, any> = { Type, Image, QrCode, Square, Minus };

interface EditorToolbarProps {
  onAddElement: (type: string) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  showGrid?: boolean;
  onToggleGrid?: () => void;
  showSafeArea?: boolean;
  onToggleSafeArea?: () => void;
  safeAreaMargin?: number;
  onSafeAreaMarginChange?: (margin: number) => void;
  onAlign?: (alignment: string) => void;
  // AI Layout
  elements?: CanvasElement[];
  canvasWidth?: number;
  canvasHeight?: number;
  activeSide?: 'front' | 'back';
  backgroundImageUrl?: string;
  templateId?: string;
  onApplyAISuggestion?: (newElements: CanvasElement[]) => void;
}

export const EditorToolbar = ({
  onAddElement,
  zoom,
  onZoomChange,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  showGrid = true,
  onToggleGrid,
  showSafeArea = true,
  onToggleSafeArea,
  safeAreaMargin = 3,
  onSafeAreaMarginChange,
  onAlign,
  elements = [],
  canvasWidth: cw = 85.6,
  canvasHeight: ch = 53.98,
  activeSide = 'front',
  backgroundImageUrl,
  templateId,
  onApplyAISuggestion,
}: EditorToolbarProps) => {
  return (
    <div className="flex items-center gap-1 px-4 py-1.5 bg-card border-b border-border">
      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onUndo} disabled={!canUndo}>
              <Undo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Desfazer (Ctrl+Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRedo} disabled={!canRedo}>
              <Redo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refazer (Ctrl+Y)</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Element tools */}
      <div className="flex items-center gap-0.5">
        {ELEMENT_PRESETS.map((preset) => {
          const Icon = ICONS[preset.icon];
          return (
            <Tooltip key={preset.type}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onAddElement(preset.type)}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{preset.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Alignment */}
      {onAlign && (
        <>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <AlignHorizontalJustifyCenter className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Alinhar</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => onAlign('left')}>
                <AlignStartHorizontal className="h-4 w-4 mr-2" /> Alinhar à Esquerda
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAlign('center-h')}>
                <AlignHorizontalJustifyCenter className="h-4 w-4 mr-2" /> Centralizar Horizontal
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAlign('right')}>
                <AlignEndHorizontal className="h-4 w-4 mr-2" /> Alinhar à Direita
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAlign('top')}>
                <AlignStartVertical className="h-4 w-4 mr-2" /> Alinhar ao Topo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAlign('center-v')}>
                <AlignVerticalJustifyCenter className="h-4 w-4 mr-2" /> Centralizar Vertical
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAlign('bottom')}>
                <AlignEndVertical className="h-4 w-4 mr-2" /> Alinhar à Base
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator orientation="vertical" className="h-6 mx-1" />
        </>
      )}

      {/* Grid toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={showGrid ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={onToggleGrid}
          >
            <Grid3X3 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Grade</TooltipContent>
      </Tooltip>

      {/* Safe area toggle + margin config */}
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant={showSafeArea ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
              >
                <ShieldCheck className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Área segura ({safeAreaMargin}mm)</TooltipContent>
        </Tooltip>
        <PopoverContent className="w-52 p-3" align="start">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-foreground">Área segura</p>
            <Button
              variant={showSafeArea ? 'default' : 'outline'}
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={onToggleSafeArea}
            >
              {showSafeArea ? 'Ligado' : 'Desligado'}
            </Button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-muted-foreground">Margem</label>
              <span className="text-[10px] font-mono text-muted-foreground">{safeAreaMargin}mm</span>
            </div>
            <Slider
              value={[safeAreaMargin]}
              onValueChange={([v]) => onSafeAreaMarginChange?.(v)}
              min={1}
              max={10}
              step={0.5}
              className="w-full"
            />
            <div className="flex gap-1 mt-1">
              {[2, 3, 5].map(v => (
                <Button
                  key={v}
                  variant={safeAreaMargin === v ? 'default' : 'outline'}
                  size="sm"
                  className="h-5 text-[9px] px-1.5 flex-1"
                  onClick={() => onSafeAreaMarginChange?.(v)}
                >
                  {v}mm
                </Button>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* AI Layout Suggestion */}
      {onApplyAISuggestion && IA_DISPONIVEL && (
        <>
          <Separator orientation="vertical" className="h-6 mx-1" />
          <AILayoutSuggestion
            elements={elements}
            canvasWidth={cw}
            canvasHeight={ch}
            activeSide={activeSide}
            backgroundImageUrl={backgroundImageUrl}
            templateId={templateId}
            onApplySuggestion={onApplyAISuggestion}
          />
        </>
      )}

      <div className="flex-1" />

      {/* Zoom controls */}
      <div className="flex items-center gap-0.5 bg-muted/50 rounded-md px-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onZoomChange(Math.max(0.5, zoom - 0.25))}>
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs font-mono min-w-[50px]"
          onClick={() => onZoomChange(3)}
        >
          {Math.round(zoom * 100)}%
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onZoomChange(Math.min(5, zoom + 0.25))}>
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};
