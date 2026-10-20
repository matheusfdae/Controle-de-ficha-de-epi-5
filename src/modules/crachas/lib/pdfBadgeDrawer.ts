import jsPDF from 'jspdf';
import { BadgeEmployeeData, getFieldValue } from '@/modules/crachas/lib/badgeFieldMap';
import { createQrCodeDataUrl } from '@/modules/crachas/lib/badgeAssets';
import { getPhotoUrl } from '@/modules/crachas/lib/photoUtils';
import { BADGE_DESIGN } from '@/modules/crachas/lib/defaultTemplates';
import type { BadgeTemplate, TemplateElement } from '@/modules/crachas/components/badge/BadgeRenderer';
import type { PhotoAdjustment } from '@/modules/crachas/lib/photoAdjustments';
import { isAdjustmentDefault } from '@/modules/crachas/lib/photoAdjustments';

const PX_TO_MM = 25.4 / 96;
const PT_TO_MM = 25.4 / 72;
// Preview: font_size (mm) × 3.78 (mm→px) × 0.35 (scale) = CSS px
// PDF (jsPDF points): font_size × 3.78 × 0.35 × (72/96) = pt
const FONT_SIZE_FACTOR = 3.78 * 0.35 * 0.75; // ≈ 0.9923

function parseColor(color: string | null | undefined): [number, number, number] | null {
  if (!color) return null;

  const value = color.trim().toLowerCase();
  if (!value || value === 'transparent') return null;

  const hex = value.replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16),
    ];
  }

  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }

  const rgbMatch = value.match(/rgba?\(([^)]+)\)/);
  if (rgbMatch) {
    const [r, g, b, a] = rgbMatch[1].split(',').map((part) => Number(part.trim()));
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b) || a === 0) {
      return null;
    }

    return [Math.round(r), Math.round(g), Math.round(b)];
  }

  return null;
}

function getImageFormat(dataUrl: string): 'PNG' | 'JPEG' {
  return dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg') ? 'JPEG' : 'PNG';
}

function resolveFontStyle(fontWeight: string | null | undefined): 'normal' | 'bold' {
  const value = (fontWeight || '').toLowerCase();
  return ['bold', '600', '700', '800', '900'].includes(value) ? 'bold' : 'normal';
}

function applyTextStyle(pdf: jsPDF, element: TemplateElement) {
  pdf.setFont('helvetica', resolveFontStyle(element.font_weight));
  pdf.setFontSize(Math.max(5, (element.font_size || 10) * FONT_SIZE_FACTOR));

  const hasBlueBg = element.background_color === BADGE_DESIGN.corPrimaria || element.background_color === '#1c274c';
  const textColor = parseColor(element.font_color) || parseColor(hasBlueBg ? BADGE_DESIGN.corTextoNome : BADGE_DESIGN.corTextoPadrao) || [20, 38, 72];
  pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
}

function resolveBorderRadiusMm(element: TemplateElement, width: number, height: number) {
  const rawRadius = Math.max(0, Number(element.border_radius) || 0);
  if (rawRadius <= 0) return 0;

  // Todos os valores são tratados como px (unidade do editor) e convertidos para mm.
  // Valores pequenos (≤ 6) vindos de presets antigos em mm são convertidos com fator 1:1.
  const radiusMm = rawRadius * PX_TO_MM;
  const cappedRadius = Math.min(radiusMm, width / 2, height / 2);

  // Fator de compensação agressivo: jsPDF roundedRect renderiza visualmente
  // mais arredondado que CSS border-radius no mesmo valor nominal.
  return cappedRadius * 0.4;
}

function drawBox(pdf: jsPDF, element: TemplateElement) {
  const fill = parseColor(element.background_color);
  const stroke = parseColor(element.border_color);
  const lineWidth = Math.max(0, (element.border_width || 0) * PX_TO_MM);

  if (!fill && (!stroke || lineWidth <= 0)) return;

  if (fill) {
    pdf.setFillColor(fill[0], fill[1], fill[2]);
  }

  if (stroke && lineWidth > 0) {
    pdf.setDrawColor(stroke[0], stroke[1], stroke[2]);
    pdf.setLineWidth(lineWidth);
  }

  const style = fill && stroke && lineWidth > 0 ? 'DF' : fill ? 'F' : 'S';
  const x = element.x_position;
  const y = element.y_position;
  const width = element.width ?? 20;
  const height = element.height ?? 10;
  const radius = resolveBorderRadiusMm(element, width, height);

  if (radius > 0.1) {
    pdf.roundedRect(x, y, width, height, radius, radius, style);
  } else {
    pdf.rect(x, y, width, height, style);
  }
}

