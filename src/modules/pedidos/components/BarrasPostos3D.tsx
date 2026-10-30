import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatarMoeda } from '../lib/pedidosService';
import { ROTULO_SITUACAO, type LinhaPosto } from '../lib/gerencial';

/**
 * Uso do teto por posto em barras 3D (estilo infográfico, só CSS): altura =
 * % do teto usado no mês, da menor para a maior, número da posição na frente,
 * percentual e nome do posto acima, ligados por uma linha. Linha tracejada =
 * teto (100%). Acima do teto: barra vermelha com alerta. Clique abre os pedidos
 * do posto no mês.
 */

const LARG = 64;      // frente da barra
const FUNDO = 16;     // profundidade (topo e lateral)
const PASSO = 136;    // espaço por barra
const ALTURA = 280;   // altura do maior valor
const MAX_BARRAS = 10;

const AZUL = { frente: 'linear-gradient(90deg, #1b5fbf 0%, #2a78d6 55%, #3b8ce8 100%)', topo: '#6aaef5', lado: '#164f9f' };
const VERMELHO = { frente: 'linear-gradient(90deg, #a92b2b 0%, #d03b3b 55%, #e05252 100%)', topo: '#f08a8a', lado: '#8f2323' };

export default function BarrasPostos3D({ linhas, onEscolher }: { linhas: LinhaPosto[]; onEscolher: (l: LinhaPosto) => void }) {
  const [foco, setFoco] = useState<string | null>(null);
  const comTeto = linhas.filter(l => l.uso != null).sort((a, b) => (a.uso ?? 0) - (b.uso ?? 0));
  const barras = comTeto.slice(-MAX_BARRAS);
  if (!barras.length) return <p className="text-sm text-muted-foreground py-16 text-center">Nenhum posto com teto neste mês.</p>;

  const escala = Math.max(100, ...barras.map(b => b.uso ?? 0)) * 1.08;
  const h = (uso: number) => Math.max(10, (uso / escala) * ALTURA);
  const yTeto = h(100);
  const largura = barras.length * PASSO + 40;
  const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto pb-2">
        <div className="relative mx-auto" style={{ width: largura, height: ALTURA + 210 }}
          role="img" aria-label={`Uso do teto de ${barras.length} postos, do menor para o maior`}>
          {/* Teto (100%) */}
          <div className="absolute left-0 right-0 border-t-2 border-dashed border-foreground/40" style={{ bottom: 70 + yTeto }}>
            <span className="absolute -top-5 left-0 text-[11px] font-medium text-muted-foreground">Teto (100%)</span>
          </div>
          {/* Chão com reflexo */}
          <div className="absolute left-0 right-0 h-px bg-border" style={{ bottom: 70 }} />

          {barras.map((b, i) => {
            const alt = h(b.uso ?? 0);
            const cor = b.situacao === 'acima' ? VERMELHO : AZUL;
            const x = 20 + i * PASSO + (PASSO - LARG - FUNDO) / 2;
            const ativo = foco === b.id;
            return (
              <button key={b.id} type="button" onClick={() => onEscolher(b)}
                onMouseEnter={() => setFoco(b.id)} onMouseLeave={() => setFoco(null)} onFocus={() => setFoco(b.id)} onBlur={() => setFoco(null)}
                aria-label={`${b.nome}: ${pct(b.uso ?? 0)} do teto, ${formatarMoeda(b.gasto)} de ${formatarMoeda(b.teto)}. Abrir os pedidos do mês`}
                className="absolute text-left focus-visible:outline-none group"
                style={{ left: x, bottom: 70, width: LARG + FUNDO, height: alt + FUNDO + 130, transition: 'transform .2s', transform: ativo ? 'translateY(-4px)' : undefined }}>
                {/* Valor e nome, ligados à barra por uma linha */}
                <span className="absolute left-[-16px] w-[124px] rounded-md bg-card/95 px-1.5 py-1 z-10" style={{ bottom: alt + FUNDO + 40 }}>
                  <span className={`flex items-center gap-1 text-2xl font-extrabold tabular-nums leading-none ${b.situacao === 'acima' ? 'text-red-600 dark:text-red-400' : 'text-[#1f6fd1] dark:text-[#5aa2f0]'}`}>
                    {b.situacao === 'acima' && <AlertTriangle className="h-4 w-4" />}{pct(b.uso ?? 0)}
                  </span>
                  <span className="mt-1 block border-b border-current pb-1 text-[10.5px] leading-tight text-muted-foreground line-clamp-2">{b.nome}</span>
                </span>
                <svg className="absolute overflow-visible pointer-events-none" style={{ left: 0, bottom: alt + FUNDO, width: 1, height: 1 }}>
                  <line x1={-16 + 100} y1={-40} x2={LARG / 2 + FUNDO / 2} y2={-4} stroke="currentColor" strokeWidth={1}
                    className={b.situacao === 'acima' ? 'text-red-500' : 'text-[#2a78d6]'} />
                </svg>

                {/* Barra: frente, topo e lateral */}
                <span className="absolute left-0 bottom-0 shadow-[0_10px_18px_-10px_rgba(15,40,90,0.6)]"
                  style={{ width: LARG, height: alt, background: cor.frente, filter: ativo ? 'brightness(1.1)' : undefined }}>
                  <span className="absolute bottom-2 left-0 right-0 text-center text-lg font-extrabold text-white/95 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                </span>
                <span className="absolute left-0" style={{ bottom: alt, width: LARG, height: FUNDO, background: cor.topo, transform: 'skewX(-45deg)', transformOrigin: 'bottom left' }} />
                <span className="absolute bottom-0" style={{ left: LARG, width: FUNDO, height: alt, background: cor.lado, transform: 'skewY(-45deg)', transformOrigin: 'bottom left' }} />
                {/* Reflexo */}
                <span className="absolute left-0" style={{ top: '100%', width: LARG, height: Math.min(alt, 50), background: cor.frente, opacity: 0.18,
                  maskImage: 'linear-gradient(to bottom, black, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, black, transparent)' }} />
              </button>
            );
          })}

          {/* Detalhe ao passar o mouse */}
          {foco && (() => {
            const i = barras.findIndex(b => b.id === foco);
            const b = barras[i];
            return (
              <div className="pointer-events-none absolute z-10 w-56 rounded-md border bg-popover px-3 py-2 text-xs shadow-md text-popover-foreground"
                style={{ left: Math.min(20 + i * PASSO + LARG + 24, largura - 230), bottom: 12 }}>
                <p className="font-semibold">{b.nome} <span className="font-normal text-muted-foreground">{b.uf}</span></p>
                <p>Gasto: <strong>{formatarMoeda(b.gasto)}</strong> de {formatarMoeda(b.teto)}</p>
                <p>{b.pedidos} pedido(s) · {ROTULO_SITUACAO[b.situacao]}</p>
                <p className="mt-0.5 text-primary">Clique para ver os pedidos do mês</p>
              </div>
            );
          })()}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Altura = % do teto usado no mês · linha tracejada = teto · vermelho = acima do teto.
        {comTeto.length > barras.length && ` Mostrando os ${barras.length} postos com maior uso (de ${comTeto.length}); todos estão no ranking abaixo.`}
        {linhas.length > comTeto.length && ` ${linhas.length - comTeto.length} posto(s) sem teto ficam só no ranking.`}
      </p>
    </div>
  );
}
