import { CanvasElement } from '@/modules/crachas/components/editor/types';

export interface DefaultTemplate {
  name: string;
  description: string;
  width_mm: number;
  height_mm: number;
  backgroundColor: string;
  backgroundImageUrl?: string;
  backBackgroundImageUrl?: string;
  hasBackSide: boolean;
  elements: Omit<CanvasElement, 'id'>[];
}

// ── Badge Design System ──
export const BADGE_DESIGN = {
  fontFamily: 'Poppins, sans-serif',
  corPrimaria: '#142648',
  corTextoPadrao: '#142648',
  corTextoNome: '#FFFFFF',
  corBorda: '#d1d5db',
  borderRadius: 1, // mm
  alturaCampoGrande: 5, // mm
  alturaCampoMedio: 4.5, // mm
  espacamentoVertical: 1, // mm
  paddingHorizontal: 4, // px (scaled)
} as const;

const { fontFamily: FONT, corPrimaria: BLUE, corTextoNome: WHITE, corBorda: GRAY_BORDER, borderRadius: RADIUS } = BADGE_DESIGN;
/**
 * Template "5 Estrelas - Vigilância"
 * Arte: public/crachas/templates/5estrelas-vigilancia.png — tirada do PDF do
 * Canva (CRACHÁS VIGILÂNCIA.pdf) a 600 DPI; textos fixos, logos, ondas e
 * rodapé já vêm na arte.
 * Dimensões: 118.8mm × 96.1mm, tamanho real do Canva. Uma face só, em duas
 * colunas: esquerda = frente (foto/nome), direita = verso (dados) — dobra ao meio.
 * Posições medidas no crachá preenchido do mesmo PDF. font_size ≈ pt no PDF.
 */
const NAVY = '#0f243e';
const NAVY_PILL = '#1d2647';
const PILL_RADIUS = 10; // vira pílula no preview; o PDF limita a ~1mm
const ARIAL = 'Arial, Helvetica, sans-serif';

const pill = (overrides: Partial<Omit<CanvasElement, 'id'>>): Omit<CanvasElement, 'id'> => ({
  type: 'text',
  x: 5.11, y: 0,
  width: 52.67, height: 5.56,
  fontFamily: ARIAL,
  fontSize: 10,
  fontWeight: '700',
  fontColor: NAVY,
  textAlign: 'center',
  backgroundColor: '#FFFFFF',
  borderColor: NAVY,
  borderWidth: 1,
  borderRadius: PILL_RADIUS,
  zIndex: 10, side: 'front', opacity: 1,
  ...overrides,
});

export const template5EstrelasImg: DefaultTemplate = {
  name: '5 Estrelas - Vigilância',
  description: 'Arte oficial do Canva em alta definição (frente e verso lado a lado)',
  width_mm: 118.8,
  height_mm: 96.1,
  backgroundColor: '#FFFFFF',
  backgroundImageUrl: '/crachas/templates/5estrelas-vigilancia.png',
  hasBackSide: false,
  elements: [
    // ══════════ COLUNA ESQUERDA (frente) ══════════
    {
      type: 'image',
      x: 12.94, y: 14.66,
      width: 38.21, height: 51.05,
      fieldBinding: 'photo_url',
      borderRadius: 0,
      zIndex: 10, side: 'front', opacity: 1,
    },
    pill({
      x: 4.91, y: 65.2,
      fieldBinding: 'full_name',
      nameDisplayMode: 'short',
      fontColor: WHITE,
      backgroundColor: NAVY_PILL,
      borderColor: undefined,
      borderWidth: 0,
    }),
    pill({ y: 71.61, fieldBinding: 'role' }),
    pill({ y: 78.0, fieldBinding: 'employee_id', staticValue: 'RE: ' }),
    pill({ y: 84.29, fieldBinding: 'blood_type', staticValue: 'TIPO SANGUÍNEO: ' }),

    // ══════════ COLUNA DIREITA (verso) ══════════
    pill({ x: 61.55, y: 9.7, width: 52.14, fieldBinding: 'full_name', nameDisplayMode: 'full', fontSize: 8 }),
    pill({ x: 61.77, y: 16.89, width: 52.14, fieldBinding: 'rg', staticValue: 'RG: ', fontSize: 9 }),
    pill({ x: 61.77, y: 24.16, width: 52.14, fieldBinding: 'cpf', staticValue: 'CPF: ', fontSize: 9 }),

    // Datas — os rótulos já estão na arte; o texto alinha à esquerda com eles
    {
      type: 'text',
      x: 65.58, y: 37.04,
      width: 24, height: 4.2,
      fieldBinding: 'issue_date',
      fontFamily: ARIAL, fontSize: 9, fontWeight: '700',
      fontColor: '#1e274a', textAlign: 'left',
      zIndex: 10, side: 'front', opacity: 1,
    },
    {
      type: 'text',
      x: 92.0, y: 37.04,
      width: 22, height: 4.2,
      fieldBinding: 'valid_until',
      fontFamily: ARIAL, fontSize: 9, fontWeight: '700',
      fontColor: '#1e274a', textAlign: 'left',
      zIndex: 10, side: 'front', opacity: 1,
    },
  ],
};