function getElementValue(data: BadgeEmployeeData, element: TemplateElement) {
  const nameMode = element.name_display_mode || 'short';
  const dynamicVal = getFieldValue(data, element.field_binding, element.field_binding === 'full_name' ? nameMode : undefined);
  const showLabel = (element as any).show_label !== false;
  return element.static_value && element.field_binding
    ? (showLabel ? `${element.static_value}${dynamicVal}` : dynamicVal)
    : element.static_value || dynamicVal;
}

function ellipsizeText(pdf: jsPDF, text: string, maxWidth: number) {
  if (!text) return text;
  if (pdf.getTextWidth(text) <= maxWidth) return text;

  let trimmed = text;
  while (trimmed.length > 1 && pdf.getTextWidth(`${trimmed}…`) > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }

  return `${trimmed}…`;
}

function clampLines(pdf: jsPDF, lines: string[], maxWidth: number, maxLines: number) {
  if (lines.length <= maxLines) return lines;
  const safeLines = lines.slice(0, Math.max(1, maxLines));
  safeLines[safeLines.length - 1] = ellipsizeText(pdf, safeLines[safeLines.length - 1], maxWidth);
  return safeLines;
}

async function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image-load-failed'));
    image.src = dataUrl;
  });
}

async function buildCoverImage(
  dataUrl: string,
  widthMm: number,
  heightMm: number,
  fitMode: 'cover' | 'contain' = 'cover',
  forceWhiteBackground = false,
  adjustment?: PhotoAdjustment | null,
): Promise<string> {
  const image = await loadImageElement(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(widthMm * 12));
  canvas.height = Math.max(1, Math.round(heightMm * 12));

  const context = canvas.getContext('2d');
  if (!context) return dataUrl;

  // Always paint a white base when requested (employee photos), so any
  // non-white background colors in the source image get covered. Transparent
  // PNGs (background-removed) also blend cleanly to white.
  if (forceWhiteBackground) {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const hasAdj = adjustment && !isAdjustmentDefault(adjustment);

  if (fitMode === 'contain' && !hasAdj) {
    // Clear with neutral background only when not forcing white
    if (!forceWhiteBackground) {
      context.fillStyle = '#f0f0f0';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    const targetRatio = canvas.width / canvas.height;
    const imageRatio = image.naturalWidth / image.naturalHeight;

    let dw: number, dh: number, dx: number, dy: number;
    if (imageRatio > targetRatio) {
      dw = canvas.width;
      dh = canvas.width / imageRatio;
      dx = 0;
      dy = (canvas.height - dh) / 2;
    } else {
      dh = canvas.height;
      dw = canvas.height * imageRatio;
      dx = (canvas.width - dw) / 2;
      dy = 0;
    }

    context.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, dx, dy, dw, dh);
  } else {
    // cover-mode crop with optional zoom + offset
    const targetRatio = canvas.width / canvas.height;
    const imageRatio = image.naturalWidth / image.naturalHeight;
    const zoom = hasAdj ? Math.max(0.5, Math.min(5, adjustment!.zoom)) : 1;
    const offX = hasAdj ? adjustment!.offsetX / 100 : 0; // -0.5..0.5
    const offY = hasAdj ? adjustment!.offsetY / 100 : 0;

    let sw: number, sh: number;
    if (imageRatio > targetRatio) {
      sh = image.naturalHeight / zoom;
      sw = sh * targetRatio;
    } else {
      sw = image.naturalWidth / zoom;
      sh = sw / targetRatio;
    }

    // Default position: center horizontally, top vertically (face area).
    // When adjustment is present, use centered baseline + offsets.
    let sx: number;
    let sy: number;
    if (hasAdj) {
      const cx = image.naturalWidth / 2 + offX * image.naturalWidth;
      const cy = image.naturalHeight / 2 + offY * image.naturalHeight;
      sx = cx - sw / 2;
      sy = cy - sh / 2;
    } else {
      sx = (image.naturalWidth - sw) / 2;
      sy = imageRatio > targetRatio ? (image.naturalHeight - sh) / 2 : 0;
    }

    // Clamp inside image bounds
    sx = Math.max(0, Math.min(image.naturalWidth - sw, sx));
    sy = Math.max(0, Math.min(image.naturalHeight - sh, sy));

    context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  }

  return canvas.toDataURL('image/png');
}

async function drawImageFrame(
  pdf: jsPDF,
  source: string | null,
  element: TemplateElement,
  fallbackInitial?: string,
  fitMode: 'cover' | 'contain' = 'cover',
  forceWhiteBackground = false,
  adjustment?: PhotoAdjustment | null,
) {
  drawBox(pdf, element);

  const x = element.x_position;
  const y = element.y_position;
  const width = element.width ?? 20;
  const height = element.height ?? 10;

  const drawPlaceholder = () => {
    pdf.setFillColor(240, 240, 240);
    pdf.rect(x, y, width, height, 'F');
    if (fallbackInitial) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(Math.max(12, Math.min(width, height) * 1.7));
      pdf.setTextColor(20, 38, 72);
      pdf.text(fallbackInitial, x + width / 2, y + height / 2 + 1.4, { align: 'center' });
    }
  };

  if (!source) {
    drawPlaceholder();
    return;
  }

  // For employee photos, paint a white frame underneath so any non-white
  // background in the source photo gets covered visually within the badge.
  if (forceWhiteBackground) {
    pdf.setFillColor(255, 255, 255);
    const radius = resolveBorderRadiusMm(element, width, height);
    if (radius > 0.1) {
      pdf.roundedRect(x, y, width, height, radius, radius, 'F');
    } else {
      pdf.rect(x, y, width, height, 'F');
    }
  }

  let coverDataUrl: string;
  try {
    coverDataUrl = await buildCoverImage(source, width, height, fitMode, forceWhiteBackground, adjustment);
  } catch (err) {
    console.warn('[pdfBadgeDrawer] Falha ao processar imagem, usando placeholder:', err);
    drawPlaceholder();
    return;
  }

  try {
    // Use 'NONE' compression to preserve PNG alpha channel — required for
    // background-removed photos to blend with the badge template behind them.
    // 'FAST' would flatten transparency to white.
    const fmt = getImageFormat(coverDataUrl);
    const compression = fmt === 'PNG' ? 'NONE' : 'FAST';
    pdf.addImage(coverDataUrl, fmt, x, y, width, height, undefined, compression);
  } catch (err) {
    console.warn('[pdfBadgeDrawer] addImage falhou, usando placeholder:', err);
    drawPlaceholder();
    return;
  }

  const stroke = parseColor(element.border_color);
  const lineWidth = Math.max(0, (element.border_width || 0) * PX_TO_MM);
  const imgWidth = element.width ?? 20;
  const imgHeight = element.height ?? 10;
  const radius = resolveBorderRadiusMm(element, imgWidth, imgHeight);

  if (stroke && lineWidth > 0) {
    pdf.setDrawColor(stroke[0], stroke[1], stroke[2]);
    pdf.setLineWidth(lineWidth);
    if (radius > 0.1) {
      pdf.roundedRect(x, y, width, height, radius, radius, 'S');
    } else {
      pdf.rect(x, y, width, height, 'S');
    }
  }
}

