import QRCode from 'qrcode';
import { removeBackground as imglyRemoveBackground } from '@imgly/background-removal';
import { supabase } from '@/integrations/supabase/client';
import { BADGE_DESIGN } from '@/modules/crachas/lib/defaultTemplates';
import { BadgeEmployeeData, getFieldValue } from '@/modules/crachas/lib/badgeFieldMap';
import { getPhotoUrl } from '@/modules/crachas/lib/photoUtils';
import type { BadgeTemplate, TemplateElement } from '@/modules/crachas/components/badge/BadgeRenderer';

async function fetchViaProxy(url: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('proxy-image', {
      body: { url },
    });

    if (error) {
      console.warn('[BadgeAssets] Proxy fetch failed:', error.message);
      return null;
    }

    const dataUrl = data?.dataUrl || null;
    // Guard: only accept actual images. Google Drive may return an HTML login page
    // when the file isn't shared as "Anyone with the link".
    if (dataUrl && !dataUrl.startsWith('data:image/')) {
      console.warn('[BadgeAssets] Proxy returned non-image content (likely Drive login page). URL:', url);
      return null;
    }
    return dataUrl;
  } catch (error) {
    console.warn('[BadgeAssets] Proxy fetch exception:', error);
    return null;
  }
}

export async function waitForBadgeFonts(fontFamily = BADGE_DESIGN.fontFamily, timeoutMs = 10000): Promise<boolean> {
  if (typeof document === 'undefined' || !('fonts' in document)) {
    return true;
  }

  const primaryFont = fontFamily
    .split(',')[0]
    ?.replace(/["']/g, '')
    .trim() || 'Poppins';

  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`400 16px "${primaryFont}"`),
        document.fonts.load(`700 16px "${primaryFont}"`),
        document.fonts.ready,
      ]),
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error('font-timeout')), timeoutMs);
      }),
    ]);

    return true;
  } catch {
    return false;
  }
}

export async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  if (!url || url === '/placeholder.svg') return null;
  if (url.startsWith('data:')) return url;

  try {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (response.ok) {
      const blob = await response.blob();
      if (blob.size > 0 && blob.type.startsWith('image/')) {
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      }
    }
  } catch {
    // Ignore and fallback to other strategies.
  }

  if (!url.includes('drive.google.com') && !url.includes('googleusercontent.com')) {
    try {
      const result = await new Promise<string | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.referrerPolicy = 'no-referrer';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
              resolve(null);
              return;
            }

            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        window.setTimeout(() => resolve(null), 8000);
        img.src = url;
      });

      if (result) return result;
    } catch {
      // Ignore and fallback to proxy.
    }
  }

  return fetchViaProxy(url);
}

export function collectTemplateImageUrls(employees: BadgeEmployeeData[], template: BadgeTemplate): string[] {
  const urlsToFetch = new Set<string>();

  if (template.background_image_url) urlsToFetch.add(template.background_image_url);
  if (template.back_background_image_url) urlsToFetch.add(template.back_background_image_url);

  for (const element of template.elements || []) {
    if (element.element_type !== 'image' && element.element_type !== 'photo') continue;

    if (element.static_value && !element.field_binding) {
      urlsToFetch.add(element.static_value);
      continue;
    }

    for (const employee of employees) {
      const raw = getFieldValue(employee, element.field_binding) || employee.photo_url;
      const url = getPhotoUrl(raw);
      if (url && url !== '/placeholder.svg') {
        urlsToFetch.add(url);
      }
    }
  }

  return [...urlsToFetch];
}

export function collectQrValues(employees: BadgeEmployeeData[], elements: TemplateElement[]): string[] {
  const values = new Set<string>();

  for (const element of elements) {
    if (element.element_type !== 'qrcode') continue;

    for (const employee of employees) {
      const value = getFieldValue(employee, element.field_binding) || element.static_value || '';
      if (value.trim()) {
        values.add(value.trim());
      }
    }
  }

  return [...values];
}

