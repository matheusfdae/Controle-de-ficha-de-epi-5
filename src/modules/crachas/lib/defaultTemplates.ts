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
 * Template "5 Estrelas - Segurança"
 * Frente: public/templates/5estrelas-frente-blank.png
 * Verso:  public/templates/5estrelas-verso-blank.png
 * Dimensões: 85.6mm × 68mm (duas colunas)
 *
 * Font-size reference (rendered px ≈ font_size × 1.32):
 *   15 → ~20px | 13 → ~17px | 11 → ~15px | 10 → ~13px | 8 → ~11px | 7 → ~9px
 */
export const template5EstrelasImg: DefaultTemplate = {
  name: '5 Estrelas - Segurança',
  description: 'Modelo com arte base importada do Canva (frente e verso)',
  width_mm: 85.6,
  height_mm: 68,
  backgroundColor: '#FFFFFF',
  backgroundImageUrl: '/templates/5estrelas-frente-blank.png',
  backBackgroundImageUrl: '/templates/5estrelas-verso-blank.png',
  hasBackSide: true,
  elements: [
    // ══════════════════════════════════════
    // FRENTE — COLUNA ESQUERDA
    // ══════════════════════════════════════

    // Foto do colaborador
    {
      type: 'image',
      x: 6.4, y: 15.5,
      width: 29.2, height: 28.4,
      fieldBinding: 'photo_url',
      borderRadius: RADIUS,
      zIndex: 10, side: 'front', opacity: 1,
    },

    // Nome completo — fundo azul, texto branco, bold
    {
      type: 'text',
      x: 2.5, y: 45.5,
      width: 37, height: 4.8,
      fieldBinding: 'full_name',
      fontFamily: FONT,
      fontSize: 8.6,
      fontWeight: '700',
      fontColor: WHITE,
      backgroundColor: BLUE,
      textAlign: 'center',
      borderRadius: 2,
      zIndex: 10, side: 'front', opacity: 1,
    },

    // Cargo — fundo branco, texto azul, bold
    {
      type: 'text',
      x: 2.5, y: 50.8,
      width: 37, height: 3.8,
      fieldBinding: 'role',
      fontFamily: FONT,
      fontSize: 7.2,
      fontWeight: '700',
      fontColor: BLUE,
      textAlign: 'center',
      backgroundColor: 'transparent',
      zIndex: 10, side: 'front', opacity: 1,
    },

    // CNV — semibold
    {
      type: 'text',
      x: 2.5, y: 55.0,
      width: 37, height: 3.8,
      fieldBinding: 'cnv',
      staticValue: 'CNV: ',
      fontFamily: FONT,
      fontSize: 6.8,
      fontWeight: '600',
      fontColor: BLUE,
      textAlign: 'center',
      backgroundColor: 'transparent',
      zIndex: 10, side: 'front', opacity: 1,
    },

    // Matrícula — semibold
    {
      type: 'text',
      x: 2.5, y: 59.2,
      width: 37, height: 3.8,
      fieldBinding: 'employee_id',
      staticValue: 'RE: ',
      fontFamily: FONT,
      fontSize: 6.8,
      fontWeight: '600',
      fontColor: BLUE,
      textAlign: 'center',
      backgroundColor: 'transparent',
      zIndex: 10, side: 'front', opacity: 1,
    },

    // Tipo sanguíneo — semibold
    {
      type: 'text',
      x: 2.5, y: 63.4,
      width: 37, height: 3.8,
      fieldBinding: 'blood_type',
      staticValue: 'TIPO SANGUÍNEO: ',
      fontFamily: FONT,
      fontSize: 5.8,
      fontWeight: '600',
      fontColor: BLUE,
      textAlign: 'center',
      backgroundColor: 'transparent',
      zIndex: 10, side: 'front', opacity: 1,
    },

    // ══════════════════════════════════════
    // FRENTE — COLUNA DIREITA
    // ══════════════════════════════════════

    // Nome resumido (topo direito) — borda cinza, font menor para caber
    {
      type: 'text',
      x: 4.6, y: 3.2,
      width: 76.4, height: 4.8,
      fieldBinding: 'full_name',
      fontFamily: FONT,
      fontSize: 8.4,
      fontWeight: '600',
      fontColor: BLUE,
      textAlign: 'center',
      borderRadius: RADIUS,
      backgroundColor: 'transparent',
      zIndex: 10, side: 'back', opacity: 1,
    },

    // RG — borda cinza
    {
      type: 'text',
      x: 4.6, y: 9,
      width: 76.4, height: 4.3,
      fieldBinding: 'rg',
      staticValue: 'RG: ',
      fontFamily: FONT,
      fontSize: 8.2,
      fontWeight: '600',
      fontColor: BLUE,
      textAlign: 'center',
      borderRadius: RADIUS,
      backgroundColor: 'transparent',
      zIndex: 10, side: 'back', opacity: 1,
    },

    // CPF — borda cinza
    {
      type: 'text',
      x: 4.6, y: 14.5,
      width: 76.4, height: 4.3,
      fieldBinding: 'cpf',
      staticValue: 'CPF: ',
      fontFamily: FONT,
      fontSize: 8.2,
      fontWeight: '600',
      fontColor: BLUE,
      textAlign: 'center',
      borderRadius: RADIUS,
      backgroundColor: 'transparent',
      zIndex: 10, side: 'back', opacity: 1,
    },

    // Label "DATA DE EMISSÃO" — posição recuada para não sobrepor
    {
      type: 'text',
      x: 8.8, y: 20.6,
      width: 24, height: 3.6,
      staticValue: 'DATA DE EMISSÃO',
      fontFamily: FONT,
      fontSize: 6.1,
      fontWeight: 'bold',
      fontColor: BLUE,
      textAlign: 'center',
      zIndex: 10, side: 'back', opacity: 1,
    },

    // Label "VALIDADE"
    {
      type: 'text',
      x: 51.8, y: 20.6,
      width: 20, height: 3.6,
      staticValue: 'VALIDADE',
      fontFamily: FONT,
      fontSize: 6.6,
      fontWeight: 'bold',
      fontColor: BLUE,
      textAlign: 'center',
      zIndex: 10, side: 'back', opacity: 1,
    },

    // Valor data emissão — com espaço adequado abaixo do rótulo
    {
      type: 'text',
      x: 8.5, y: 24.8,
      width: 25, height: 4.2,
      fieldBinding: 'issue_date',
      fontFamily: FONT,
      fontSize: 8.5,
      fontWeight: 'bold',
      fontColor: BLUE,
      textAlign: 'center',
      zIndex: 10, side: 'back', opacity: 1,
    },

    // Valor validade
    {
      type: 'text',
      x: 50.8, y: 24.8,
      width: 21, height: 4.2,
      fieldBinding: 'valid_until',
      fontFamily: FONT,
      fontSize: 8.5,
      fontWeight: 'bold',
      fontColor: BLUE,
      textAlign: 'center',
      zIndex: 10, side: 'back', opacity: 1,
    },

    // Endereço / Unidade — posição com margem após datas
    {
      type: 'text',
      x: 8.8, y: 31.1,
      width: 63, height: 9.4,
      fieldBinding: 'address',
      fontFamily: FONT,
      fontSize: 6.1,
      fontWeight: '500',
      fontColor: BLUE,
      textAlign: 'left',
      zIndex: 10, side: 'back', opacity: 1,
    },

    // Telefone
    {
      type: 'text',
      x: 8.8, y: 41.6,
      width: 31, height: 3.8,
      fieldBinding: 'phone',
      fontFamily: FONT,
      fontSize: 6.5,
      fontWeight: '500',
      fontColor: BLUE,
      textAlign: 'left',
      zIndex: 10, side: 'back', opacity: 1,
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
  backgroundImageUrl: '/templates/ss-servicos-frente-blank.png',
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
  backgroundImageUrl: '/templates/hcn-frente-blank.png',
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
