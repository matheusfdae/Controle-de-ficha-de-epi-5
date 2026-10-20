import { useRef, useCallback, useState, useEffect } from 'react';
import { Type, Image, QrCode, Lock, Database } from 'lucide-react';
import { CanvasElement, FIELD_BINDINGS } from './types';

const SAMPLE_NAME_PARTS = ['THIAGO', 'DE', 'LEMOS', 'SILVA', 'SANTOS', 'COSTA', 'LIMA', 'ROCHA'];

function previewNameByMode(mode?: string): string {
  const m = mode || 'short';
  if (m === 'none') return '';
  if (m === 'full') return SAMPLE_NAME_PARTS.slice(0, 4).join(' ');
  if (m.startsWith('parts:')) {
    return m
      .slice(6)
      .split(',')
      .map((n) => parseInt(n, 10))
      .filter((n) => !isNaN(n))
      .map((i) => SAMPLE_NAME_PARTS[i])
      .filter(Boolean)
      .join(' ');
  }
  return SAMPLE_NAME_PARTS.slice(0, 2).join(' ');
}


interface CanvasAreaProps {
  elements: CanvasElement[];
  selectedId: string | null;
  onSelectElement: (id: string | null) => void;
  onUpdateElement: (id: string, updates: Partial<CanvasElement>) => void;
  canvasWidth: number;
  canvasHeight: number;
  onCanvasResize?: (width: number, height: number) => void;
  zoom: number;
  backgroundImageUrl?: string;
  backgroundColor: string;
  activeSide: 'front' | 'back';
  showGrid?: boolean;
  showSafeArea?: boolean;
  safeAreaMargin?: number;
}

const MM_TO_PX = 3.78; // ~96dpi
const SNAP_THRESHOLD = 1.5; // mm

interface SnapGuide {
  orientation: 'horizontal' | 'vertical';
  position: number;
}

function computeSnap(
  draggedEl: { x: number; y: number; width: number; height: number },
  otherElements: CanvasElement[],
  canvasWidth: number,
  canvasHeight: number,
): { snappedX: number; snappedY: number; guides: SnapGuide[] } {
  const guides: SnapGuide[] = [];
  let snappedX = draggedEl.x;
  let snappedY = draggedEl.y;

  const dLeft = draggedEl.x;
  const dRight = draggedEl.x + draggedEl.width;
  const dCenterX = draggedEl.x + draggedEl.width / 2;
  const dTop = draggedEl.y;
  const dBottom = draggedEl.y + draggedEl.height;
  const dCenterY = draggedEl.y + draggedEl.height / 2;

  const canvasCX = canvasWidth / 2;
  const canvasCY = canvasHeight / 2;

  let bestDx = SNAP_THRESHOLD;
  let bestDy = SNAP_THRESHOLD;
  const xGuides: SnapGuide[] = [];
  const yGuides: SnapGuide[] = [];

  const xChecks = [
    { val: dLeft, edge: 'left' },
    { val: dCenterX, edge: 'center' },
    { val: dRight, edge: 'right' },
  ];
  const yChecks = [
    { val: dTop, edge: 'top' },
    { val: dCenterY, edge: 'center' },
    { val: dBottom, edge: 'bottom' },
  ];

  const xTargets = [0, canvasCX, canvasWidth];
  const yTargets = [0, canvasCY, canvasHeight];

  for (const target of xTargets) {
    for (const check of xChecks) {
      const dist = Math.abs(check.val - target);
      if (dist < bestDx) {
        bestDx = dist;
        snappedX = draggedEl.x + (target - check.val);
        xGuides.length = 0;
        xGuides.push({ orientation: 'vertical', position: target });
      }
    }
  }

  for (const target of yTargets) {
    for (const check of yChecks) {
      const dist = Math.abs(check.val - target);
      if (dist < bestDy) {
        bestDy = dist;
        snappedY = draggedEl.y + (target - check.val);
        yGuides.length = 0;
        yGuides.push({ orientation: 'horizontal', position: target });
      }
    }
  }

  for (const other of otherElements) {
    const oXTargets = [other.x, other.x + other.width / 2, other.x + other.width];
    const oYTargets = [other.y, other.y + other.height / 2, other.y + other.height];

    for (const target of oXTargets) {
      for (const check of xChecks) {
        const dist = Math.abs(check.val - target);
        if (dist < bestDx) {
          bestDx = dist;
          snappedX = draggedEl.x + (target - check.val);
          xGuides.length = 0;
          xGuides.push({ orientation: 'vertical', position: target });
        }
      }
    }

    for (const target of oYTargets) {
      for (const check of yChecks) {
        const dist = Math.abs(check.val - target);
        if (dist < bestDy) {
          bestDy = dist;
          snappedY = draggedEl.y + (target - check.val);
          yGuides.length = 0;
          yGuides.push({ orientation: 'horizontal', position: target });
        }
      }
    }
  }

  if (bestDx < SNAP_THRESHOLD) guides.push(...xGuides);
  if (bestDy < SNAP_THRESHOLD) guides.push(...yGuides);

  return { snappedX, snappedY, guides };
}