// In-memory + sessionStorage cache for photos with background color replaced by white.
// Key = original URL, value = flattened image data URL with the person preserved.
// v5 = AI-based removal (@imgly/background-removal) with white flatten.
const BG_REMOVAL_CACHE_PREFIX = 'bg-white-v5:';
const bgRemovalMemCache = new Map<string, string>();

function readBgRemovalCache(url: string): string | null {
  if (bgRemovalMemCache.has(url)) return bgRemovalMemCache.get(url)!;
  try {
    const cached = sessionStorage.getItem(BG_REMOVAL_CACHE_PREFIX + url);
    if (cached) {
      bgRemovalMemCache.set(url, cached);
      return cached;
    }
  } catch {
    // sessionStorage may be unavailable
  }
  return null;
}

function writeBgRemovalCache(url: string, dataUrl: string) {
  bgRemovalMemCache.set(url, dataUrl);
  try {
    sessionStorage.setItem(BG_REMOVAL_CACHE_PREFIX + url, dataUrl);
  } catch {
    // Quota exceeded — keep memory cache only.
  }
}

/**
 * Composes a transparent PNG (data URL) onto a solid white background and
 * returns the resulting JPEG data URL. Used to flatten AI background-removal
 * output for badge rendering (badges expect opaque photos with white bg).
 */
async function flattenOnWhite(transparentDataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(transparentDataUrl);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch {
        resolve(transparentDataUrl);
      }
    };
    img.onerror = () => resolve(transparentDataUrl);
    img.src = transparentDataUrl;
  });
}

/**
 * Edge-cleanup flatten: removes the gray halo that appears when semi-transparent
 * pixels (typical at hair/silhouette edges produced by background-removal models)
 * are blended over white. The cleanup intensity is driven by `tolerance`:
 *  - alpha threshold: pixels with alpha below this are forced to pure white
 *  - whiteness threshold: pixels close to white (low saturation, high luma) are
 *    snapped to pure white; only applied to pixels whose original alpha was
 *    not fully opaque (i.e. likely from the cut-out border)
 */
async function flattenOnWhiteWithEdgeCleanup(
  transparentDataUrl: string,
  tolerance = 25,
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(transparentDataUrl);
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        // Map tolerance (3..120) to cleanup aggressiveness.
        const t = Math.max(3, Math.min(120, tolerance));
        // alphaCut: 0..255 — pixels with alpha < alphaCut become fully white.
        // At t=25 -> ~64; at t=60 -> ~140; at t=120 -> ~220.
        const alphaCut = Math.round((t / 120) * 220);
        // whitenessCut: 0..255 — for non-opaque pixels, if min(R,G,B) >= cut and
        // they look near-grayscale, snap to white. Lower = more aggressive.
        const whitenessCut = Math.round(255 - (t / 120) * 90); // 232..165
        // chromaTol: max(R,G,B)-min(R,G,B) allowed to be considered grayscale.
        const chromaTol = Math.round(8 + (t / 120) * 22); // 8..30

        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a === 0) {
            data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
            continue;
          }
          if (a < alphaCut) {
            // Likely halo — force pure white.
            data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
            continue;
          }
          if (a < 255) {
            // Semi-transparent — blend over white now, then evaluate halo.
            const af = a / 255;
            const r = Math.round(data[i] * af + 255 * (1 - af));
            const g = Math.round(data[i + 1] * af + 255 * (1 - af));
            const b = Math.round(data[i + 2] * af + 255 * (1 - af));
            const mn = Math.min(r, g, b);
            const mx = Math.max(r, g, b);
            if (mn >= whitenessCut && mx - mn <= chromaTol) {
              data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
            } else {
              data[i] = r; data[i + 1] = g; data[i + 2] = b;
            }
            data[i + 3] = 255;
          } else {
            // Fully opaque — keep as-is, only force alpha=255.
            data[i + 3] = 255;
          }
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch {
        resolve(transparentDataUrl);
      }
    };
    img.onerror = () => resolve(transparentDataUrl);
    img.src = transparentDataUrl;
  });
}

