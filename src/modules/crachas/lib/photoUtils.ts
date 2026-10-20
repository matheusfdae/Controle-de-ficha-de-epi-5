/**
 * Extracts a Google Drive file ID from various URL formats.
 */
function extractDriveFileId(url: string): string | null {
  // /file/d/{ID}/
  const fileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];

  // open?id={ID}
  const openMatch = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return openMatch[1];

  // uc?id={ID} or uc?export=view&id={ID}
  const ucMatch = url.match(/drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/);
  if (ucMatch) return ucMatch[1];

  // thumbnail?id={ID}
  const thumbMatch = url.match(/drive\.google\.com\/thumbnail\?.*id=([a-zA-Z0-9_-]+)/);
  if (thumbMatch) return thumbMatch[1];

  return null;
}

/**
 * Converts various Google Drive URL formats to a direct displayable image URL.
 * Uses lh3.googleusercontent.com which has better CORS support.
 */
export function toDisplayablePhotoUrl(url: string | null | undefined): string | null {
  if (!url || url.trim() === '') return null;

  const trimmed = url.trim();

  // Already a direct image or data URI
  if (trimmed.startsWith('data:image')) return trimmed;

  // Arquivo do Storage gravado sem o endereço (fotos das solicitações): usa o
  // mesmo endereço da API do app, que funciona dentro e fora da rede.
  if (trimmed.startsWith('/storage/')) return `${import.meta.env.VITE_SUPABASE_URL}${trimmed}`;

  // Check for Google Drive URL
  const driveId = extractDriveFileId(trimmed);
  if (driveId) {
    // Use thumbnail endpoint - most reliable for shared Drive files
    return `https://drive.google.com/thumbnail?id=${driveId}&sz=w400`;
  }

  // Already a lh3 URL
  if (trimmed.includes('lh3.googleusercontent.com') || trimmed.includes('googleusercontent.com')) {
    if (!trimmed.includes('=')) return `${trimmed}=s400`;
    return trimmed;
  }

  // Regular URL - return as-is
  return trimmed;
}

/**
 * Returns the Google Drive thumbnail URL as fallback (for PDF generation).
 */
export function toDriveThumbnailUrl(url: string | null | undefined): string | null {
  if (!url || url.trim() === '') return null;
  const driveId = extractDriveFileId(url.trim());
  if (driveId) {
    return `https://drive.google.com/thumbnail?id=${driveId}&sz=w400`;
  }
  return null;
}

/**
 * Component-friendly: returns a displayable URL or a fallback.
 */
export function getPhotoUrl(url: string | null | undefined, fallback = '/placeholder.svg'): string {
  const displayable = toDisplayablePhotoUrl(url);
  return displayable || fallback;
}
