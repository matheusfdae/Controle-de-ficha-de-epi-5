import type { BadgeTemplate, TemplateElement } from '@/modules/crachas/components/badge/BadgeRenderer';
import { BADGE_DESIGN } from '@/modules/crachas/lib/defaultTemplates';

const BLUE = BADGE_DESIGN.corPrimaria;
const WHITE = BADGE_DESIGN.corTextoNome;
const BORDER = BADGE_DESIGN.corBorda;
const FONT = BADGE_DESIGN.fontFamily;

const MANAGED_BINDINGS = new Set([
  'photo_url',
  'full_name',
  'role',
  'cnv',
  'employee_id',
  'blood_type',
  'rg',
  'cpf',
  'issue_date',
  'valid_until',
]);

const MANAGED_STATIC_VALUES = new Set(['DATA DE EMISSÃO', 'VALIDADE']);

function normalizeStaticValue(value: string | null | undefined) {
  return (value || '').trim().toUpperCase();
}

function isManagedFiveStarsElement(element: TemplateElement) {
  if (element.field_binding && MANAGED_BINDINGS.has(element.field_binding)) {
    return true;
  }

  return !element.field_binding && MANAGED_STATIC_VALUES.has(normalizeStaticValue(element.static_value));
}

const FIVE_STARS_FRONT_ASSET = '/templates/5estrelas-frente-blank.png';
const FIVE_STARS_BACK_ASSET = '/templates/5estrelas-verso-blank.png';

function normalizeAssetPath(value: string | null | undefined) {
  return (value || '').trim().toLowerCase();
}

