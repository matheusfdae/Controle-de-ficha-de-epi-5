import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { RotateCcw, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatarMoeda } from '../lib/pedidosService';
import { COR_SITUACAO, ROTULO_SITUACAO, type LinhaPosto, type Situacao } from '../lib/gerencial';

/**
 * Vista 3D dos postos (CSS 3D, sem biblioteca): cada posto é uma torre cuja
 * altura é o gasto do mês; a caixa de vidro em volta vai até o teto. A cor diz
 * a situação (sempre acompanhada do rótulo na legenda e no detalhe). Arraste
 * para girar.
 */


const LADO = 46;        // largura da torre
const PASSO = 104;      // distância entre torres
const ALTURA = 210;     // altura da maior torre/teto
const POR_LINHA = 6;

function Caixa({ altura, cor, vidro, lado = LADO, estilo }: { altura: number; cor: string; vidro?: boolean; lado?: number; estilo?: CSSProperties }) {
  const face = (extra: CSSProperties, brilho: number): CSSProperties => ({
    position: 'absolute', backfaceVisibility: 'visible',
    background: vidro ? 'hsl(var(--foreground) / 0.05)' : cor,
    filter: vidro ? undefined : `brightness(${brilho})`,
    border: vidro ? '1px dashed hsl(var(--foreground) / 0.45)' : '1px solid rgba(0,0,0,0.12)',
    ...extra,
  });
  return (
    <div style={{ position: 'absolute', width: lado, height: lado, transformStyle: 'preserve-3d', ...estilo }}>
      {!vidro && <div style={face({ width: lado, height: lado, transform: `translateZ(${altura}px)` }, 1.12)} />}
      {vidro && <div style={face({ width: lado, height: lado, transform: `translateZ(${altura}px)`, background: 'hsl(var(--foreground) / 0.07)' }, 1)} />}
      <div style={face({ width: lado, height: altura, top: lado, transformOrigin: 'top', transform: 'rotateX(90deg)' }, 0.95)} />
      <div style={face({ width: lado, height: altura, top: 0, transformOrigin: 'top', transform: 'rotateX(90deg)' }, 0.8)} />
      <div style={face({ width: altura, height: lado, left: 0, transformOrigin: 'left', transform: 'rotateY(-90deg)' }, 0.7)} />
      <div style={face({ width: altura, height: lado, left: lado, transformOrigin: 'left', transform: 'rotateY(-90deg)' }, 0.85)} />
    </div>
  );
}

