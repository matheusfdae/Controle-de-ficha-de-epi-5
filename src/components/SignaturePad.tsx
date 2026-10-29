import { useRef, useEffect, useState } from 'react';
import SignaturePadLib from 'signature_pad';
import { Button } from '@/components/ui/button';
import { Eraser } from 'lucide-react';

interface SignaturePadProps {
  label: string;
  onSave: (dataUrl: string) => void;
  initialValue?: string;
  disabled?: boolean;
  /**
   * Campo mais alto, para assinar com o dedo no celular (links de assinatura).
   * A imagem que sai continua 3:1: os traços são recortados e centralizados.
   */
  grande?: boolean;
}

/**
 * Recorta os traços e os centraliza numa imagem 3:1 (a caixa da assinatura no
 * PDF), sem esticar. `ratio` é a densidade usada no canvas.
 */
function imagem3por1(canvas: HTMLCanvasElement, pad: SignaturePadLib, ratio: number): string {
  const pontos = pad.toData().flatMap(g => g.points);
  if (!pontos.length) return pad.toDataURL();
  // Metade da largura máxima do traço + folga.
  const m = 6;
  const larg = canvas.width / ratio, alt = canvas.height / ratio;
  const x0 = Math.max(0, Math.min(...pontos.map(p => p.x)) - m);
  const y0 = Math.max(0, Math.min(...pontos.map(p => p.y)) - m);
  const x1 = Math.min(larg, Math.max(...pontos.map(p => p.x)) + m);
  const y1 = Math.min(alt, Math.max(...pontos.map(p => p.y)) + m);
  const w = Math.max(x1 - x0, 1), h = Math.max(y1 - y0, 1);

  const W = 900, H = 300;
  const saida = document.createElement('canvas');
  saida.width = W;
  saida.height = H;
  const ctx = saida.getContext('2d');
  if (!ctx) return pad.toDataURL();
  ctx.fillStyle = 'rgb(255, 255, 255)';
  ctx.fillRect(0, 0, W, H);
  const esc = Math.min((W * 0.94) / w, (H * 0.9) / h);
  ctx.drawImage(canvas, x0 * ratio, y0 * ratio, w * ratio, h * ratio,
    (W - w * esc) / 2, (H - h * esc) / 2, w * esc, h * esc);
  return saida.toDataURL();
}

export default function SignaturePad({ label, onSave, initialValue, disabled, grande }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  // Última imagem do campo (a que este componente mandou para fora ou a que
  // veio em initialValue). Quando ela volta como initialValue não precisa
  // redesenhar: redesenhar a cada traço apagava os traços e borrava a assinatura.
  const ultimaRef = useRef<string | undefined>(undefined);
  // true quando o canvas tem uma imagem carregada (os traços dela não ficam em toData()).
  const temImagemRef = useRef(false);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const [isEmpty, setIsEmpty] = useState(true);

  const carregarImagem = (pad: SignaturePadLib, dataUrl: string) => {
    temImagemRef.current = true;
    pad.fromDataURL(dataUrl).catch(() => {});
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pad = new SignaturePadLib(canvas, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(20, 30, 60)',
      // No tablet o padrão (16 ms) pula pontos e deixa a assinatura "quebrada".
      throttle: 0,
      minDistance: 1,
      minWidth: 1,
      maxWidth: 3,
    });
    padRef.current = pad;
    if (disabled) pad.off();

    // O canvas precisa ter em pixels o tamanho que ocupa na tela (× densidade);
    // senão o traço sai deslocado ou esticado. Medir só ao abrir falha no tablet
    // (tela girando, teclado abrindo, layout montando com largura 0), então
    // remede sempre que o tamanho mudar, sem perder o que já foi assinado.
    let largura = 0;
    let altura = 0;
    let densidade = 1;
    const redimensionar = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (!w || !h || (w === largura && h === altura)) return;
      largura = w;
      altura = h;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      densidade = ratio;
      const tracos = pad.toData();
      canvas.width = w * ratio;
      canvas.height = h * ratio;
      canvas.getContext('2d')?.scale(ratio, ratio);
      pad.clear();
      if (tracos.length && !temImagemRef.current) pad.fromData(tracos);
      else if (ultimaRef.current) carregarImagem(pad, ultimaRef.current);
    };
    redimensionar();
    const observer = new ResizeObserver(redimensionar);
    observer.observe(canvas);

    pad.addEventListener('endStroke', () => {
      setIsEmpty(pad.isEmpty());
      const dataUrl = grande ? imagem3por1(canvas, pad, densidade) : pad.toDataURL();
      ultimaRef.current = dataUrl;
      onSaveRef.current(dataUrl);
    });

    return () => {
      observer.disconnect();
      pad.off();
      padRef.current = null;
    };
  }, [disabled, grande]);

  useEffect(() => {
    const pad = padRef.current;
    if (!pad || !initialValue || initialValue === ultimaRef.current) return;
    ultimaRef.current = initialValue;
    carregarImagem(pad, initialValue);
    setIsEmpty(false);
  }, [initialValue]);

  const clear = () => {
    padRef.current?.clear();
    ultimaRef.current = undefined;
    temImagemRef.current = false;
    setIsEmpty(true);
    onSave('');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">{label}</label>
        {!disabled && (
          <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={isEmpty}>
            <Eraser className="h-4 w-4 mr-1" /> Limpar
          </Button>
        )}
      </div>
      <div className="border rounded-lg overflow-hidden bg-card">
        {/* 3:1 como a caixa da assinatura no PDF (60×20 mm): sem achatar ao imprimir.
            O grande é mais alto na tela, mas exporta 3:1 (imagem3por1). */}
        <canvas
          ref={canvasRef}
          className={`block w-full touch-none select-none ${grande ? 'aspect-[3/2] sm:aspect-[5/2] max-h-[60vh]' : 'aspect-[3/1]'}`}
        />
      </div>
      {!disabled && (
        <p className="text-xs text-muted-foreground">
          {grande
            ? 'Assine com o dedo usando todo o espaço do quadro. Se preferir, vire o celular na horizontal.'
            : 'Assine usando o mouse ou o dedo na tela'}
        </p>
      )}
    </div>
  );
}
