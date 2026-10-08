import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface PontoMapa {
  chave: string;
  nome: string;
  latitude: number;
  longitude: number;
  /** Texto extra no balão (ex.: "162 fichas · 1 pendente"). */
  detalhe?: string;
  /** Define o tamanho da estrela (ex.: nº de fichas). */
  peso?: number;
}

interface Props {
  pontos: PontoMapa[];
  /** Clique no marcador (ex.: abrir as fichas do posto). */
  onSelecionar?: (chave: string) => void;
  /** Modo escolher posição: clique no mapa devolve a coordenada. */
  onEscolherPosicao?: (lat: number, lng: number) => void;
  /** Altura em px ou CSS (ex.: '70vh'). */
  altura?: number | string;
  className?: string;
  /** Relógio com a data e a hora de agora no canto do mapa (padrão: sim, exceto ao escolher posição). */
  mostrarRelogio?: boolean;
  /** Legenda com a lista de postos do mapa (padrão: sim, exceto ao escolher posição). */
  mostrarLegenda?: boolean;
}

/** Lista dos postos do mapa (com nº de fichas); clicar leva o mapa até a estrela. */
function Legenda({ pontos, onIr }: { pontos: PontoMapa[]; onIr: (chave: string) => void }) {
  const [aberta, setAberta] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Rolar/clicar na legenda não arrasta nem dá zoom no mapa.
    if (!ref.current) return;
    L.DomEvent.disableClickPropagation(ref.current);
    L.DomEvent.disableScrollPropagation(ref.current);
  }, []);
  const ordenados = [...pontos].sort((a, b) => (b.peso ?? 0) - (a.peso ?? 0) || a.nome.localeCompare(b.nome));
  const totalFichas = pontos.reduce((s, p) => s + (p.peso ?? 0), 0);
  return (
    <div ref={ref}
      className={`absolute right-2 top-[4.25rem] z-[1000] flex w-64 max-w-[calc(100%-1rem)] flex-col vidro rounded-md border ${aberta ? 'bottom-7' : ''}`}>
      <button type="button" onClick={() => setAberta(a => !a)}
        className="flex items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm font-semibold text-foreground"
        aria-expanded={aberta}>
        <span>{pontos.length} posto{pontos.length === 1 ? '' : 's'} no mapa
          <span className="block text-xs font-normal text-muted-foreground">{totalFichas} fichas</span>
        </span>
        <span className="text-xs font-normal text-muted-foreground">{aberta ? 'recolher ▲' : 'abrir ▼'}</span>
      </button>
      {aberta && (
        <ol className="min-h-0 flex-1 overflow-y-auto py-1 text-sm">
          {ordenados.map(p => (
            <li key={p.chave}>
              <button type="button" onClick={() => onIr(p.chave)}
                className="flex w-full items-center justify-between gap-2 px-3 py-1 text-left hover:bg-muted">
                <span className="truncate" title={p.nome}>{p.nome}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{p.peso ?? 0}</span>
              </button>
            </li>
          ))}
          {ordenados.length === 0 && <li className="px-3 py-2 text-muted-foreground">Nenhum posto com localização.</li>}
        </ol>
      )}
    </div>
  );
}

/** Data e hora de agora, atualizadas a cada segundo. */
function Relogio() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const data = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = agora.toLocaleTimeString('pt-BR');
  return (
    <div aria-live="off"
      className="pointer-events-none absolute right-2 top-2 z-[1000] vidro rounded-md border px-3 py-1.5 text-right">
      <div className="text-lg font-bold tabular-nums leading-tight text-foreground">{hora}</div>
      <div className="text-xs capitalize text-muted-foreground">{data}</div>
    </div>
  );
}

// Centro do Brasil Central (DF/GO), usado quando ainda não há nenhum ponto.
const CENTRO_PADRAO: L.LatLngTuple = [-15.79, -47.88];