/**
 * Replace the background of a portrait photo with pure white using a flood-fill
 * from the image edges. Detects the dominant edge color and replaces all
 * connected similar pixels with white. Works without AI — purely client-side.
 *
 * Tuned for typical ID portraits where the background is a relatively uniform
 * color (gray, blue, green) and the subject does not touch all four edges.
 */
async function replaceBackgroundWithWhiteLocal(dataUrl: string, tolerance = 25): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) return resolve(dataUrl);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(dataUrl);
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, w, h);
        const px = imgData.data;

        // Sample edge pixels to estimate background color(s). We collect samples
        // from the top edge + the two upper side strips (most ID portraits have
        // the background behind the head/shoulders).
        const samples: Array<[number, number, number]> = [];
        const sampleStep = Math.max(1, Math.floor(Math.min(w, h) / 60));
        // Top strip (top 20% rows)
        const topBand = Math.max(2, Math.floor(h * 0.2));
        for (let y = 0; y < topBand; y += sampleStep) {
          for (let x = 0; x < w; x += sampleStep) {
            const i = (y * w + x) * 4;
            samples.push([px[i], px[i + 1], px[i + 2]]);
          }
        }
        // Side strips (left/right 8% columns, full height)
        const sideBand = Math.max(2, Math.floor(w * 0.08));
        for (let y = 0; y < h; y += sampleStep) {
          for (let x = 0; x < sideBand; x += sampleStep) {
            const iL = (y * w + x) * 4;
            samples.push([px[iL], px[iL + 1], px[iL + 2]]);
            const xR = w - 1 - x;
            const iR = (y * w + xR) * 4;
            samples.push([px[iR], px[iR + 1], px[iR + 2]]);
          }
        }
        if (samples.length === 0) return resolve(dataUrl);

        // Median per channel — robust to outliers (e.g. subject touching edge).
        const sortBy = (idx: number) => [...samples].sort((a, b) => a[idx] - b[idx]);
        const mid = Math.floor(samples.length / 2);
        const bgR = sortBy(0)[mid][0];
        const bgG = sortBy(1)[mid][1];
        const bgB = sortBy(2)[mid][2];

        // Tolerance is user-adjustable (default 25 = very conservative).
        // Range: 5 (almost nothing) → 80 (aggressive). Higher values risk
        // bleeding into skin/hair on portraits with similar-toned backgrounds.
        const TOL = Math.max(3, Math.min(120, tolerance));
        const TOL_SQ = TOL * TOL * 3;
        const colorDistSq = (r: number, g: number, b: number) =>
          (r - bgR) * (r - bgR) + (g - bgG) * (g - bgG) + (b - bgB) * (b - bgB);

        // Single pass: flood-fill from all edges only. This guarantees we only
        // touch pixels CONNECTED to the border, which is the actual background.
        // The subject (person) is never reached because skin/clothing breaks
        // the connectivity chain.
        const visited = new Uint8Array(w * h);
        const stack: number[] = [];

        const seed = (x: number, y: number) => {
          const idx = y * w + x;
          if (visited[idx]) return;
          const i = idx * 4;
          if (colorDistSq(px[i], px[i + 1], px[i + 2]) > TOL_SQ) return;
          stack.push(idx);
          visited[idx] = 1;
        };
        for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
        for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }

        while (stack.length) {
          const idx = stack.pop()!;
          const x = idx % w;
          const y = (idx - x) / w;
          const i = idx * 4;
          px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = 255;

          const neighbors = [
            x > 0 ? idx - 1 : -1,
            x < w - 1 ? idx + 1 : -1,
            y > 0 ? idx - w : -1,
            y < h - 1 ? idx + w : -1,
          ];
          for (const n of neighbors) {
            if (n < 0 || visited[n]) continue;
            const ni = n * 4;
            // Use the same strict tolerance for propagation — never bleed into
            // the subject through anti-aliased edges.
            if (colorDistSq(px[ni], px[ni + 1], px[ni + 2]) <= TOL_SQ) {
              visited[n] = 1;
              stack.push(n);
            }
          }
        }

        // Protected zone: the central-bottom rectangle is where the uniform/
        // clothing lives on a portrait. We never whiten pixels here so that
        // gray/light shirts don't get destroyed by the feathering or the
        // shadow pass below.
        const protectX0 = Math.floor(w * 0.18);
        const protectX1 = Math.floor(w * 0.82);
        const protectY0 = Math.floor(h * 0.58);
        const isProtected = (x: number, y: number) =>
          x >= protectX0 && x < protectX1 && y >= protectY0;

        // Background luminance — used by the shadow detector below.
        const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;

        // A "shadow" pixel is desaturated (close to gray) and darker than the
        // background but not too dark (clothing/skin in shadow gets excluded
        // by the saturation gate). Tuned to catch wall shadows behind the head.
        const isShadowLike = (r: number, g: number, b: number) => {
          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          const chroma = maxC - minC; // 0 = perfectly gray
          if (chroma > 22) return false; // colored pixel — not a shadow
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          // Shadow is darker than background but within ~45% of its luminance.
          return lum <= bgLum + 5 && lum >= bgLum * 0.55;
        };

        // Feathering + shadow pass: only pixels ADJACENT to confirmed bg get
        // whitened, AND only if they are either (a) close in color to the
        // background OR (b) detected as a soft shadow of the background.
        // Protected zone (uniform area) is always skipped.
        const SOFT_TOL = TOL * 1.6;
        const SOFT_TOL_SQ = SOFT_TOL * SOFT_TOL * 3;
        // Up to 4 thin rings to chase the shadow gradient outward from the
        // confirmed background, but each ring requires direct adjacency so we
        // never jump into the subject.
        for (let pass = 0; pass < 4; pass++) {
          const additions: number[] = [];
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const idx = y * w + x;
              if (visited[idx]) continue;
              if (isProtected(x, y)) continue;
              const touchesBg =
                (x > 0 && visited[idx - 1]) ||
                (x < w - 1 && visited[idx + 1]) ||
                (y > 0 && visited[idx - w]) ||
                (y < h - 1 && visited[idx + w]);
              if (!touchesBg) continue;
              const i = idx * 4;
              const r = px[i], g = px[i + 1], b = px[i + 2];
              const colorMatch = colorDistSq(r, g, b) <= SOFT_TOL_SQ;
              const shadowMatch = isShadowLike(r, g, b);
              if (colorMatch || shadowMatch) {
                additions.push(idx);
              }
            }
          }
          for (const idx of additions) {
            visited[idx] = 1;
            const i = idx * 4;
            px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = 255;
          }
          if (additions.length === 0) break;
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch (err) {
        console.warn('[BadgeAssets] local bg replacement failed:', err);
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Validates that the photo edges are white (>= 95% white pixels in border bands).
 * Returns true if the photo passes the white-background check.
 */
async function validateWhiteBackground(dataUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) return resolve(false);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(false);
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, w, h).data;

        const isWhite = (i: number) =>
          data[i] >= 240 && data[i + 1] >= 240 && data[i + 2] >= 240;

        let total = 0;
        let white = 0;
        // Check top 8% rows + side 5% columns (full height).
        const topBand = Math.max(2, Math.floor(h * 0.08));
        const sideBand = Math.max(2, Math.floor(w * 0.05));
        for (let y = 0; y < topBand; y++) {
          for (let x = 0; x < w; x += 2) {
            const i = (y * w + x) * 4;
            total++;
            if (isWhite(i)) white++;
          }
        }
        for (let y = 0; y < h; y += 2) {
          for (let x = 0; x < sideBand; x++) {
            const iL = (y * w + x) * 4;
            const iR = (y * w + (w - 1 - x)) * 4;
            total += 2;
            if (isWhite(iL)) white++;
            if (isWhite(iR)) white++;
          }
        }
        const ratio = total > 0 ? white / total : 0;
        resolve(ratio >= 0.9);
      } catch {
        resolve(false);
      }
    };
    img.onerror = () => resolve(false);
    img.src = dataUrl;
  });
}