function isFiveStarsTemplate(template: BadgeTemplate) {
  const fingerprint = [
    template.name,
    template.background_image_url,
    template.back_background_image_url,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return fingerprint.includes('5 estrelas') || fingerprint.includes('5estrelas');
}

function usesOfficialFiveStarsAssets(template: BadgeTemplate) {
  const frontAsset = normalizeAssetPath(template.background_image_url);
  const backAsset = normalizeAssetPath(template.back_background_image_url);

  return frontAsset.endsWith(FIVE_STARS_FRONT_ASSET) && backAsset.endsWith(FIVE_STARS_BACK_ASSET);
}

function shouldAutoNormalizeFiveStarsTemplate(template: BadgeTemplate) {
  if (!isFiveStarsTemplate(template) || !usesOfficialFiveStarsAssets(template)) {
    return false;
  }

  const elements = template.elements || [];

  // Respect any saved/customized model exactly as configured.
  if (elements.length > 0) {
    return false;
  }

  return true;
}

function textElement(
  id: string,
  side: 'front' | 'back',
  config: Partial<TemplateElement> & {
    x_position: number;
    y_position: number;
    width: number;
    height: number;
    z_index: number;
  },
): TemplateElement {
  return {
    id,
    element_type: 'text',
    field_binding: null,
    static_value: null,
    font_size: 9,
    font_family: FONT,
    font_color: BLUE,
    font_weight: '600',
    text_align: 'center',
    background_color: 'transparent',
    border_color: null,
    border_width: 0,
    border_radius: BADGE_DESIGN.borderRadius,
    side,
    ...config,
  };
}

function imageElement(
  id: string,
  side: 'front' | 'back',
  config: Partial<TemplateElement> & {
    x_position: number;
    y_position: number;
    width: number;
    height: number;
    z_index: number;
  },
): TemplateElement {
  return {
    id,
    element_type: 'image',
    field_binding: 'photo_url',
    static_value: null,
    font_size: null,
    font_family: null,
    font_color: null,
    font_weight: null,
    text_align: null,
    background_color: null,
    border_color: null,
    border_width: 0,
    border_radius: BADGE_DESIGN.borderRadius,
    side,
    ...config,
  };
}

function buildFiveStarsElements(): TemplateElement[] {
  const COL_LEFT = 2.5;
  const COL_WIDTH = 37;
  const PHOTO_W = 29.2;
  const PHOTO_H = 28.4;
  const PHOTO_X = (42 - PHOTO_W) / 2;
  const FIELD_H = 3.8;

  return [
    imageElement('auto-5e-photo', 'front', {
      x_position: PHOTO_X,
      y_position: 15.5,
      width: PHOTO_W,
      height: PHOTO_H,
      z_index: 10,
      border_radius: 1,
    }),
    textElement('auto-5e-front-name', 'front', {
      x_position: COL_LEFT,
      y_position: 45.5,
      width: COL_WIDTH,
      height: 4.8,
      field_binding: 'full_name',
      font_size: 8.6,
      font_weight: '700',
      font_color: WHITE,
      background_color: BLUE,
      border_radius: 2,
      z_index: 12,
    }),
    textElement('auto-5e-front-role', 'front', {
      x_position: COL_LEFT,
      y_position: 50.8,
      width: COL_WIDTH,
      height: FIELD_H,
      field_binding: 'role',
      font_size: 7.2,
      font_weight: '700',
      border_color: null,
      border_width: 0,
      background_color: 'transparent',
      z_index: 12,
    }),
    textElement('auto-5e-front-cnv', 'front', {
      x_position: COL_LEFT,
      y_position: 55.0,
      width: COL_WIDTH,
      height: FIELD_H,
      field_binding: 'cnv',
      static_value: 'CNV: ',
      font_size: 6.8,
      border_color: null,
      border_width: 0,
      background_color: 'transparent',
      z_index: 12,
    }),
    textElement('auto-5e-front-mat', 'front', {
      x_position: COL_LEFT,
      y_position: 59.2,
      width: COL_WIDTH,
      height: FIELD_H,
      field_binding: 'employee_id',
      static_value: 'RE: ',
      font_size: 6.8,
      border_color: null,
      border_width: 0,
      background_color: 'transparent',
      z_index: 12,
    }),
    textElement('auto-5e-front-blood-visible', 'front', {
      x_position: COL_LEFT,
      y_position: 63.4,
      width: COL_WIDTH,
      height: FIELD_H,
      field_binding: 'blood_type',
      static_value: 'TIPO SANGUÍNEO: ',
      font_size: 5.8,
      border_color: null,
      border_width: 0,
      background_color: 'transparent',
      z_index: 12,
    }),
    textElement('auto-5e-back-name', 'back', {
      x_position: 4.6,
      y_position: 3.2,
      width: 76.4,
      height: 4.8,
      field_binding: 'full_name',
      font_size: 8.4,
      border_color: null,
      border_width: 0,
      background_color: 'transparent',
      z_index: 12,
    }),
    textElement('auto-5e-back-rg', 'back', {
      x_position: 4.6,
      y_position: 9,
      width: 76.4,
      height: 4.3,
      field_binding: 'rg',
      static_value: 'RG: ',
      font_size: 8.2,
      border_color: null,
      border_width: 0,
      background_color: 'transparent',
      z_index: 12,
    }),
    textElement('auto-5e-back-cpf', 'back', {
      x_position: 4.6,
      y_position: 14.5,
      width: 76.4,
      height: 4.3,
      field_binding: 'cpf',
      static_value: 'CPF: ',
      font_size: 8.2,
      border_color: null,
      border_width: 0,
      background_color: 'transparent',
      z_index: 12,
    }),
    textElement('auto-5e-back-issue-label', 'back', {
      x_position: 8.8,
      y_position: 20.6,
      width: 24,
      height: 3.6,
      static_value: 'DATA DE EMISSÃO',
      font_size: 6.1,
      font_weight: '700',
      z_index: 12,
    }),
    textElement('auto-5e-back-valid-label', 'back', {
      x_position: 51.8,
      y_position: 20.6,
      width: 20,
      height: 3.6,
      static_value: 'VALIDADE',
      font_size: 6.6,
      font_weight: '700',
      z_index: 12,
    }),
    textElement('auto-5e-back-issue-date', 'back', {
      x_position: 8.5,
      y_position: 24.8,
      width: 25,
      height: 4.2,
      field_binding: 'issue_date',
      font_size: 8.5,
      font_weight: '700',
      z_index: 12,
    }),
    textElement('auto-5e-back-valid-date', 'back', {
      x_position: 50.8,
      y_position: 24.8,
      width: 21,
      height: 4.2,
      field_binding: 'valid_until',
      font_size: 8.5,
      font_weight: '700',
      z_index: 12,
    }),
  ];
}

export function normalizeTemplateForRender(template: BadgeTemplate | null): BadgeTemplate | null {
  if (!template || !shouldAutoNormalizeFiveStarsTemplate(template)) {
    return template;
  }

  const preservedElements = (template.elements || []).filter((element) => !isManagedFiveStarsElement(element));

  return {
    ...template,
    has_back_side: true,
    elements: [...preservedElements, ...buildFiveStarsElements()].sort((a, b) => a.z_index - b.z_index),
  };
}