/** Ícone de estrela (SVG) centralizado na coordenada. O nome aparece no balão ao passar o mouse. */
function iconeEstrela(tamanho: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}">
    <path d="M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.9l-6.4 3.5 1.4-7.1-5.3-5 7.2-.9z"
      fill="#2563eb" stroke="#1e3a8a" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
  return L.divIcon({
    html: svg, className: 'mapa-postos-estrela',
    iconSize: [tamanho, tamanho], iconAnchor: [tamanho / 2, tamanho / 2], tooltipAnchor: [0, -tamanho / 2],
  });
}

const escapar = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Mapa OpenStreetMap (Leaflet) com uma estrela por posto (maior = mais fichas). Sem chave de API. */
export default function MapaPostos({
  pontos, onSelecionar, onEscolherPosicao, altura = 'max(450px, 70vh)', className,
  mostrarRelogio = !onEscolherPosicao, mostrarLegenda = !onEscolherPosicao,
}: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const camadaRef = useRef<L.LayerGroup | null>(null);
  const marcadoresRef = useRef(new Map<string, L.Marker>());
  const callbacks = useRef({ onSelecionar, onEscolherPosicao });
  callbacks.current = { onSelecionar, onEscolherPosicao };

  useEffect(() => {
    if (!divRef.current || mapaRef.current) return;
    const mapa = L.map(divRef.current, { center: CENTRO_PADRAO, zoom: 10, scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapa);
    mapa.on('click', e => callbacks.current.onEscolherPosicao?.(
      Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))));
    // Roda do mouse só depois de clicar no mapa (não "sequestra" a rolagem da página).
    mapa.on('focus', () => mapa.scrollWheelZoom.enable());
    mapa.on('blur', () => mapa.scrollWheelZoom.disable());
    camadaRef.current = L.layerGroup().addTo(mapa);
    mapaRef.current = mapa;
    // Dentro de diálogo o container ainda está animando ao montar: recalcula o tamanho.
    const t = setTimeout(() => mapa.invalidateSize(), 250);
    return () => { clearTimeout(t); mapa.remove(); mapaRef.current = null; };
  }, []);

  useEffect(() => {
    const mapa = mapaRef.current;
    const camada = camadaRef.current;
    if (!mapa || !camada) return;
    camada.clearLayers();
    marcadoresRef.current.clear();
    const maxPeso = Math.max(1, ...pontos.map(p => p.peso ?? 1));
    for (const p of pontos) {
      const tamanho = Math.round(24 + 20 * Math.sqrt((p.peso ?? 1) / maxPeso));
      const marcador = L.marker([p.latitude, p.longitude], {
        icon: iconeEstrela(tamanho), keyboard: false, riseOnHover: true,
      }).bindTooltip(`<strong>${escapar(p.nome)}</strong>${p.detalhe ? `<br>${escapar(p.detalhe)}` : ''}`
        + (callbacks.current.onSelecionar ? '<br><em>Clique para ver as fichas</em>' : ''));
      if (callbacks.current.onSelecionar) marcador.on('click', () => callbacks.current.onSelecionar?.(p.chave));
      marcador.addTo(camada);
      marcadoresRef.current.set(p.chave, marcador);
    }
    if (pontos.length === 1) {
      mapa.setView([pontos[0].latitude, pontos[0].longitude], Math.max(mapa.getZoom(), 15));
    } else if (pontos.length > 1) {
      mapa.fitBounds(L.latLngBounds(pontos.map(p => [p.latitude, p.longitude] as L.LatLngTuple)), { padding: [30, 30], maxZoom: 15 });
    }
  }, [pontos]);

  return (
    <div className={`relative ${className ?? ''}`}>
      <div ref={divRef} tabIndex={0} style={{ height: altura }}
        className={`w-full rounded-lg border z-0 ${onEscolherPosicao ? 'cursor-crosshair' : ''}`} />
      {mostrarRelogio && <Relogio />}
      {mostrarLegenda && (
        <Legenda pontos={pontos} onIr={chave => {
          const m = marcadoresRef.current.get(chave);
          if (!m || !mapaRef.current) return;
          mapaRef.current.setView(m.getLatLng(), Math.max(mapaRef.current.getZoom(), 15));
          m.openTooltip();
        }} />
      )}
    </div>
  );
}