/**
 * Aggressive fallback: paints white over ALL border pixels (top 40%, sides 18%,
 * bottom 8%) regardless of color similarity. Guarantees a white frame around
 * the subject even if the local algorithm fails. Used as a last resort to
 * ensure batch consistency.
 */
async function forceWhiteBorders(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) return resolve(dataUrl);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(dataUrl);
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, w, h);
        const px = imgData.data;

        // Sample edge bg color
        const samples: Array<[number, number, number]> = [];
        for (let x = 0; x < w; x += 4) {
          const i0 = x * 4;
          samples.push([px[i0], px[i0 + 1], px[i0 + 2]]);
        }
        const sortBy = (idx: number) => [...samples].sort((a, b) => a[idx] - b[idx]);
        const mid = Math.floor(samples.length / 2);
        const bgR = sortBy(0)[mid][0];
        const bgG = sortBy(1)[mid][1];
        const bgB = sortBy(2)[mid][2];
        const TOL = 160;
        const TOL_SQ = TOL * TOL * 3;
        const colorDistSq = (r: number, g: number, b: number) =>
          (r - bgR) * (r - bgR) + (g - bgG) * (g - bgG) + (b - bgB) * (b - bgB);

        // Aggressive band whitening — only whitens pixels that aren't clearly
        // dark/saturated (i.e. preserves clothing/hair on the subject silhouette).
        const inBand = (x: number, y: number) => {
          const topBand = Math.floor(h * 0.40);
          const sideBand = Math.floor(w * 0.18);
          const bottomBand = Math.floor(h * 0.08);
          return y < topBand || y >= h - bottomBand || x < sideBand || x >= w - sideBand;
        };

        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (!inBand(x, y)) continue;
            const i = (y * w + x) * 4;
            if (colorDistSq(px[i], px[i + 1], px[i + 2]) <= TOL_SQ) {
              px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = 255;
            }
          }
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Calls the `remove-bg` edge function (Lovable AI / Gemini) to perform a
 * high-quality background removal. Used when the local imgly model leaves
 * residues (halos, shadows, complex backgrounds). Result is flattened on
 * white and cached separately.
 */
