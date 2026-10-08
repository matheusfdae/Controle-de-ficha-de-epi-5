// Planilha GEO (localização dos postos, uma aba por filial) -> postos com
// coordenada. Cada linha da planilha é um posto de TRABALHO (cliente + local
// + função + turno); aqui vira um posto de LUGAR (cliente + local).

export interface LinhaGeo {
  aba: string;
  nome: string;
  latitude: unknown;
  longitude: unknown;
  /** Linha marcada em vermelho na planilha = coordenada pendente/errada. */
  vermelha: boolean;
}

export interface PostoGeo {
  nome: string;
  uf: string;
  latitude: number;
  longitude: number;
  /** Nomes originais da planilha que viraram este posto. */
  origem: string[];
  /** Coordenada que merece conferência (repetida em outro posto, fora do estado). */
  avisos: string[];
}

export interface ResultadoGeo {
  postos: PostoGeo[];
  ignoradas: { nome: string; motivo: string }[];
}

// Onde começa a função/turno no nome ("... - VIGILANTE - DIU 12H - C/INTRA").
// Sem \b no começo de VIGILANTE: a planilha tem "INDUSTRVIGILANTE", "VIGILANTE12H".
const INICIO_FUNCAO = new RegExp([
  'VIGILANTE', 'VIGIL[AÂ]NCIA', String.raw`\bVIG\b\.?`, 'BOMBEIRO', 'BRIGADISTA', String.raw`\bBRIGADA\b`,
  'PORTEIRO', 'PORTARIA', 'RECEPCIONISTA', 'INSPETOR', String.raw`\bASG\b`, String.raw`\bLIDER\b`,
  'SUPERVISOR', 'CONTROLADOR', 'OPERADOR DE', 'MONITORAMENTO', 'RASTREAMENTO',
  // turno/escala quando vem antes da função ("... - 12HRS DIU - S/INTRA")
  String.raw`\b(DIU|NOT|DIURNO|NOTURNO)\b`, String.raw`\b\d{1,2}\s?H(RS)?\b`, String.raw`\b12X36\b`, String.raw`\b5X2\b`,
].join('|'), 'i');

// Retângulo aproximado de cada estado (lat mín, lat máx, lng mín, lng máx).
const LIMITES_UF: Record<string, [number, number, number, number]> = {
  DF: [-16.06, -15.49, -48.29, -47.30],
  GO: [-19.50, -12.39, -53.25, -45.90],
  MT: [-18.05, -7.34, -61.64, -50.22],
  SP: [-25.32, -19.77, -53.11, -44.16],
};

/** "CAESB - SIA -BOMBEIRO BRIGADISTA - DIU 12H - C/INTRA" -> "CAESB - SIA". */
export function limparNomePosto(original: string): string {
  let nome = original.replace(/\s+/g, ' ').trim();
  const m = nome.match(INICIO_FUNCAO);
  if (m && m.index && m.index > 0) nome = nome.slice(0, m.index);
  return nome
    .replace(/\s*-\s*/g, ' - ')          // "TERRACAP -NUTAN" -> "TERRACAP - NUTAN"
    .replace(/[\s\-–,/]+$/g, '')           // sobra de separador no fim
    .replace(/\s+(DF|GO|MT|SP)$/i, '')     // "RESERVA IGUATEMI DF" -> "RESERVA IGUATEMI"
    .trim();
}

/** Chave para comparar nomes ignorando maiúsculas, acentos, hífens e espaços. */
export function chaveSolta(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Número de coordenada; conserta o que veio sem ponto decimal
 * (-164114747 -> -16.4114747: no Brasil Central lat/lng têm 2 dígitos inteiros).
 */
export function corrigirCoordenada(valor: unknown, limite: 90 | 180): number | null {
  const n = typeof valor === 'number' ? valor
    : typeof valor === 'string' && valor.trim() ? Number(valor.trim().replace(',', '.')) : NaN;
  if (!Number.isFinite(n) || n === 0) return null;
  if (Math.abs(n) <= limite) return n;
  const digitos = Math.floor(Math.log10(Math.abs(n))) + 1;
  const corrigido = n / 10 ** (digitos - 2);
  return Math.abs(corrigido) <= limite ? corrigido : null;
}

/** Estado pela aba da planilha; na aba de Goiás, Mato Grosso pela longitude (oeste de -53). */
export function ufDaLinha(aba: string, nome: string, longitude: number): string {
  const a = chaveSolta(aba);
  if (a.startsWith('df') || a.includes('brasilia')) return 'DF';
  if (/\b(MT|CUIABA|CUIABÁ|RONDONOPOLIS|SINOP)\b/i.test(nome) || longitude < -53) return 'MT';
  if (a.startsWith('go') || a.includes('goias')) return 'GO';
  if (a.includes('sp') || a.includes('paulo')) return 'SP';
  return 'DF';
}

export function processarGeo(linhas: LinhaGeo[]): ResultadoGeo {
  const porChave = new Map<string, PostoGeo>();
  const ignoradas: ResultadoGeo['ignoradas'] = [];
  for (const l of linhas) {
    const nomeOriginal = (l.nome ?? '').toString().trim();
    if (!nomeOriginal) continue;
    if (l.vermelha) { ignoradas.push({ nome: nomeOriginal, motivo: 'marcada em vermelho (pendente)' }); continue; }
    const lat = corrigirCoordenada(l.latitude, 90);
    const lng = corrigirCoordenada(l.longitude, 180);
    if (lat == null || lng == null) { ignoradas.push({ nome: nomeOriginal, motivo: 'sem coordenada' }); continue; }
    const nome = limparNomePosto(nomeOriginal) || nomeOriginal;
    const chave = chaveSolta(nome);
    const existente = porChave.get(chave);
    if (existente) { existente.origem.push(nomeOriginal); continue; }
    porChave.set(chave, {
      nome, uf: ufDaLinha(l.aba, nomeOriginal, lng), latitude: lat, longitude: lng, origem: [nomeOriginal], avisos: [],
    });
  }
  const postos = Array.from(porChave.values()).sort((a, b) => a.nome.localeCompare(b.nome));

  // Mesma coordenada (até ~10 m) em postos diferentes: provável copia-e-cola na planilha.
  const porPonto = new Map<string, PostoGeo[]>();
  for (const p of postos) {
    const k = `${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`;
    porPonto.set(k, [...(porPonto.get(k) ?? []), p]);
  }
  for (const grupo of porPonto.values()) {
    if (grupo.length < 2) continue;
    for (const p of grupo) p.avisos.push(`mesma coordenada de ${grupo.filter(o => o !== p).map(o => o.nome).join(', ')}`);
  }
  for (const p of postos) {
    const lim = LIMITES_UF[p.uf];
    if (lim && (p.latitude < lim[0] || p.latitude > lim[1] || p.longitude < lim[2] || p.longitude > lim[3])) {
      p.avisos.push(`coordenada fora de ${p.uf}`);
    }
  }
  return { postos, ignoradas };
}
