import { Type, Image, QrCode, Square, Minus, Layers, Trash2, Copy, Lock, Unlock, ChevronUp, ChevronDown, GripVertical, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CanvasElement, ELEMENT_PRESETS, FIELD_BINDINGS } from './types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

const ICONS: Record<string, any> = { Type, Image, QrCode, Square, Minus };
const TYPE_LABELS: Record<string, string> = {
  text: 'Texto',
  image: 'Imagem',
  qrcode: 'QR Code',
  rectangle: 'Retângulo',
  line: 'Linha',
};

// Quick field presets: pre-configured elements with field bindings
const QUICK_FIELDS = [
  { label: 'Foto', type: 'image' as const, fieldBinding: 'photo_url', width: 25, height: 30, icon: '📷' },
  { label: 'Nome Completo', type: 'text' as const, fieldBinding: 'full_name', width: 35, height: 5, fontSize: 8, fontWeight: 'bold', icon: '👤' },
  { label: 'Cargo / Função', type: 'text' as const, fieldBinding: 'role', width: 30, height: 4, fontSize: 6, icon: '💼' },
  { label: 'CNV', type: 'text' as const, fieldBinding: 'cnv', width: 30, height: 4, fontSize: 6, staticValue: 'CNV: ', icon: '📋' },
  { label: 'Matrícula', type: 'text' as const, fieldBinding: 'employee_id', width: 30, height: 4, fontSize: 6, staticValue: 'MAT: ', icon: '🔢' },
  { label: 'RG', type: 'text' as const, fieldBinding: 'rg', width: 30, height: 4, fontSize: 6, staticValue: 'RG: ', icon: '🪪' },
  { label: 'CPF', type: 'text' as const, fieldBinding: 'cpf', width: 30, height: 4, fontSize: 6, staticValue: 'CPF: ', icon: '🪪' },
  { label: 'Tipo Sanguíneo', type: 'text' as const, fieldBinding: 'blood_type', width: 25, height: 4, fontSize: 5, staticValue: 'TIPO SANG: ', icon: '🩸' },
  { label: 'Empresa', type: 'text' as const, fieldBinding: 'company', width: 35, height: 4, fontSize: 5, icon: '🏢' },
  { label: 'Validade', type: 'text' as const, fieldBinding: 'valid_until', width: 20, height: 4, fontSize: 5, icon: '📅' },
  { label: 'Data Emissão', type: 'text' as const, fieldBinding: 'issue_date', width: 20, height: 4, fontSize: 5, icon: '📅' },
  { label: 'QR Code', type: 'qrcode' as const, fieldBinding: 'qr_value', width: 15, height: 15, icon: '📱' },
  { label: 'Telefone', type: 'text' as const, fieldBinding: 'phone', width: 30, height: 4, fontSize: 5, staticValue: 'TEL: ', icon: '📞' },
  { label: 'Local de Trabalho', type: 'text' as const, fieldBinding: 'address', width: 40, height: 4, fontSize: 5, icon: '📍' },
];

interface ElementPanelProps {
  elements: CanvasElement[];
  selectedId: string | null;
  activeSide: 'front' | 'back';
  onSelectElement: (id: string | null) => void;
  onDeleteElement: (id: string) => void;
  onDuplicateElement: (id: string) => void;
  onUpdateElement: (id: string, updates: Partial<CanvasElement>) => void;
  onAddElement: (type: string) => void;
  onAddMappedElement?: (element: Omit<CanvasElement, 'id'>) => void;
}

