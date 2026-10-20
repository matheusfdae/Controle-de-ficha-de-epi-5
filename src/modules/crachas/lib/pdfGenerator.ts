import jsPDF from 'jspdf';
import { BadgeEmployeeData } from '@/modules/crachas/lib/badgeFieldMap';
import { BadgeTemplate } from '@/modules/crachas/components/badge/BadgeRenderer';
import { prefetchTemplateImageAssets } from '@/modules/crachas/lib/badgeAssets';
import { normalizeTemplateForRender } from '@/modules/crachas/lib/badgeTemplateNormalizer';
import { drawBadgeSideToPdf } from '@/modules/crachas/lib/pdfBadgeDrawer';

// A4 dimensions in mm
const A4_W = 210;
const A4_H = 297;
const BADGES_PER_PAGE = 4;

export type PdfLayoutMode = 'auto' | 'grid-2x2';

interface GeneratePDFOptions {
  employees: BadgeEmployeeData[];
  template: BadgeTemplate | null;
  singlePerPage?: boolean;
  badgesPerPage?: number;
  /**
   * Layout strategy when generating multiple badges:
   * - 'auto' (default): packs as many badges as fit on A4 using template dimensions
   * - 'grid-2x2': forces exactly 4 badges per A4 page (2 columns × 2 rows), centered,
   *   without resizing the template. If the template doesn't physically fit 2×2 on A4,
   *   it falls back to scaling down just enough to fit (preserving aspect ratio).
   */
  pdfLayout?: PdfLayoutMode;
  includeBackSide?: boolean;
  removeBackground?: boolean;
  bgRemovalEmployeeIds?: Set<string>;
  bgRemovalTolerance?: number;
  bgRemovalToleranceByEmployee?: Record<string, number>;
  bgRemovalUseAdvancedByEmployee?: Set<string>;
  onProgress?: (current: number, total: number, employeeName?: string) => void;
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export async function generateBadgesPDF({
  employees,
  template,
  includeBackSide = false,
  pdfLayout = 'auto',
  removeBackground = false,
  bgRemovalEmployeeIds,
  bgRemovalTolerance,
  bgRemovalToleranceByEmployee,
  bgRemovalUseAdvancedByEmployee,
  onProgress,
}: GeneratePDFOptions): Promise<jsPDF> {
  const normalizedTemplate = normalizeTemplateForRender(template);
  if (!normalizedTemplate) throw new Error('Template é obrigatório para geração');

  const badgeW = normalizedTemplate.width_mm;
  const badgeH = normalizedTemplate.height_mm;
  const hasBackSide = includeBackSide && Boolean(
    normalizedTemplate.has_back_side ||
    normalizedTemplate.back_background_image_url ||
    normalizedTemplate.elements.some((element) => element.side === 'back')
  );

  const isMultiple = employees.length > 1;

  const assetMap = await prefetchTemplateImageAssets(employees, normalizedTemplate, (msg) => {
    onProgress?.(0, employees.length, msg);
  }, { removeBackground, bgRemovalEmployeeIds, bgRemovalTolerance, bgRemovalToleranceByEmployee, bgRemovalUseAdvancedByEmployee });

  if (!isMultiple) {
    // Single badge: one page at badge dimensions (existing behavior)
    const orientation = badgeW >= badgeH ? 'landscape' : 'portrait';
    const formatW = orientation === 'landscape' ? Math.max(badgeW, badgeH) : Math.min(badgeW, badgeH);
    const formatH = orientation === 'landscape' ? Math.min(badgeW, badgeH) : Math.max(badgeW, badgeH);

    const pdf = new jsPDF({ orientation, unit: 'mm', format: [formatW, formatH], compress: true });

    onProgress?.(1, 1, employees[0].full_name);
    await drawBadgeSideToPdf(pdf, employees[0], normalizedTemplate, assetMap, 'front');

    if (hasBackSide) {
      pdf.addPage([formatW, formatH], orientation);
      await drawBadgeSideToPdf(pdf, employees[0], normalizedTemplate, assetMap, 'back');
    }

    return pdf;
  }

  // Multiple badges: A4 pages with adaptive grid
  const MARGIN = 5; // mm safety margin
  const usableW = A4_W - MARGIN * 2;
  const usableH = A4_H - MARGIN * 2;

  let cols: number;
  let rows: number;
  let scale = 1;

  if (pdfLayout === 'grid-2x2') {
    // Force exactly 4 per page (2 columns × 2 rows), centered, without resizing template.
    cols = 2;
    rows = 2;
    // If two badges side-by-side don't fit on A4 with at least 2mm gap, scale down minimally.
    const minGap = 2;
    const requiredW = badgeW * cols + minGap * (cols - 1);
    const requiredH = badgeH * rows + minGap * (rows - 1);
    if (requiredW > usableW || requiredH > usableH) {
      scale = Math.min(usableW / requiredW, usableH / requiredH);
    }
  } else {
    // Auto: pack as many as fit
    cols = Math.max(Math.floor((usableW + 5) / (badgeW + 5)), 1);
    rows = Math.max(Math.floor((usableH + 5) / (badgeH + 5)), 1);
    if (badgeW > usableW || badgeH > usableH) {
      scale = Math.min(usableW / badgeW, usableH / badgeH);
    }
  }

  const perPage = cols * rows;
  const scaledW = badgeW * scale;
  const scaledH = badgeH * scale;

  // Center the grid on the page (equal gaps around and between)
  const gapH = cols > 1 ? (usableW - scaledW * cols) / (cols + 1) : (usableW - scaledW) / 2;
  const gapV = rows > 1 ? (usableH - scaledH * rows) / (rows + 1) : (usableH - scaledH) / 2;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

  if (scale < 1) {
    // Apply scale transform for all subsequent drawing
  }

  const chunks = chunkArray(employees, perPage);

  for (let ci = 0; ci < chunks.length; ci++) {
    const group = chunks[ci];
    if (ci > 0) pdf.addPage('a4', 'portrait');

    for (let idx = 0; idx < group.length; idx++) {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = MARGIN + gapH + col * (scaledW + gapH);
      const y = MARGIN + gapV + row * (scaledH + gapV);

      const empIndex = ci * perPage + idx;
      onProgress?.(empIndex + 1, employees.length, group[idx].full_name);

      if (scale < 1) {
        pdf.saveGraphicsState();
        // @ts-ignore - jsPDF internal matrix transform
        pdf.internal.write(`${scale} 0 0 ${scale} ${x * 72 / 25.4 * (1 - scale)} ${y * 72 / 25.4 * (1 - scale)} cm`);
      }
      await drawBadgeSideToPdf(pdf, group[idx], normalizedTemplate, assetMap, 'front', x, y);
      if (scale < 1) {
        pdf.restoreGraphicsState();
      }
    }

    // Back sides on a separate page if needed
    if (hasBackSide) {
      pdf.addPage('a4', 'portrait');
      for (let idx = 0; idx < group.length; idx++) {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const x = MARGIN + gapH + col * (scaledW + gapH);
        const y = MARGIN + gapV + row * (scaledH + gapV);

        await drawBadgeSideToPdf(pdf, group[idx], normalizedTemplate, assetMap, 'back', x, y);
      }
    }
  }

  return pdf;
}

/**
 * Generate a PNG for a single badge using html2canvas (kept for PNG export only).
 */
export async function generateBadgePNG(
  data: BadgeEmployeeData,
  template: BadgeTemplate,
  options: { removeBackground?: boolean; bgRemovalTolerance?: number } = {},
): Promise<Blob> {
  const { renderBadgeToCanvas } = await import('@/modules/crachas/lib/pdfCanvasRenderer');
  const normalizedTemplate = normalizeTemplateForRender(template);
  if (!normalizedTemplate) throw new Error('Template é obrigatório para geração');

  const assetMap = await prefetchTemplateImageAssets([data], normalizedTemplate, undefined, {
    removeBackground: options.removeBackground,
    bgRemovalTolerance: options.bgRemovalTolerance,
  });
  const canvas = await renderBadgeToCanvas(data, normalizedTemplate, assetMap, 'front');
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/png');
  });
}

export function downloadPDF(pdf: jsPDF, filename: string): void {
  pdf.save(filename);
}

export function printPDF(pdf: jsPDF): void {
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, '_blank');
  if (printWindow) {
    printWindow.onload = () => printWindow.print();
  }
}