export default function Torres3D({ linhas, onEscolher }: { linhas: LinhaPosto[]; onEscolher?: (l: LinhaPosto) => void }) {
  const [angulo, setAngulo] = useState(-35);
  const [foco, setFoco] = useState<{ l: LinhaPosto; x: number; y: number } | null>(null);
  const arrasto = useRef<{ x: number; a: number } | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  const max = Math.max(1, ...linhas.map(l => Math.max(l.gasto, l.teto ?? 0)));
  const h = (v: number) => Math.max(2, (v / max) * ALTURA);
  const colunas = Math.min(POR_LINHA, Math.max(1, linhas.length));
  const fileiras = Math.ceil(linhas.length / colunas);
  const largura = colunas * PASSO, profundidade = fileiras * PASSO;

  const mover = (e: PointerEvent) => {
    if (arrasto.current) setAngulo(arrasto.current.a + (e.clientX - arrasto.current.x) * 0.4);
  };
  const mostrar = (l: LinhaPosto, e: PointerEvent) => {
    const r = caixa.current?.getBoundingClientRect();
    if (r) setFoco({ l, x: e.clientX - r.left, y: e.clientY - r.top });
  };

  if (!linhas.length) return <p className="text-sm text-muted-foreground py-16 text-center">Sem postos com teto ou gasto neste mês.</p>;

  return (
    <div className="space-y-3">
      <div ref={caixa} className="relative h-[460px] overflow-hidden rounded-lg select-none touch-none cursor-grab active:cursor-grabbing
        bg-gradient-to-b from-sky-50 to-white dark:from-slate-900 dark:to-slate-950"
        style={{ perspective: 1400 }}
        onPointerDown={e => { arrasto.current = { x: e.clientX, a: angulo }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
        onPointerMove={mover} onPointerUp={() => { arrasto.current = null; }} onPointerLeave={() => { arrasto.current = null; setFoco(null); }}
        role="img" aria-label={`Vista 3D de ${linhas.length} postos: altura = gasto do mês, caixa tracejada = teto`}>
        <div className="absolute left-1/2 top-[62%]" style={{ transformStyle: 'preserve-3d', transform: `rotateX(58deg) rotateZ(${angulo}deg)` }}>
          {/* Piso */}
          <div style={{
            position: 'absolute', width: largura + 40, height: profundidade + 40, left: -(largura + 40) / 2, top: -(profundidade + 40) / 2,
            background: 'repeating-linear-gradient(0deg, hsl(var(--border)) 0 1px, transparent 1px 26px), repeating-linear-gradient(90deg, hsl(var(--border)) 0 1px, transparent 1px 26px), hsl(var(--card))',
            borderRadius: 12, boxShadow: '0 30px 60px -20px rgba(15,23,42,0.35)', transformStyle: 'preserve-3d',
          }} />
          {linhas.map((l, i) => {
            const x = (i % colunas) * PASSO - largura / 2 + (PASSO - LADO) / 2;
            const y = Math.floor(i / colunas) * PASSO - profundidade / 2 + (PASSO - LADO) / 2;
            const cor = COR_SITUACAO[l.situacao];
            return (
              <div key={l.id} style={{ position: 'absolute', left: x, top: y, transformStyle: 'preserve-3d', cursor: 'pointer' }}
                onPointerMove={e => mostrar(l, e)} onPointerLeave={() => setFoco(null)}
                onClick={() => onEscolher?.(l)}>
                <Caixa altura={h(l.gasto)} cor={cor} />
                {l.teto != null && <Caixa altura={h(l.teto)} cor={cor} vidro lado={LADO + 12} estilo={{ left: -6, top: -6 }} />}
                <div style={{ position: 'absolute', top: LADO + 8, left: -24, width: LADO + 48, textAlign: 'center', fontSize: 10, lineHeight: 1.2,
                  fontWeight: 600, color: 'hsl(var(--foreground))', pointerEvents: 'none' }}>
                  {l.nome.length > 22 ? l.nome.slice(0, 21) + '…' : l.nome}
                </div>
              </div>
            );
          })}
        </div>

        {foco && (
          <div className="pointer-events-none absolute z-10 rounded-md border bg-popover px-3 py-2 text-xs shadow-md text-popover-foreground"
            style={{ left: Math.min(foco.x + 14, (caixa.current?.clientWidth ?? 600) - 220), top: Math.max(8, foco.y - 70), width: 210 }}>
            <p className="font-semibold">{foco.l.nome} <span className="text-muted-foreground font-normal">{foco.l.uf}</span></p>
            <p>Gasto: <strong>{formatarMoeda(foco.l.gasto)}</strong></p>
            <p>Teto: {foco.l.teto == null ? 'sem teto' : formatarMoeda(foco.l.teto)}{foco.l.uso != null && ` · ${foco.l.uso.toLocaleString('pt-BR')}% usado`}</p>
            <p className="flex items-center gap-1 mt-0.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COR_SITUACAO[foco.l.situacao] }} />
              {ROTULO_SITUACAO[foco.l.situacao]}
            </p>
          </div>
        )}

        <div className="absolute right-3 top-3 flex gap-1">
          <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Girar para a esquerda" onClick={() => setAngulo(a => a - 30)}><RotateCcw className="h-4 w-4" /></Button>
          <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Girar para a direita" onClick={() => setAngulo(a => a + 30)}><RotateCw className="h-4 w-4" /></Button>
        </div>
        <p className="absolute left-3 top-3 text-xs text-muted-foreground">Arraste para girar · clique numa torre para ver o posto</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(Object.keys(ROTULO_SITUACAO) as Situacao[]).map(s => (
          <span key={s} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: COR_SITUACAO[s] }} />{ROTULO_SITUACAO[s]}</span>
        ))}
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-dashed border-foreground/50" />Caixa tracejada = teto do mês</span>
        <span>Altura = gasto do mês</span>
      </div>
    </div>
  );
}