export async function replacePhotoBackgroundWithAdvancedAI(
  originalUrl: string,
  dataUrl: string,
): Promise<string> {
  const cacheKey = `${originalUrl}::ai=advanced`;
  const cached = readBgRemovalCache(cacheKey);
  if (cached) return cached;

  try {
    const { data, error } = await supabase.functions.invoke('remove-bg', {
      body: { imageDataUrl: dataUrl },
    });
    // Detect specific gateway errors (credits / rate limit) so the UI can react.
    const errMsg = (error as any)?.message || '';
    const errCtxStatus = (error as any)?.context?.status;
    const dataErr = (data as any)?.error;
    if (errCtxStatus === 402 || dataErr === 'credits-exhausted' || /402|credits-exhausted|payment_required/i.test(errMsg)) {
      const e: any = new Error('credits-exhausted');
      e.code = 'credits-exhausted';
      throw e;
    }
    if (errCtxStatus === 429 || dataErr === 'rate-limited' || /429|rate-limited/i.test(errMsg)) {
      const e: any = new Error('rate-limited');
      e.code = 'rate-limited';
      throw e;
    }
    if (error) throw error;
    const generated = (data as any)?.dataUrl as string | undefined;
    if (!generated || !generated.startsWith('data:image/')) {
      throw new Error('no-image-returned');
    }
    // Edge function already returns white background, but flatten to ensure JPEG opacity.
    const flattened = await flattenOnWhite(generated);
    writeBgRemovalCache(cacheKey, flattened);
    return flattened;
  } catch (err: any) {
    // Re-throw quota errors so the caller can show a friendly message and disable advanced mode.
    if (err?.code === 'credits-exhausted' || err?.code === 'rate-limited') {
      throw err;
    }
    console.warn('[BadgeAssets] Advanced AI background removal failed, falling back to imgly:', err);
    return replacePhotoBackgroundWithWhite(originalUrl, dataUrl, 25);
  }
}