export const ElementPanel = ({
  elements,
  selectedId,
  activeSide,
  onSelectElement,
  onDeleteElement,
  onDuplicateElement,
  onUpdateElement,
  onAddElement,
  onAddMappedElement,
}: ElementPanelProps) => {
  const sideElements = elements
    .filter(el => el.side === activeSide)
    .sort((a, b) => b.zIndex - a.zIndex);

  const moveZIndex = (id: string, direction: 'up' | 'down') => {
    const el = elements.find(e => e.id === id);
    if (!el) return;
    onUpdateElement(id, { zIndex: el.zIndex + (direction === 'up' ? 1 : -1) });
  };

  const mappedFields = new Set(elements.filter(e => e.fieldBinding).map(e => e.fieldBinding));

  const handleAddQuickField = (field: typeof QUICK_FIELDS[0]) => {
    if (onAddMappedElement) {
      onAddMappedElement({
        type: field.type,
        x: 5,
        y: 5 + (elements.length * 3) % 50,
        width: field.width,
        height: field.height,
        fieldBinding: field.fieldBinding,
        staticValue: field.staticValue,
        fontFamily: 'Arial',
        fontSize: field.fontSize || 10,
        fontWeight: field.fontWeight || 'normal',
        fontColor: '#1e3a5f',
        textAlign: 'center',
        opacity: 1,
        zIndex: elements.length,
        side: activeSide,
      });
    }
  };

  return (
    <div className="w-60 bg-card border-r border-border flex flex-col h-full">
      {/* Add elements */}
      <div className="p-3 border-b border-border">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Adicionar Elemento</p>
        <div className="grid grid-cols-1 gap-1">
          {ELEMENT_PRESETS.map(preset => {
            const Icon = ICONS[preset.icon];
            return (
              <Button
                key={preset.type}
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-start gap-2 text-xs font-medium hover:bg-primary/10 hover:text-primary transition-all"
                onClick={() => onAddElement(preset.type)}
              >
                <Icon className="h-3.5 w-3.5" />
                {preset.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Quick Fields - mapped data from spreadsheet */}
      {onAddMappedElement && (
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-1.5 mb-2">
            <Database className="h-3 w-3 text-primary" />
            <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">Campos do Colaborador</p>
          </div>
          <p className="text-[9px] text-muted-foreground mb-2">Clique para mapear dados dos colaboradores</p>
          <div className="grid grid-cols-1 gap-0.5 max-h-[200px] overflow-y-auto">
            {QUICK_FIELDS.map(field => {
              const alreadyMapped = mappedFields.has(field.fieldBinding);
              return (
                <Button
                  key={field.fieldBinding}
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full justify-start gap-2 text-[11px] font-medium transition-all hover:bg-primary/10 hover:text-primary"
                  onClick={() => handleAddQuickField(field)}
                >
                  <span className="text-xs">{field.icon}</span>
                  <span>{field.label}</span>
                  {alreadyMapped && (
                    <Badge variant="outline" className="ml-auto text-[8px] h-4 px-1 border-green-500/30 text-green-600">
                      ✓
                    </Badge>
                  )}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Layers */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Layers className="h-3 w-3 text-muted-foreground" />
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Camadas ({sideElements.length})
          </p>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-0.5">
          {sideElements.length === 0 ? (
            <div className="text-center py-10 px-4">
              <Layers className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">Nenhum elemento adicionado</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Use os botões acima ou a toolbar</p>
            </div>
          ) : (
            sideElements.map((el) => {
              const isActive = selectedId === el.id;
              const fieldLabel = el.fieldBinding
                ? FIELD_BINDINGS.find(f => f.value === el.fieldBinding)?.label
                : null;
              return (
                <div
                  key={el.id}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs cursor-pointer transition-all group/layer ${
                    isActive
                      ? 'bg-primary/10 border border-primary/30 text-foreground'
                      : 'hover:bg-muted/60 text-muted-foreground border border-transparent'
                  }`}
                  onClick={() => onSelectElement(el.id)}
                >
                  <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                  {(() => {
                    const Icon = ICONS[ELEMENT_PRESETS.find(p => p.type === el.type)?.icon || 'Square'];
                    return <Icon className="h-3 w-3 shrink-0" />;
                  })()}
                  <div className="flex-1 truncate min-w-0">
                    <span className="font-medium text-[11px] truncate block">
                      {el.staticValue?.slice(0, 15) || fieldLabel || TYPE_LABELS[el.type]}
                    </span>
                    {fieldLabel && (
                      <span className="text-[9px] text-primary/70 block truncate">📊 {fieldLabel}</span>
                    )}
                  </div>

                  {el.locked && <Lock className="h-2.5 w-2.5 shrink-0 text-muted-foreground/50" />}

                  <div className={`flex items-center gap-0 shrink-0 ${isActive ? 'visible' : 'invisible group-hover/layer:visible'}`}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); moveZIndex(el.id, 'up'); }}>
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-[10px]">Mover para cima</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); moveZIndex(el.id, 'down'); }}>
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-[10px]">Mover para baixo</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); onUpdateElement(el.id, { locked: !el.locked }); }}>
                          {el.locked ? <Lock className="h-2.5 w-2.5" /> : <Unlock className="h-2.5 w-2.5" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-[10px]">{el.locked ? 'Desbloquear' : 'Bloquear'}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); onDuplicateElement(el.id); }}>
                          <Copy className="h-2.5 w-2.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-[10px]">Duplicar</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDeleteElement(el.id); }}>
                          <Trash2 className="h-2.5 w-2.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-[10px]">Remover</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
};