async function drawTextElement(pdf: jsPDF, data: BadgeEmployeeData, element: TemplateElement) {
  const value = getElementValue(data, element);
  if (!value) return;

  const displayValue = value;

  // Apply field-binding defaults if no explicit styling (treat 'transparent' as empty)
  const hasFieldBinding = !!element.field_binding;
  const effectiveElement = { ...element };
  // Only apply explicit template styling – no auto-injected backgrounds/borders

  drawBox(pdf, effectiveElement);
  applyTextStyle(pdf, effectiveElement);

  const align = (element.text_align || 'center') as 'left' | 'center' | 'right';
  const width = element.width ?? 20;
  const height = element.height ?? 10;
  const padding = Math.max(0.35, BADGE_DESIGN.paddingHorizontal * PX_TO_MM);
  const availableWidth = Math.max(1, width - (padding * 2));
  const fontSizeMm = pdf.getFontSize() * PT_TO_MM;
  const isSingleLine = element.field_binding !== 'request_reason';

  if (isSingleLine) {
    const text = ellipsizeText(pdf, displayValue, availableWidth);
    const x = align === 'center'
      ? element.x_position + width / 2
      : align === 'right'
        ? element.x_position + width - padding
        : element.x_position + padding;
    // Helvetica ascender ratio ~0.35 for accurate vertical centering
    const y = element.y_position + height / 2 + (fontSizeMm * 0.35);

    pdf.text(text, x, y, { align });
    return;
  }

  const lineHeightMm = fontSizeMm * 1.1;
  const maxLines = Math.max(1, Math.floor((height - (padding * 2)) / lineHeightMm));
  const wrapped = pdf.splitTextToSize(displayValue, availableWidth) as string[];
  const lines = clampLines(pdf, wrapped, availableWidth, maxLines);
  const blockHeight = lines.length * lineHeightMm;
  let currentY = element.y_position + Math.max(padding + fontSizeMm * 0.7, ((height - blockHeight) / 2) + fontSizeMm * 0.7);

  for (const line of lines) {
    const x = align === 'center'
      ? element.x_position + width / 2
      : align === 'right'
        ? element.x_position + width - padding
        : element.x_position + padding;
    pdf.text(line, x, currentY, { align, maxWidth: availableWidth });
    currentY += lineHeightMm;
  }
}