/**
 * Removes the photo background using @imgly/background-removal (the same AI
 * model used in the manual upload flow), then flattens the result onto white.
 * Falls back to the conservative flood-fill if the AI model fails for any
 * reason (network, WASM init, browser quota, etc.).
 */
export async function replacePhotoBackgroundWithWhite(
  originalUrl: string,
  dataUrl: string,
  tolerance = 25,
): Promise<string> {
  // Tolerance is part of the cache key so different intensities don't collide.
  const cacheKey = `${originalUrl}::ai=imgly::t=${Math.round(tolerance)}`;
  const cached = readBgRemovalCache(cacheKey);
  if (cached) return cached;

  // 1) Try the AI model (handles non-uniform backgrounds, shadows, gradients).
  try {
    const blob = await fetch(dataUrl).then((r) => r.blob());
    const cutoutBlob = await imglyRemoveBackground(blob, {
      model: 'isnet_fp16',
      output: { format: 'image/png', quality: 0.9 },
    });
    const transparentDataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error || new Error('reader-failed'));
      reader.readAsDataURL(cutoutBlob);
    });
    const flattened = await flattenOnWhiteWithEdgeCleanup(transparentDataUrl, tolerance);
    writeBgRemovalCache(cacheKey, flattened);
    return flattened;
  } catch (err) {
    console.warn('[BadgeAssets] AI background removal failed, falling back to flood-fill:', err);
  }

  // 2) Fallback: conservative single-pass flood-fill from the image edges.
  const candidate = await replaceBackgroundWithWhiteLocal(dataUrl, tolerance);
  writeBgRemovalCache(cacheKey, candidate);
  return candidate;
}

async function removeBackgroundFromDataUrl(
  originalUrl: string,
  dataUrl: string,
  tolerance = 25,
): Promise<string> {
  return replacePhotoBackgroundWithWhite(originalUrl, dataUrl, tolerance);
}

export interface PrefetchOptions {
  removeBackground?: boolean;
  /**
   * If provided, restricts background removal to photos of employees whose IDs
   * are in this set. Useful when the user wants to apply BG removal only to a
   * sample, while still using the cached result for the rest of the batch.
   */
  bgRemovalEmployeeIds?: Set<string>;
  /**
   * Tolerance for the background color match (3–120). Lower values are more
   * conservative (preserve more of the person). Default: 25.
   */
  bgRemovalTolerance?: number;
  /**
   * Per-employee tolerance overrides, keyed by employee.id. When set, takes
   * precedence over `bgRemovalTolerance` for that specific employee's photo.
   */
  bgRemovalToleranceByEmployee?: Record<string, number>;
  /**
   * Set of employee IDs that should use the advanced AI removal (Lovable AI
   * Gemini via the `remove-bg` edge function) instead of the local imgly model.
   * Useful for difficult photos with complex backgrounds, halos or shadows.
   */
  bgRemovalUseAdvancedByEmployee?: Set<string>;
}

