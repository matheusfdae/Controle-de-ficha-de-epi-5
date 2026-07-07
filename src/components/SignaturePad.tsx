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
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(ratio, ratio);

    const pad = new SignaturePadLib(canvas, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(20, 30, 60)',
    });

    if (disabled) {
      pad.off();
    }

    if (initialValue) {
      pad.fromDataURL(initialValue);
      setIsEmpty(false);
    }

    pad.addEventListener('endStroke', () => {
      setIsEmpty(pad.isEmpty());
      onSave(pad.toDataURL());
    });

    padRef.current = pad;

    return () => {
      pad.off();
    };
  }, [disabled]);

  useEffect(() => {
    const pad = padRef.current;
    if (!pad) return;
    if (initialValue) {
      pad.fromDataURL(initialValue);
      setIsEmpty(false);
    }
  }, [initialValue]);

  const clear = () => {
    padRef.current?.clear();
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
        <canvas
          ref={canvasRef}
          className="w-full touch-none"
          style={{ height: 150 }}
        />
      </div>
      {!disabled && (
        <p className="text-xs text-muted-foreground">Assine usando o mouse ou o dedo na tela</p>
      )}
    </div>
  );
}