async function drawQrElement(pdf: jsPDF, data: BadgeEmployeeData, element: TemplateElement) {
  drawBox(pdf, element);
  const value = (getFieldValue(data, element.field_binding) || element.static_value || '').trim();
  if (!value) return;

  const qrDataUrl = await createQrCodeDataUrl(value, 768);
  if (!qrDataUrl) return;

  pdf.addImage(
    qrDataUrl,
    'PNG',
    element.x_position,
    element.y_position,
    element.width ?? 20,
    element.height ?? 20,
    undefined,
    'FAST',
  );
}

async function drawElement(
  pdf: jsPDF,
  data: BadgeEmployeeData,
  element: TemplateElement,
  assetMap: Map<string, string>,
) {
  if (element.element_type === 'rectangle') {
    drawBox(pdf, element);
    return;
  }

  if (element.element_type === 'line') {
    const color = parseColor(element.border_color) || parseColor(BADGE_DESIGN.corPrimaria) || [20, 38, 72];
    pdf.setDrawColor(color[0], color[1], color[2]);
    pdf.setLineWidth(Math.max(0.2, (element.border_width || 1) * PX_TO_MM));
    pdf.line(
      element.x_position,
      element.y_position + ((element.height ?? 1) / 2),
      element.x_position + (element.width ?? 20),
      element.y_position + ((element.height ?? 1) / 2),
    );
    return;
  }

  if (element.element_type === 'qrcode') {
    await drawQrElement(pdf, data, element);
    return;
  }

  if (element.element_type === 'image' || element.element_type === 'photo') {
    if (element.static_value && !element.field_binding) {
      const source = assetMap.get(element.static_value) || (element.static_value.startsWith('data:') ? element.static_value : null);
      const fitMode = (element.object_fit as 'cover' | 'contain') || 'cover';
      await drawImageFrame(pdf, source, element, undefined, fitMode);
      return;
    }

    const rawUrl = getFieldValue(data, element.field_binding) || data.photo_url;
    const photoUrl = getPhotoUrl(rawUrl);
    const source = assetMap.get(photoUrl) || (photoUrl.startsWith('data:') ? photoUrl : null);
    const fitMode = (element.object_fit as 'cover' | 'contain') || 'cover';
    // Force a white background frame behind the employee photo so source
    // photos with colored backgrounds always render with white inside the badge.
    const isEmployeePhoto = element.element_type === 'photo' || element.field_binding === 'photo_url';
    const adjustment = isEmployeePhoto ? ((data as any).photo_adjustment as PhotoAdjustment | undefined) : undefined;
    await drawImageFrame(pdf, source, element, data.full_name?.charAt(0)?.toUpperCase(), fitMode, isEmployeePhoto, adjustment);
    return;
  }

  await drawTextElement(pdf, data, element);
}

export async function drawBadgeSideToPdf(
  pdf: jsPDF,
  data: BadgeEmployeeData,
  template: BadgeTemplate,
  assetMap: Map<string, string>,
  side: 'front' | 'back' = 'front',
  offsetX = 0,
  offsetY = 0,
) {
  const backgroundColor = parseColor(template.background_color || '#ffffff') || [255, 255, 255];
  pdf.setFillColor(backgroundColor[0], backgroundColor[1], backgroundColor[2]);
  pdf.rect(offsetX, offsetY, template.width_mm, template.height_mm, 'F');

  const backgroundImageUrl = side === 'back'
    ? template.back_background_image_url || template.background_image_url
    : template.background_image_url;
  const backgroundSource = backgroundImageUrl
    ? assetMap.get(backgroundImageUrl) || (backgroundImageUrl.startsWith('data:') ? backgroundImageUrl : null)
    : null;

  if (backgroundSource) {
    const preparedBackground = await buildCoverImage(backgroundSource, template.width_mm, template.height_mm);
    pdf.addImage(preparedBackground, getImageFormat(preparedBackground), offsetX, offsetY, template.width_mm, template.height_mm, undefined, 'FAST');
  }

  const elements = (template.elements || [])
    .filter((element) => element.side === side)
    .sort((a, b) => a.z_index - b.z_index);

  for (const element of elements) {
    // Apply offset to element positions
    const offsetElement = {
      ...element,
      x_position: element.x_position + offsetX,
      y_position: element.y_position + offsetY,
    };
    await drawElement(pdf, data, offsetElement, assetMap);
  }
}