/**
 * Template "SS Serviços - Manutenção e Limpeza"
 * Layout horizontal com duas colunas: foto + nome/cargo à esquerda, dados à direita
 */
export const templateSsServicosImg: DefaultTemplate = {
  name: 'SS Serviços - Manutenção e Limpeza',
  description: 'Modelo institucional SS Serviços com fundo azul claro (frente)',
  width_mm: 85.6,
  height_mm: 54,
  backgroundColor: '#FFFFFF',
  backgroundImageUrl: '/crachas/templates/ss-servicos-frente-blank.png',
  hasBackSide: false,
  elements: [
    // ── COLUNA ESQUERDA ──
    // Foto do colaborador
    {
      type: 'image',
      x: 5.5, y: 9.5,
      width: 24, height: 26,
      fieldBinding: 'photo_url',
      borderRadius: RADIUS,
      zIndex: 10, side: 'front', opacity: 1,
    },
    // Nome resumido (faixa azul inferior)
    {
      type: 'text',
      x: 3, y: 41.5,
      width: 29, height: 4.6,
      fieldBinding: 'full_name',
      nameDisplayMode: 'short',
      fontFamily: FONT,
      fontSize: 9,
      fontWeight: '700',
      fontColor: WHITE,
      backgroundColor: BLUE,
      textAlign: 'center',
      borderRadius: 1,
      zIndex: 11, side: 'front', opacity: 1,
    },
    // Cargo (faixa branca abaixo do nome)
    {
      type: 'text',
      x: 3, y: 47,
      width: 29, height: 4.2,
      fieldBinding: 'role',
      fontFamily: FONT,
      fontSize: 7.5,
      fontWeight: '700',
      fontColor: BLUE,
      backgroundColor: '#FFFFFF',
      textAlign: 'center',
      borderRadius: 1,
      zIndex: 11, side: 'front', opacity: 1,
    },

    // ── COLUNA DIREITA ──
    // Nome completo (cabeçalho)
    {
      type: 'text',
      x: 36, y: 5.5,
      width: 46, height: 4.6,
      fieldBinding: 'full_name',
      fontFamily: FONT,
      fontSize: 8.4,
      fontWeight: '700',
      fontColor: WHITE,
      backgroundColor: BLUE,
      textAlign: 'center',
      borderRadius: 1,
      zIndex: 11, side: 'front', opacity: 1,
    },
    // CPF
    {
      type: 'text',
      x: 36, y: 11.5,
      width: 46, height: 4.2,
      fieldBinding: 'cpf',
      staticValue: 'CPF: ',
      fontFamily: FONT,
      fontSize: 7.6,
      fontWeight: '700',
      fontColor: BLUE,
      textAlign: 'center',
      backgroundColor: 'transparent',
      zIndex: 11, side: 'front', opacity: 1,
    },
    // Matrícula
    {
      type: 'text',
      x: 36, y: 16.6,
      width: 46, height: 4.2,
      fieldBinding: 'employee_id',
      staticValue: 'MATRÍCULA: ',
      fontFamily: FONT,
      fontSize: 7.6,
      fontWeight: '700',
      fontColor: BLUE,
      textAlign: 'center',
      backgroundColor: 'transparent',
      zIndex: 11, side: 'front', opacity: 1,
    },
    // Data de expedição
    {
      type: 'text',
      x: 36, y: 21.7,
      width: 46, height: 4.2,
      fieldBinding: 'issue_date',
      staticValue: 'DATA DE EXPEDIÇÃO: ',
      fontFamily: FONT,
      fontSize: 6.6,
      fontWeight: '700',
      fontColor: BLUE,
      textAlign: 'center',
      backgroundColor: 'transparent',
      zIndex: 11, side: 'front', opacity: 1,
    },
    // Validade
    {
      type: 'text',
      x: 36, y: 26.5,
      width: 46, height: 3.8,
      fieldBinding: 'valid_until',
      staticValue: 'VÁLIDO ATÉ: ',
      fontFamily: FONT,
      fontSize: 6.4,
      fontWeight: '600',
      fontColor: BLUE,
      textAlign: 'center',
      backgroundColor: 'transparent',
      zIndex: 11, side: 'front', opacity: 1,
    },
  ],
};

