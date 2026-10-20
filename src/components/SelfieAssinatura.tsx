import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Camera, Check, Loader2, RotateCcw } from 'lucide-react';

/** Lado maior da foto gravada (px) e qualidade do JPEG: ~30–60 KB por selfie. */
const LADO_MAXIMO = 480;
const QUALIDADE = 0.72;

/**
 * Selfie do colaborador logo depois da rubrica, como prova de quem assinou.
 * Usa a câmera frontal; a foto fica gravada na ficha (data URL JPEG).
 */
export default function SelfieAssinatura({ value, onChange, habilitado, disabled }: {
  value: string;
  onChange: (dataUrl: string) => void;
  /** Só libera depois que o colaborador rubricou. */
  habilitado: boolean;
  disabled?: boolean;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="rounded-lg border border-dashed p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Selfie do funcionário *</p>
          <p className="text-xs text-muted-foreground">
            {value ? 'Foto registrada junto com a assinatura.' : habilitado
              ? 'Logo após a rubrica, tire uma foto do rosto do funcionário.'
              : 'Primeiro a rubrica do funcionário; depois a selfie.'}
          </p>
        </div>
        {value && <img src={value} alt="Selfie do funcionário" className="h-16 w-12 rounded object-cover border" />}
      </div>
      {!disabled && (
        <Button type="button" variant={value ? 'outline' : 'default'} size="sm" disabled={!habilitado}
          onClick={() => setAberto(true)}>
          <Camera className="h-4 w-4 mr-1" /> {value ? 'Tirar de novo' : 'Tirar selfie'}
        </Button>
      )}
      {aberto && <Camera_ onFechar={() => setAberto(false)} onFoto={foto => { onChange(foto); setAberto(false); }} />}
    </div>
  );
}

function Camera_({ onFechar, onFoto }: { onFechar: () => void; onFoto: (dataUrl: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [erro, setErro] = useState('');
  const [pronta, setPronta] = useState(false);
  const [foto, setFoto] = useState('');

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErro('Este navegador não dá acesso à câmera. Use o Chrome/Edge atualizado, pelo endereço https do sistema.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 1280 } }, audio: false,
        });
        if (cancelado) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setPronta(true);
      } catch (e) {
        const nome = (e as DOMException)?.name;
        setErro(nome === 'NotAllowedError'
          ? 'O acesso à câmera foi bloqueado. Libere a câmera para este site (ícone ao lado do endereço) e tente de novo.'
          : nome === 'NotFoundError' ? 'Nenhuma câmera encontrada neste aparelho.' : 'Não foi possível abrir a câmera.');
      }
    })();
    return () => {
      cancelado = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  function capturar() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const escala = Math.min(1, LADO_MAXIMO / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * escala);
    c.height = Math.round(v.videoHeight * escala);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    // Espelhada como a pessoa se vê na tela.
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, c.width, c.height);
    setFoto(c.toDataURL('image/jpeg', QUALIDADE));
  }

  return (
    <Dialog open onOpenChange={o => !o && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Selfie do funcionário</DialogTitle>
          <DialogDescription>
            Rosto inteiro, de frente e sem boné ou óculos escuros. A foto serve só para comprovar quem assinou esta ficha.
          </DialogDescription>
        </DialogHeader>
        <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-lg bg-black">
          {/* O vídeo fica sempre montado: ao "tirar de novo" a câmera continua ligada. */}
          <video ref={videoRef} playsInline muted
            className={`h-full w-full object-cover -scale-x-100 ${foto || erro ? 'hidden' : ''}`} />
          {erro && <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white">{erro}</p>}
          {foto && <img src={foto} alt="Prévia da selfie" className="absolute inset-0 h-full w-full object-cover" />}
          {!pronta && !erro && <Loader2 className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          {foto ? (
            <>
              <Button variant="outline" onClick={() => setFoto('')}><RotateCcw className="h-4 w-4 mr-1" /> Tirar de novo</Button>
              <Button onClick={() => onFoto(foto)}><Check className="h-4 w-4 mr-1" /> Usar esta foto</Button>
            </>
          ) : (
            <Button onClick={capturar} disabled={!pronta || !!erro}><Camera className="h-4 w-4 mr-1" /> Tirar foto</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
