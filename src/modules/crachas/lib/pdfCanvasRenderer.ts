/**
 * Canvas-based badge renderer — used ONLY for PNG export.
 * PDF generation uses native jsPDF drawing via pdfBadgeDrawer.ts.
 */
import html2canvas from 'html2canvas';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { BadgeEmployeeData } from '@/modules/crachas/lib/badgeFieldMap';
import { getPhotoUrl } from '@/modules/crachas/lib/photoUtils';
import { BadgeRenderer, type BadgeTemplate } from '@/modules/crachas/components/badge/BadgeRenderer';
import { waitForBadgeFonts } from '@/modules/crachas/lib/badgeAssets';

const MM_TO_PX = 3.78;
const EXPORT_CAPTURE_SCALE = 3;

export async function renderBadgeToCanvas(
  data: BadgeEmployeeData,
  template: BadgeTemplate,
  assetMap: Map<string, string>,
  side: 'front' | 'back' = 'front',
): Promise<HTMLCanvasElement> {
  const fontsReady = await waitForBadgeFonts();
  if (!fontsReady) {
    throw new Error('A fonte Poppins não carregou completamente para a exportação.');
  }

  const pxW = Math.round(template.width_mm * MM_TO_PX);
  const pxH = Math.round(template.height_mm * MM_TO_PX);

  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed; top: 0; left: 0;
    width: ${pxW}px; height: ${pxH}px;
    z-index: -9999; opacity: 0; pointer-events: none;
    overflow: visible; background: white;
    transform: none; margin: 0; padding: 0; box-sizing: border-box;
  `;
  document.body.appendChild(container);

  const resolvedPhotoUrl = getPhotoUrl(data.photo_url);
  const resolvedData: BadgeEmployeeData = {
    ...data,
    photo_url: assetMap.get(resolvedPhotoUrl) || resolvedPhotoUrl || data.photo_url,
  };

  const resolvedTemplate: BadgeTemplate = {
    ...template,
    background_image_url: template.background_image_url
      ? assetMap.get(template.background_image_url) || template.background_image_url
      : null,
    back_background_image_url: template.back_background_image_url
      ? assetMap.get(template.back_background_image_url) || template.back_background_image_url
      : template.back_background_image_url,
    elements: (template.elements || []).map((element) => {
      if ((element.element_type === 'image' || element.element_type === 'photo') && element.static_value && !element.field_binding) {
        return { ...element, static_value: assetMap.get(element.static_value) || element.static_value };
      }
      return element;
    }),
  };

  const root = createRoot(container);
  flushSync(() => {
    root.render(createElement(BadgeRenderer, {
      data: resolvedData,
      template: resolvedTemplate,
      scale: 1,
      side,
      renderMode: 'export',
    }));
  });

  let badgeDiv: HTMLElement | null = null;
  const mountTimeout = Date.now() + 4000;
  while (Date.now() < mountTimeout) {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    badgeDiv = container.querySelector('.badge-renderer') as HTMLElement | null;
    if (badgeDiv) break;
  }

  if (!badgeDiv) {
    root.unmount();
    document.body.removeChild(container);
    throw new Error('Falha ao montar preview do crachá para exportação');
  }

  badgeDiv.style.transform = 'none';
  badgeDiv.style.overflow = 'visible';
  badgeDiv.style.width = `${pxW}px`;
  badgeDiv.style.height = `${pxH}px`;

  const assetTimeout = Date.now() + 15000;
  while (Date.now() < assetTimeout) {
    const images = Array.from(badgeDiv.querySelectorAll('img'));
    if (!images.some((img) => !img.complete || img.naturalWidth === 0)) break;
    await new Promise((r) => setTimeout(r, 120));
  }

  await document.fonts.ready;
  await new Promise((r) => setTimeout(r, 800));

  const canvas = await html2canvas(container, {
    scale: EXPORT_CAPTURE_SCALE,
    useCORS: true,
    allowTaint: true,
    width: pxW,
    height: pxH,
    backgroundColor: '#ffffff',
    logging: false,
    imageTimeout: 15000,
  });

  root.unmount();
  document.body.removeChild(container);
  return canvas;
}
