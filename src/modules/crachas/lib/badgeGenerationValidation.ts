import type { BadgeTemplate } from '@/modules/crachas/components/badge/BadgeRenderer';
import {
  BadgeEmployeeData,
  getFieldValue,
  getBadgeFieldLabel,
  getUnsupportedBadgeBindings,
  validateBadgeData,
} from '@/modules/crachas/lib/badgeFieldMap';
import {
  collectQrValues,
  collectTemplateImageUrls,
  createQrCodeDataUrl,
  fetchImageAsDataUrl,
  prefetchTemplateImageAssets,
  waitForBadgeFonts,
} from '@/modules/crachas/lib/badgeAssets';
import { normalizeTemplateForRender } from '@/modules/crachas/lib/badgeTemplateNormalizer';

interface ValidateBadgeGenerationInput {
  employees: BadgeEmployeeData[];
  template: BadgeTemplate | null;
}

export interface BadgeGenerationValidationResult {
  errors: string[];
  warnings: string[];
  ok: boolean;
}

export async function validateBadgeGenerationInput({
  employees,
  template,
}: ValidateBadgeGenerationInput): Promise<BadgeGenerationValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!template) {
    return { ok: false, errors: ['Selecione um modelo de crachá válido antes de gerar.'], warnings: [] };
  }

  const normalizedTemplate = normalizeTemplateForRender(template);

  if (!normalizedTemplate) {
    return { ok: false, errors: ['Selecione um modelo de crachá válido antes de gerar.'], warnings: [] };
  }

  if (employees.length === 0) {
    return { ok: false, errors: ['Selecione pelo menos um colaborador para gerar o crachá.'], warnings: [] };
  }

  if (!Number.isFinite(normalizedTemplate.width_mm) || normalizedTemplate.width_mm <= 0 || !Number.isFinite(normalizedTemplate.height_mm) || normalizedTemplate.height_mm <= 0) {
    errors.push('O modelo selecionado não possui largura e altura válidas.');
  }

  if (!Array.isArray(normalizedTemplate.elements)) {
    errors.push('Os elementos do modelo não foram carregados corretamente.');
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings: [] };
  }

  const elements = normalizedTemplate.elements || [];
  const fieldBindings = [...new Set(elements.map((element) => element.field_binding).filter(Boolean) as string[])];
  const unsupportedBindings = getUnsupportedBadgeBindings(fieldBindings);

  if (unsupportedBindings.length > 0) {
    warnings.push(`O modelo usa campos dinâmicos sem mapeamento: ${unsupportedBindings.map(getBadgeFieldLabel).join(', ')}.`);
  }

  for (const employee of employees) {
    const missingFields = validateBadgeData(employee, fieldBindings);
    if (missingFields.length > 0) {
      warnings.push(`${employee.full_name}: faltam ${missingFields.join(', ')}.`);
    }
  }

  const fontsReady = await waitForBadgeFonts();
  if (!fontsReady) {
    warnings.push('A fonte Poppins não carregou completamente.');
  }

  const preloadedAssets = await prefetchTemplateImageAssets(employees, normalizedTemplate);
  const referencedAssetCount = collectTemplateImageUrls(employees, normalizedTemplate).length;

  if (referencedAssetCount > preloadedAssets.size) {
    warnings.push('Nem todas as imagens do modelo, fundo ou foto dos colaboradores puderam ser carregadas.');
  }

  const qrValues = collectQrValues(employees, elements);
  const missingQrEmployees = employees
    .filter((employee) => elements.some((element) => element.element_type === 'qrcode') && !elements.some((element) => {
      if (element.element_type !== 'qrcode') return false;
      return Boolean((getFieldValue(employee, element.field_binding) || element.static_value || '').trim());
    }))
    .map((employee) => employee.full_name);

  if (missingQrEmployees.length > 0) {
    warnings.push(`Os seguintes colaboradores estão sem valor para QR Code: ${missingQrEmployees.join(', ')}.`);
  }

  for (const qrValue of qrValues) {
    const qrData = await createQrCodeDataUrl(qrValue);
    if (!qrData) {
      warnings.push(`Não foi possível preparar o QR Code para o valor: ${qrValue}.`);
      break;
    }
  }

  if (normalizedTemplate.background_image_url) {
    const backgroundLoaded = await fetchImageAsDataUrl(normalizedTemplate.background_image_url);
    if (!backgroundLoaded) {
      warnings.push('A imagem de fundo da frente não pôde ser carregada.');
    }
  }

  if (normalizedTemplate.back_background_image_url) {
    const backBackgroundLoaded = await fetchImageAsDataUrl(normalizedTemplate.back_background_image_url);
    if (!backBackgroundLoaded) {
      warnings.push('A imagem de fundo do verso não pôde ser carregada.');
    }
  }

  return {
    ok: true,
    errors: [],
    warnings: [...new Set(warnings)],
  };
}