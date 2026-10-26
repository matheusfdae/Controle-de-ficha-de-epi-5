import { useRef, useEffect, useState } from 'react';
import SignaturePadLib from 'signature_pad';
import { Button } from '@/components/ui/button';
import { Eraser } from 'lucide-react';

interface SignaturePadProps {
  label: string;
  onSave: (dataUrl: string) => void;
  initialValue?: string;
  disabled?: boolean;
}

export default function SignaturePad({ label, onSave, initialValue, disabled }: SignaturePadProps) {
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
    const redimensionar = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (!w || !h || (w === largura && h === altura)) return;
      largura = w;
      altura = h;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
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
      const dataUrl = pad.toDataURL();
      ultimaRef.current = dataUrl;
      onSaveRef.current(dataUrl);
    });

    return () => {
      observer.disconnect();
      pad.off();
      padRef.current = null;
    };
  }, [disabled]);

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
        {/* 3:1 como a caixa da assinatura no PDF (60×20 mm): sem achatar ao imprimir. */}
        <canvas
          ref={canvasRef}
          className="block w-full aspect-[3/1] touch-none select-none"
        />
      </div>
      {!disabled && (
        <p className="text-xs text-muted-foreground">Assine usando o mouse ou o dedo na tela</p>
      )}
    </div>
  );
}
