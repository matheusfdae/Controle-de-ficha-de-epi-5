import { useState } from 'react';
import type { LinhaPosto } from '../lib/gerencial';

/**
 * Pedidos do mês por posto em barras 3D (estilo infográfico, só CSS): altura =
 * número de pedidos, do menor para o maior, número da posição na frente, total
 * e nome do posto acima, ligados por uma linha. Clique abre os pedidos do posto
 * no mês.
 */

const LARG = 64;      // frente da barra
const FUNDO = 16;     // profundidade (topo e lateral)
const PASSO = 136;    // espaço por barra
const ALTURA = 280;   // altura do maior valor
const MAX_BARRAS = 10;

const AZUL = { frente: 'linear-gradient(90deg, #1b5fbf 0%, #2a78d6 55%, #3b8ce8 100%)', topo: '#6aaef5', lado: '#164f9f' };

export default function BarrasPostos3D({ linhas, onEscolher }: { linhas: LinhaPosto[]; onEscolher: (l: LinhaPosto) => void }) {
  const [foco, setFoco] = useState<string | null>(null);
  const ordenadas = [...linhas].sort((a, b) => a.pedidos - b.pedidos || a.linhas - b.linhas);
  const barras = ordenadas.slice(-MAX_BARRAS);
  if (!barras.length) return <p className="text-sm text-muted-foreground py-16 text-center">Nenhum pedido neste mês.</p>;

  const maior = Math.max(...barras.map(b => b.pedidos)) * 1.08;
  const h = (n: number) => Math.max(10, (n / maior) * ALTURA);
  const largura = barras.length * PASSO + 40;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto pb-2">
        <div className="relative mx-auto" style={{ width: largura, height: ALTURA + 210 }}
          role="img" aria-label={`Pedidos do mês de ${barras.length} postos, do menor para o maior`}>
          <div className="absolute left-0 right-0 h-px bg-border" style={{ bottom: 70 }} />

          {barras.map((b, i) => {
            const alt = h(b.pedidos);
            const x = 20 + i * PASSO + (PASSO - LARG - FUNDO) / 2;
            const ativo = foco === b.id;
            return (
              <button key={b.id} type="button" onClick={() => onEscolher(b)}
                onMouseEnter={() => setFoco(b.id)} onMouseLeave={() => setFoco(null)} onFocus={() => setFoco(b.id)} onBlur={() => setFoco(null)}
                aria-label={`${b.nome}: ${b.pedidos} pedido(s) no mês, ${b.linhas} itens. Abrir os pedidos do mês`}
                className="absolute text-left focus-visible:outline-none group"
                style={{ left: x, bottom: 70, width: LARG + FUNDO, height: alt + FUNDO + 130, transition: 'transform .2s', transform: ativo ? 'translateY(-4px)' : undefined }}>
                {/* Total e nome, ligados à barra por uma linha */}
                <span className="absolute left-[-16px] w-[124px] rounded-md bg-card/95 px-1.5 py-1 z-10" style={{ bottom: alt + FUNDO + 40 }}>
                  <span className="block text-2xl font-extrabold tabular-nums leading-none text-[#1f6fd1] dark:text-[#5aa2f0]">
                    {b.pedidos} <span className="text-xs font-semibold">pedido{b.pedidos === 1 ? '' : 's'}</span>
                  </span>
                  <span className="mt-1 block border-b border-current pb-1 text-[10.5px] leading-tight text-muted-foreground line-clamp-2">{b.nome}</span>
                </span>
                <svg className="absolute overflow-visible pointer-events-none" style={{ left: 0, bottom: alt + FUNDO, width: 1, height: 1 }}>
                  <line x1={-16 + 100} y1={-40} x2={LARG / 2 + FUNDO / 2} y2={-4} stroke="currentColor" strokeWidth={1} className="text-[#2a78d6]" />
                </svg>

                {/* Barra: frente, topo e lateral */}
                <span className="absolute left-0 bottom-0 shadow-[0_10px_18px_-10px_rgba(15,40,90,0.6)]"
                  style={{ width: LARG, height: alt, background: AZUL.frente, filter: ativo ? 'brightness(1.1)' : undefined }}>
                  <span className="absolute bottom-2 left-0 right-0 text-center text-lg font-extrabold text-white/95 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                </span>
                <span className="absolute left-0" style={{ bottom: alt, width: LARG, height: FUNDO, background: AZUL.topo, transform: 'skewX(-45deg)', transformOrigin: 'bottom left' }} />
                <span className="absolute bottom-0" style={{ left: LARG, width: FUNDO, height: alt, background: AZUL.lado, transform: 'skewY(-45deg)', transformOrigin: 'bottom left' }} />
                {/* Reflexo */}
                <span className="absolute left-0" style={{ top: '100%', width: LARG, height: Math.min(alt, 50), background: AZUL.frente, opacity: 0.18,
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
                <p><strong>{b.pedidos}</strong> pedido(s) · {b.linhas} itens</p>
                <p>{b.atendidos} atendido(s){b.parciais > 0 && `, ${b.parciais} com entrega parcial`} · {b.emAndamento} em andamento</p>
                <p className="mt-0.5 text-primary">Clique para ver os pedidos do mês</p>
              </div>
            );
          })()}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Altura = pedidos feitos no mês (fora os cancelados).
        {ordenadas.length > barras.length && ` Mostrando os ${barras.length} postos que mais pediram (de ${ordenadas.length}); todos estão no ranking abaixo.`}
      </p>
    </div>
  );
}
