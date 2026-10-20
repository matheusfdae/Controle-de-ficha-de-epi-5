import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import robo from '@/assets/assistente/robo.png';
import { ALVOS_GUIA } from '../../supabase/functions/_shared/assistente';

// Tamanho do robô durante o guia e onde fica a ponta do braço levantado na imagem (fração).
const ALTURA = 150;
const LARGURA = Math.round(ALTURA * 255 / 310);
const PULSO = { x: 0.24, y: 0.38 };
// Mão desenhada na ponta do braço, apontando para a esquerda (o pulso fica à direita).
const MAO_L = 62;
const MAO_A = 39;
const ESPERA_MAX = 8000;

/** `ponto`: para onde a ponta do dedo aponta (borda do alvo); sem ele, o robô não aponta. */
type Pos = { left: number; top: number; espelhado: boolean; ponto?: { x: number; y: number } };
type Caixa = { left: number; top: number; width: number; height: number };

function visivel(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}
const achar = (id: string) => document.querySelector(`[data-guia="${id}"]`);

/** Posiciona o robô ao lado do alvo, com a ponta do dedo encostando nele. */
function posicaoAoLado(r: DOMRect): Pos {
  const vw = window.innerWidth, vh = window.innerHeight;
  const cy = r.top + r.height / 2;
  let left = r.right + 4 + MAO_L - PULSO.x * LARGURA;
  let espelhado = false;
  let ponto = { x: r.right + 2, y: cy };
  if (left + LARGURA > vw - 8) {
    espelhado = true;
    left = r.left - 4 - MAO_L - (1 - PULSO.x) * LARGURA;
    ponto = { x: r.left - 2, y: cy };
  }
  const top = Math.min(Math.max(cy - PULSO.y * ALTURA, 8), vh - ALTURA - 8);
  return { left: Math.min(Math.max(left, 8), vw - LARGURA - 8), top, espelhado, ponto };
}

/** Ângulo da mão (graus, 0 = apontando para a esquerda da imagem sem espelhar), limitado para não torcer. */
function anguloMao(pos: Pos): number {
  if (!pos.ponto) return 0;
  const px = pos.left + (pos.espelhado ? 1 - PULSO.x : PULSO.x) * LARGURA;
  const py = pos.top + PULSO.y * ALTURA;
  let dx = pos.ponto.x - px;
  const dy = pos.ponto.y - py;
  if (pos.espelhado) dx = -dx;
  // Vetor para a esquerda (dx < 0) = 0°; para cima/baixo gira a mão.
  const graus = Math.atan2(dy, -dx) * 180 / Math.PI;
  return Math.max(-70, Math.min(70, -graus));
}

/** Mão branca com punho azul, dedo indicador esticado para a esquerda. */
function Mao({ angulo }: { angulo: number }) {
  return (
    <div className="absolute" style={{
      left: PULSO.x * LARGURA - MAO_L, top: PULSO.y * ALTURA - MAO_A / 2, width: MAO_L, height: MAO_A,
      transform: `rotate(${angulo}deg)`, transformOrigin: '100% 50%', transition: 'transform .5s ease',
    }}>
      <svg viewBox="0 0 48 30" className="w-full h-full animate-cutucar drop-shadow-md" aria-hidden>
        <defs>
          <linearGradient id="guia-luva" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#d9dee8" />
          </linearGradient>
        </defs>
        {/* punho */}
        <rect x="37" y="7" width="11" height="17" rx="4" fill="#24346b" />
        {/* palma fechada */}
        <rect x="19" y="5" width="22" height="21" rx="8" fill="url(#guia-luva)" stroke="#b8c0cf" strokeWidth="1" />
        {/* dedos dobrados */}
        <path d="M21 15.5h7M21 19.5h7M22 23h6" stroke="#b8c0cf" strokeWidth="1.2" strokeLinecap="round" />
        {/* dedo indicador */}
        <rect x="1.5" y="6" width="26" height="8.5" rx="4.25" fill="url(#guia-luva)" stroke="#b8c0cf" strokeWidth="1" />
        {/* polegar */}
        <rect x="22" y="12.5" width="14" height="6" rx="3" fill="url(#guia-luva)" stroke="#b8c0cf" strokeWidth="1" />
      </svg>
    </div>
  );
}

const canto = (): Pos => ({ left: window.innerWidth - LARGURA - 12, top: window.innerHeight - ALTURA - 8, espelhado: false });

/**
 * O robô sai do canto, voa até o ponto da tela e aponta. Se o destino é um botão
 * de outra tela, aponta primeiro o item do menu e espera a tela abrir.
 */