export async function prefetchTemplateImageAssets(
  employees: BadgeEmployeeData[],
  template: BadgeTemplate,
  onProgress?: (message: string) => void,
  options: PrefetchOptions = {},
): Promise<Map<string, string>> {
  const assetMap = new Map<string, string>();
  const urls = collectTemplateImageUrls(employees, template);

  if (urls.length === 0) {
    return assetMap;
  }

  // Identify which URLs correspond to employee photos (eligible for bg removal).
  const photoUrlSet = new Set<string>();
  // Per-URL tolerance map (filled when there are per-employee overrides).
  const urlToTolerance = new Map<string, number>();
  // URLs whose owners requested the advanced AI (Gemini edge function).
  const urlToUseAdvanced = new Set<string>();
  const perEmployeeTol = options.bgRemovalToleranceByEmployee || {};
  const advancedIds = options.bgRemovalUseAdvancedByEmployee;
  if (options.removeBackground) {
    const allowedIds = options.bgRemovalEmployeeIds;
    for (const element of template.elements || []) {
      if (element.element_type !== 'photo' && element.element_type !== 'image') continue;
      if (!element.field_binding && element.static_value) continue;
      for (const employee of employees) {
        if (allowedIds && !allowedIds.has(employee.id)) continue;
        const raw = getFieldValue(employee, element.field_binding) || employee.photo_url;
        const url = getPhotoUrl(raw);
        if (url && url !== '/placeholder.svg') {
          photoUrlSet.add(url);
          const override = perEmployeeTol[employee.id];
          if (typeof override === 'number') {
            urlToTolerance.set(url, override);
          }
          if (advancedIds && advancedIds.has(employee.id)) {
            urlToUseAdvanced.add(url);
          }
        }
      }
    }
  }

  onProgress?.(`Carregando ${urls.length} recurso(s) visual(is)...`);

  let fetched = 0;
  for (let index = 0; index < urls.length; index += 3) {
    const batch = urls.slice(index, index + 3);
    const results = await Promise.all(
      batch.map(async (url) => ({
        url,
        dataUrl: await fetchImageAsDataUrl(url),
      }))
    );

    for (const { url, dataUrl } of results) {
      if (dataUrl) {
        assetMap.set(url, dataUrl);
        fetched += 1;
      }
    }

    onProgress?.(`Recursos carregados: ${fetched}/${urls.length}`);
  }

  if (options.removeBackground && photoUrlSet.size > 0) {
    const photoUrls = [...photoUrlSet].filter((u) => assetMap.has(u));
    let processed = 0;
    onProgress?.(`Trocando fundo para branco em ${photoUrls.length} foto(s)...`);
    let advancedDisabled = false;
    for (const url of photoUrls) {
      const original = assetMap.get(url)!;
      const useAdvanced = urlToUseAdvanced.has(url) && !advancedDisabled;
      let cleaned: string;
      if (useAdvanced) {
        onProgress?.(`Reprocessando com IA avançada (${processed + 1}/${photoUrls.length})...`);
        try {
          cleaned = await replacePhotoBackgroundWithAdvancedAI(url, original);
        } catch (err: any) {
          if (err?.code === 'credits-exhausted' || err?.code === 'rate-limited') {
            advancedDisabled = true;
            onProgress?.(`IA avançada indisponível (${err.code}). Usando modo padrão para as próximas fotos.`);
            const tol = urlToTolerance.get(url) ?? options.bgRemovalTolerance;
            cleaned = await removeBackgroundFromDataUrl(url, original, tol);
          } else {
            throw err;
          }
        }
      } else {
        const tol = urlToTolerance.get(url) ?? options.bgRemovalTolerance;
        cleaned = await removeBackgroundFromDataUrl(url, original, tol);
      }
      assetMap.set(url, cleaned);
      processed += 1;
      onProgress?.(`Fundo branco aplicado: ${processed}/${photoUrls.length}`);
    }
  }

  return assetMap;
}

export async function createQrCodeDataUrl(value: string, size = 512): Promise<string | null> {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  try {
    return await QRCode.toDataURL(trimmedValue, {
      margin: 0,
      width: size,
      errorCorrectionLevel: 'M',
      color: {
        dark: BADGE_DESIGN.corPrimaria,
        light: '#0000',
      },
    });
  } catch (error) {
    console.warn('[BadgeAssets] QR generation failed:', error);
    return null;
  }
}