/**
 * Template "HCN - Identificação Funcional"
 * Layout vertical com fundo verde, foto centralizada e dados à direita
 */
export const templateHcnImg: DefaultTemplate = {
  name: 'HCN - Identificação Funcional',
  description: 'Modelo HCN com fundo verde institucional (frente)',
  width_mm: 85.6,
  height_mm: 54,
  backgroundColor: '#FFFFFF',
  backgroundImageUrl: '/crachas/templates/hcn-frente-blank.png',
  hasBackSide: false,
  elements: [
    // ── COLUNA ESQUERDA ──
    // Foto do colaborador
    {
      type: 'image',
      x: 7.5, y: 12,
      width: 22, height: 23,
      fieldBinding: 'photo_url',
      borderRadius: RADIUS,
      zIndex: 10, side: 'front', opacity: 1,
    },
    // Nome resumido (faixa branca)
    {
      type: 'text',
      x: 4.5, y: 39,
      width: 28, height: 4.4,
      fieldBinding: 'full_name',
      nameDisplayMode: 'short',
      fontFamily: FONT,
      fontSize: 8.2,
      fontWeight: '700',
      fontColor: BLUE,
      backgroundColor: '#FFFFFF',
      textAlign: 'center',
      borderRadius: 1,
      zIndex: 11, side: 'front', opacity: 1,
    },
    // Cargo / Função
    {
      type: 'text',
      x: 4.5, y: 43.8,
      width: 28, height: 3.4,
      fieldBinding: 'role',
      fontFamily: FONT,
      fontSize: 6.4,
      fontWeight: '600',
      fontColor: BLUE,
      backgroundColor: '#FFFFFF',
      textAlign: 'center',
      borderRadius: 1,
      zIndex: 11, side: 'front', opacity: 1,
    },

    // ── COLUNA DIREITA ──
    // Nome completo
    {
      type: 'text',
      x: 38, y: 9.5,
      width: 44, height: 4.6,
      fieldBinding: 'full_name',
      fontFamily: FONT,
      fontSize: 8.2,
      fontWeight: '700',
      fontColor: BLUE,
      textAlign: 'left',
      backgroundColor: 'transparent',
      zIndex: 11, side: 'front', opacity: 1,
    },
    // CPF
    {
      type: 'text',
      x: 38, y: 19,
      width: 44, height: 4.6,
      fieldBinding: 'cpf',
      fontFamily: FONT,
      fontSize: 8.2,
      fontWeight: '700',
      fontColor: BLUE,
      textAlign: 'left',
      backgroundColor: 'transparent',
      zIndex: 11, side: 'front', opacity: 1,
    },
    // Local de trabalho (company)
    {
      type: 'text',
      x: 38, y: 28.5,
      width: 44, height: 4.6,
      fieldBinding: 'company',
      fontFamily: FONT,
      fontSize: 8.2,
      fontWeight: '700',
      fontColor: BLUE,
      textAlign: 'left',
      backgroundColor: 'transparent',
      zIndex: 11, side: 'front', opacity: 1,
    },
  ],
};

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  template5EstrelasImg,
  templateSsServicosImg,
  templateHcnImg,
];