export const CanvasArea = ({
  elements,
  selectedId,
  onSelectElement,
  onUpdateElement,
  canvasWidth,
  canvasHeight,
  onCanvasResize,
  zoom,
  backgroundImageUrl,
  backgroundColor,
  activeSide,
  showGrid = true,
  showSafeArea = true,
  safeAreaMargin = 3,
}: CanvasAreaProps) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isCanvasResizing, setIsCanvasResizing] = useState(false);
  const [canvasResizeHandle, setCanvasResizeHandle] = useState<string | null>(null);
  const [canvasResizeStart, setCanvasResizeStart] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [elementStart, setElementStart] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);

  const pxWidth = canvasWidth * MM_TO_PX;
  const pxHeight = canvasHeight * MM_TO_PX;

  const visibleElements = elements
    .filter(el => el.side === activeSide)
    .sort((a, b) => a.zIndex - b.zIndex);

  const getCanvasPos = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / zoom / MM_TO_PX,
      y: (e.clientY - rect.top) / zoom / MM_TO_PX,
    };
  }, [zoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent, elementId: string) => {
    e.stopPropagation();
    const el = elements.find(el => el.id === elementId);
    if (!el || el.locked) return;

    onSelectElement(elementId);
    setActiveId(elementId);
    setIsDragging(true);
    const pos = getCanvasPos(e);
    setDragStart(pos);
    setElementStart({ x: el.x, y: el.y, w: el.width, h: el.height });
  }, [elements, getCanvasPos, onSelectElement]);

  const handleResizeDown = useCallback((e: React.MouseEvent, handle: string, elementId: string) => {
    e.stopPropagation();
    const el = elements.find(el => el.id === elementId);
    if (!el || el.locked) return;

    setActiveId(elementId);
    setIsResizing(true);
    setResizeHandle(handle);
    const pos = getCanvasPos(e);
    setDragStart(pos);
    setElementStart({ x: el.x, y: el.y, w: el.width, h: el.height });
  }, [elements, getCanvasPos]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!activeId || (!isDragging && !isResizing)) return;
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / zoom / MM_TO_PX;
      const my = (e.clientY - rect.top) / zoom / MM_TO_PX;
      const dx = mx - dragStart.x;
      const dy = my - dragStart.y;

      if (isDragging) {
        let newX = Math.max(0, Math.min(canvasWidth - elementStart.w, elementStart.x + dx));
        let newY = Math.max(0, Math.min(canvasHeight - elementStart.h, elementStart.y + dy));

        const otherEls = visibleElements.filter(el => el.id !== activeId);
        const { snappedX, snappedY, guides } = computeSnap(
          { x: newX, y: newY, width: elementStart.w, height: elementStart.h },
          otherEls, canvasWidth, canvasHeight,
        );

        newX = Math.max(0, Math.min(canvasWidth - elementStart.w, snappedX));
        newY = Math.max(0, Math.min(canvasHeight - elementStart.h, snappedY));

        setSnapGuides(guides);
        onUpdateElement(activeId, { x: Math.round(newX * 10) / 10, y: Math.round(newY * 10) / 10 });
      }

      if (isResizing && resizeHandle) {
        let { x, y, w, h } = elementStart;
        const minSize = 2;

        if (resizeHandle.includes('e')) w = Math.max(minSize, w + dx);
        if (resizeHandle.includes('s')) h = Math.max(minSize, h + dy);
        if (resizeHandle.includes('w')) { x = elementStart.x + dx; w = Math.max(minSize, elementStart.w - dx); }
        if (resizeHandle.includes('n')) { y = elementStart.y + dy; h = Math.max(minSize, elementStart.h - dy); }

        setSnapGuides([]);
        onUpdateElement(activeId, {
          x: Math.round(Math.max(0, x) * 10) / 10,
          y: Math.round(Math.max(0, y) * 10) / 10,
          width: Math.round(w * 10) / 10,
          height: Math.round(h * 10) / 10,
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      setResizeHandle(null);
      setActiveId(null);
      setSnapGuides([]);
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, activeId, dragStart, elementStart, resizeHandle, zoom, canvasWidth, canvasHeight, onUpdateElement, visibleElements]);

  // Canvas resize handlers
  const handleCanvasResizeDown = useCallback((e: React.MouseEvent, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    setIsCanvasResizing(true);
    setCanvasResizeHandle(handle);
    setCanvasResizeStart({ x: e.clientX, y: e.clientY, w: canvasWidth, h: canvasHeight });
  }, [canvasWidth, canvasHeight]);

  useEffect(() => {
    if (!isCanvasResizing || !canvasResizeHandle || !onCanvasResize) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = (e.clientX - canvasResizeStart.x) / zoom / MM_TO_PX;
      const dy = (e.clientY - canvasResizeStart.y) / zoom / MM_TO_PX;

      let newW = canvasResizeStart.w;
      let newH = canvasResizeStart.h;

      if (canvasResizeHandle.includes('r')) newW = Math.round(Math.max(20, canvasResizeStart.w + dx) * 10) / 10;
      if (canvasResizeHandle.includes('b')) newH = Math.round(Math.max(20, canvasResizeStart.h + dy) * 10) / 10;

      onCanvasResize(newW, newH);
    };

    const handleMouseUp = () => {
      setIsCanvasResizing(false);
      setCanvasResizeHandle(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isCanvasResizing, canvasResizeHandle, canvasResizeStart, zoom, onCanvasResize]);

  // Render ruler marks
  const renderRuler = (axis: 'x' | 'y') => {
    const totalMm = axis === 'x' ? canvasWidth : canvasHeight;
    const marks: JSX.Element[] = [];
    const step = totalMm <= 60 ? 5 : 10;

    for (let i = 0; i <= totalMm; i += step) {
      const pos = i * MM_TO_PX * zoom;
      const isMajor = i % (step * 2) === 0;
      if (axis === 'x') {
        marks.push(
          <div key={i} className="absolute flex flex-col items-center" style={{ left: pos }}>
            <div className={`w-px ${isMajor ? 'h-2.5 bg-muted-foreground/60' : 'h-1.5 bg-muted-foreground/30'}`} />
            {isMajor && <span className="text-[7px] text-muted-foreground/50 mt-0.5 font-mono">{i}</span>}
          </div>
        );
      } else {
        marks.push(
          <div key={i} className="absolute flex items-center" style={{ top: pos }}>
            <div className={`h-px ${isMajor ? 'w-2.5 bg-muted-foreground/60' : 'w-1.5 bg-muted-foreground/30'}`} />
            {isMajor && <span className="text-[7px] text-muted-foreground/50 ml-0.5 font-mono" style={{ writingMode: 'vertical-lr' }}>{i}</span>}
          </div>
        );
      }
    }
    return marks;
  };

  const renderElement = (el: CanvasElement) => {
    const isSelected = selectedId === el.id;
    const style: React.CSSProperties = {
      left: el.x * MM_TO_PX,
      top: el.y * MM_TO_PX,
      width: el.width * MM_TO_PX,
      height: el.height * MM_TO_PX,
      zIndex: el.zIndex,
      opacity: el.opacity ?? 1,
      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    };

    const resizeHandles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'];
    const handlePositions: Record<string, React.CSSProperties> = {
      nw: { top: -4, left: -4, cursor: 'nw-resize' },
      ne: { top: -4, right: -4, cursor: 'ne-resize' },
      sw: { bottom: -4, left: -4, cursor: 'sw-resize' },
      se: { bottom: -4, right: -4, cursor: 'se-resize' },
      n: { top: -4, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' },
      s: { bottom: -4, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' },
      e: { top: '50%', right: -4, transform: 'translateY(-50%)', cursor: 'e-resize' },
      w: { top: '50%', left: -4, transform: 'translateY(-50%)', cursor: 'w-resize' },
    };

    return (
      <div
        key={el.id}
        className={`absolute group ${el.locked ? 'pointer-events-none opacity-60' : 'cursor-move'}`}
        style={style}
        onMouseDown={(e) => handleMouseDown(e, el.id)}
      >
        <div className={`w-full h-full overflow-hidden ${
          isSelected ? 'ring-2 ring-primary shadow-lg' : 'hover:ring-1 hover:ring-primary/40'
        }`} style={{ borderRadius: el.borderRadius ? `${el.borderRadius}px` : 6 }}>
          {el.type === 'text' && (
            <div
              className="w-full h-full flex items-center px-1"
              style={{
                color: el.fontColor || '#1e3a5f',
                fontSize: (el.fontSize || 10) * MM_TO_PX * 0.35,
                fontFamily: el.fontFamily || 'Inter',
                fontWeight: el.fontWeight || 'normal',
                textAlign: el.textAlign || 'left',
                borderRadius: el.borderRadius ?? 0,
                backgroundColor: el.backgroundColor || 'transparent',
                borderColor: el.borderColor || 'transparent',
                borderWidth: el.borderWidth ?? 0,
                borderStyle: el.borderWidth ? 'solid' : 'none',
              }}
            >
              <span className="truncate w-full">
                {el.fieldBinding === 'full_name'
                  ? `${el.staticValue || ''}${previewNameByMode(el.nameDisplayMode)}`
                  : el.staticValue && el.fieldBinding
                    ? `${el.staticValue}${el.fieldBinding.replace('_', ' ')}`
                    : el.staticValue || el.fieldBinding?.replace('_', ' ') || 'Texto'}
              </span>

            </div>
          )}
          {el.type === 'image' && (
            el.staticValue && !el.fieldBinding ? (
              <img src={el.staticValue} alt="img" className="w-full h-full" style={{ objectFit: el.objectFit || 'cover' }} />
            ) : (
              <div className="w-full h-full bg-muted/30 border border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1">
                <Image className="h-5 w-5 text-muted-foreground/50" />
                <span className="text-[8px] text-muted-foreground/50">{el.fieldBinding === 'photo_url' ? 'Foto' : 'Imagem'}</span>
              </div>
            )
          )}
          {el.type === 'qrcode' && (
            <div className="w-full h-full bg-muted/30 border border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1">
              <QrCode className="h-5 w-5 text-muted-foreground/50" />
              <span className="text-[8px] text-muted-foreground/50">QR</span>
            </div>
          )}
          {el.type === 'rectangle' && (
            <div
              className="w-full h-full"
              style={{
                backgroundColor: el.backgroundColor || 'rgba(59,130,246,0.1)',
                borderColor: el.borderColor || 'transparent',
                borderWidth: el.borderWidth || 0,
                borderStyle: 'solid',
                borderRadius: el.borderRadius || 0,
              }}
            />
          )}
          {el.type === 'line' && (
            <div className="w-full h-full flex items-center">
              <div
                className="w-full"
                style={{
                  height: Math.max(1, (el.borderWidth || 1)),
                  backgroundColor: el.borderColor || '#1e3a5f',
                }}
              />
            </div>
          )}
        </div>

        {/* Locked icon */}
        {el.locked && (
          <div className="absolute -top-2 -right-2 bg-muted rounded-full p-0.5">
            <Lock className="h-2.5 w-2.5 text-muted-foreground" />
          </div>
        )}

        {/* Field binding badge */}
        {el.fieldBinding && !el.locked && (
          <div className="absolute -top-3 left-0 bg-primary text-primary-foreground text-[7px] px-1.5 py-0.5 rounded-sm font-semibold flex items-center gap-0.5 z-[100] pointer-events-none whitespace-nowrap">
            <Database className="h-2 w-2" />
            {FIELD_BINDINGS.find(f => f.value === el.fieldBinding)?.label || el.fieldBinding}
          </div>
        )}

        {/* Resize handles */}
        {isSelected && !el.locked && (
          <>
            {resizeHandles.map(handle => (
              <div
                key={handle}
                className="absolute w-2 h-2 bg-primary border border-primary-foreground rounded-sm shadow-sm z-50"
                style={handlePositions[handle]}
                onMouseDown={(e) => handleResizeDown(e, handle, el.id)}
              />
            ))}
          </>
        )}

        {/* Size tooltip on selection */}
        {isSelected && (
          <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-foreground text-background text-[8px] px-1.5 py-0.5 rounded font-mono whitespace-nowrap z-[200] pointer-events-none">
            {Math.round(el.width * 10) / 10} × {Math.round(el.height * 10) / 10} mm
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-auto bg-muted/30 flex flex-col items-center">
      {/* Horizontal ruler */}
      <div className="relative h-5 shrink-0 w-full overflow-hidden bg-card/50 border-b border-border">
        <div className="absolute" style={{ left: 0, marginLeft: 20 }}>
          {renderRuler('x')}
        </div>
      </div>

      <div className="flex flex-1 overflow-auto w-full">
        {/* Vertical ruler */}
        <div className="relative w-5 shrink-0 overflow-hidden bg-card/50 border-r border-border">
          <div className="absolute" style={{ top: 0, marginTop: 20 }}>
            {renderRuler('y')}
          </div>
        </div>

        {/* Canvas area */}
        <div
          className="flex-1 overflow-auto flex items-start justify-center p-8"
          style={showGrid ? {
            backgroundImage: 'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)',
            backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          } : undefined}
        >
          <div className="relative" style={{ padding: '0 20px 20px 0' }}>
          <div
            ref={canvasRef}
            className="relative bg-white shadow-2xl rounded-sm"
            style={{
              width: pxWidth * zoom,
              height: pxHeight * zoom,
              backgroundColor: backgroundColor || '#ffffff',
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) onSelectElement(null);
            }}
          >
            {/* Background image */}
            {backgroundImageUrl && (
              <img
                src={backgroundImageUrl}
                alt="Background"
                className="absolute inset-0 w-full h-full object-cover rounded-sm pointer-events-none"
              />
            )}

            {/* Elements scaled by zoom */}
            <div
              className="absolute inset-0"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: pxWidth, height: pxHeight }}
            >
              {visibleElements.map(renderElement)}

              {/* Snap guides */}
              {snapGuides.map((guide, i) =>
                guide.orientation === 'vertical' ? (
                  <div
                    key={`guide-v-${i}`}
                    className="absolute top-0 pointer-events-none z-[100]"
                    style={{ left: guide.position * MM_TO_PX, width: 1, height: pxHeight, background: 'hsl(var(--primary))', opacity: 0.7 }}
                  />
                ) : (
                  <div
                    key={`guide-h-${i}`}
                    className="absolute left-0 pointer-events-none z-[100]"
                    style={{ top: guide.position * MM_TO_PX, height: 1, width: pxWidth, background: 'hsl(var(--primary))', opacity: 0.7 }}
                  />
                )
              )}
            </div>

            {/* Safe area margin guide */}
            {showSafeArea && safeAreaMargin > 0 && (
              <div
                className="absolute pointer-events-none z-[90]"
                style={{
                  top: safeAreaMargin * MM_TO_PX * zoom,
                  left: safeAreaMargin * MM_TO_PX * zoom,
                  right: safeAreaMargin * MM_TO_PX * zoom,
                  bottom: safeAreaMargin * MM_TO_PX * zoom,
                  border: '1.5px dashed rgba(239, 68, 68, 0.45)',
                  borderRadius: 2,
                }}
              >
                <span
                  className="absolute text-[8px] font-mono px-1 rounded-sm"
                  style={{
                    top: -10,
                    left: 2,
                    color: 'rgba(239, 68, 68, 0.6)',
                    backgroundColor: 'rgba(255,255,255,0.8)',
                  }}
                >
                  {safeAreaMargin}mm
                </span>
              </div>
            )}

            {/* Canvas border */}
            <div className="absolute inset-0 border border-border/50 rounded-sm pointer-events-none" />
          </div>

          {/* Canvas resize handles */}
          {onCanvasResize && (
            <>
              {/* Right edge */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2 h-10 bg-primary/20 hover:bg-primary/50 rounded-full cursor-e-resize transition-colors"
                style={{ left: pxWidth * zoom + 4 }}
                onMouseDown={(e) => handleCanvasResizeDown(e, 'r')}
              />
              {/* Bottom edge */}
              <div
                className="absolute left-1/2 -translate-x-1/2 h-2 w-10 bg-primary/20 hover:bg-primary/50 rounded-full cursor-s-resize transition-colors"
                style={{ top: pxHeight * zoom + 4 }}
                onMouseDown={(e) => handleCanvasResizeDown(e, 'b')}
              />
              {/* Bottom-right corner */}
              <div
                className="absolute w-3 h-3 bg-primary/30 hover:bg-primary/60 rounded-full cursor-se-resize transition-colors"
                style={{ left: pxWidth * zoom + 2, top: pxHeight * zoom + 2 }}
                onMouseDown={(e) => handleCanvasResizeDown(e, 'rb')}
              />
              {/* Dimension label */}
              {isCanvasResizing && (
                <div
                  className="absolute bg-foreground text-background text-[9px] px-2 py-0.5 rounded font-mono whitespace-nowrap z-[200] pointer-events-none"
                  style={{ left: pxWidth * zoom / 2, top: pxHeight * zoom + 16, transform: 'translateX(-50%)' }}
                >
                  {canvasWidth} × {canvasHeight} mm
                </div>
              )}
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};
