/**
 * Per-employee photo adjustments applied right before PDF/PNG generation.
 *
 * - zoom: scale factor applied to the photo inside its frame (1 = fit, 2 = 2x zoom-in).
 * - offsetX / offsetY: pan in percent of the frame (-50..50). 0 = centered.
 *   Positive offsetX moves the visible window to the right (shows more of the
 *   right side of the photo), positive offsetY moves it down.
 */
export interface PhotoAdjustment {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export const DEFAULT_PHOTO_ADJUSTMENT: PhotoAdjustment = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0, // mantém topo da foto (rosto) por padrão é controlado no renderer
};

export function isAdjustmentDefault(adj?: PhotoAdjustment | null): boolean {
  if (!adj) return true;
  return (
    Math.abs(adj.zoom - 1) < 0.001 &&
    Math.abs(adj.offsetX) < 0.001 &&
    Math.abs(adj.offsetY) < 0.001
  );
}

/**
 * Convert adjustment to a CSS object-position + transform style for an <img>
 * inside a clipped container with object-fit: cover.
 */
export function adjustmentToCssStyle(adj?: PhotoAdjustment | null): {
  objectPosition: string;
  transform: string;
  transformOrigin: string;
} {
  const a = adj || DEFAULT_PHOTO_ADJUSTMENT;
  // Map offsets (-50..50) to object-position percentage (0..100, with 50 = center).
  // Use "center top" baseline when adjustment is fully default to keep face visible.
  if (isAdjustmentDefault(a)) {
    return {
      objectPosition: 'center top',
      transform: 'none',
      transformOrigin: 'center center',
    };
  }
  const posX = 50 + a.offsetX; // %
  const posY = 50 + a.offsetY; // %
  return {
    objectPosition: `${posX}% ${posY}%`,
    transform: `scale(${a.zoom})`,
    transformOrigin: `${posX}% ${posY}%`,
  };
}