export default function GuiaRobo({ alvo, onFim }: { alvo: string; onFim: () => void }) {
  const { pathname } = useLocation();
  const def = ALVOS_GUIA.find(a => a.id === alvo);
  const passos = useMemo(() => {
    if (!def) return [];
    return def.rota && def.menu && !pathname.startsWith(def.rota) ? [def.menu, def.id] : [def.id];
    // Só no começo do guia: depois a rota muda justamente porque o usuário seguiu o caminho.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo]);
  const [passo, setPasso] = useState(0);
  const [pos, setPos] = useState<Pos>(canto);
  const [caixa, setCaixa] = useState<Caixa | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [concluido, setConcluido] = useState(false);
  const inicio = useRef(Date.now());
  const rolou = useRef<string | null>(null);

  const atual = passos[passo];
  const rotuloAtual = ALVOS_GUIA.find(a => a.id === atual)?.rotulo ?? '';
  const ultimo = passo === passos.length - 1;

  useEffect(() => { inicio.current = Date.now(); setAviso(null); }, [passo]);

  // Acompanha o alvo (a tela pode rolar, abrir o menu, trocar de página).
  useEffect(() => {
    if (!atual || concluido) return;
    const tique = () => {
      // Já chegou na tela do próximo passo por outro caminho: avança.
      const proximo = passos[passo + 1];
      if (proximo && visivel(achar(proximo))) { setPasso(p => p + 1); return; }

      let el = achar(atual);
      let texto: string | null = null;
      if (!visivel(el) && atual.startsWith('menu-') && visivel(achar('abrir-menu'))) {
        el = achar('abrir-menu');
        texto = 'Abra o menu aqui';
      }
      if (!visivel(el)) {
        setCaixa(null);
        if (Date.now() - inicio.current > ESPERA_MAX) {
          setAviso('Não encontrei esse item nesta tela. Talvez você não tenha acesso a ele — fale com o administrador.');
        }
        return;
      }
      if (rolou.current !== atual) {
        rolou.current = atual;
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      }
      const r = el.getBoundingClientRect();
      setCaixa({ left: r.left - 4, top: r.top - 4, width: r.width + 8, height: r.height + 8 });
      setPos(posicaoAoLado(r));
      setAviso(texto);
    };
    // Pequena pausa no começo para o robô sair do canto voando, e não aparecer já no lugar.
    const primeiro = setTimeout(tique, 80);
    const id = setInterval(tique, 250);
    return () => { clearTimeout(primeiro); clearInterval(id); };
  }, [atual, passo, passos, concluido]);

  // Clique no alvo: próximo passo (ou fim).
  useEffect(() => {
    if (!atual || concluido) return;
    const aoClicar = (e: MouseEvent) => {
      const el = achar(atual);
      if (!el || !(e.target instanceof Node) || !el.contains(e.target)) return;
      if (ultimo) {
        setConcluido(true);
        setCaixa(null);
        setTimeout(onFim, 1800);
      } else {
        setPasso(p => p + 1);
      }
    };
    document.addEventListener('click', aoClicar, true);
    return () => document.removeEventListener('click', aoClicar, true);
  }, [atual, ultimo, concluido, onFim]);

  // Esc encerra o guia.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onFim(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onFim]);

  if (!def) return null;

  const fala = concluido ? 'Isso! É aí mesmo.'
    : aviso ?? (ultimo ? `Clique aqui: ${rotuloAtual}` : `Primeiro, clique em "${rotuloAtual}" no menu`);
  const balaoEmbaixo = pos.top < 110;

  return (
    <>
      {caixa && (
        <div className="fixed z-[60] pointer-events-none rounded-lg ring-4 ring-amber-400 shadow-[0_0_0_9999px_rgba(15,23,42,0.25)] transition-all duration-500"
          style={caixa} />
      )}
      <div className="fixed z-[61] pointer-events-none"
        style={{ left: pos.left, top: pos.top, width: LARGURA, height: ALTURA, transition: 'left .9s cubic-bezier(.4,0,.2,1), top .9s cubic-bezier(.4,0,.2,1)' }}>
        <div className="relative w-full h-full animate-flutuar">
          <div className="absolute inset-0" style={{ transform: pos.espelhado ? 'scaleX(-1)' : undefined }}>
            <img src={robo} alt="" draggable={false} className="w-full h-full drop-shadow-2xl" />
            {caixa && pos.ponto && !concluido && <Mao angulo={anguloMao(pos)} />}
          </div>
        </div>
        <div className={cn(
          'absolute left-1/2 -translate-x-1/2 w-56 pointer-events-auto rounded-2xl bg-white dark:bg-slate-900 border shadow-xl px-3 py-2 text-sm text-foreground',
          balaoEmbaixo ? 'top-full mt-1' : 'bottom-full mb-1',
        )}>
          <button onClick={onFim} title="Encerrar o guia (Esc)" className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
          <p className="pr-4 font-medium">{fala}</p>
          {passos.length > 1 && !concluido && (
            <p className="text-[11px] text-muted-foreground mt-0.5">Passo {passo + 1} de {passos.length}</p>
          )}
        </div>
      </div>
    </>
  );
}
