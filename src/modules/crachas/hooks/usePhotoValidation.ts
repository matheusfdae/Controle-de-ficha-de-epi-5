import { useState, useCallback } from 'react';
import { toDisplayablePhotoUrl } from '@/modules/crachas/lib/photoUtils';

export type PhotoStatus = 'pending' | 'valid' | 'invalid';

export function usePhotoValidation() {
  const [photoStatuses, setPhotoStatuses] = useState<Record<string, PhotoStatus>>({});
  const [isValidating, setIsValidating] = useState(false);
  const [progress, setProgress] = useState(0);

  const validatePhoto = (url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const displayUrl = toDisplayablePhotoUrl(url);
      if (!displayUrl) {
        resolve(false);
        return;
      }
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      const timeout = setTimeout(() => {
        img.src = '';
        resolve(false);
      }, 8000);
      img.onload = () => { clearTimeout(timeout); resolve(true); };
      img.onerror = () => { clearTimeout(timeout); resolve(false); };
      img.src = displayUrl;
    });
  };

  const validateAll = useCallback(async (employees: { id: string; photo_url: string | null }[]) => {
    setIsValidating(true);
    setProgress(0);

    const withPhotos = employees.filter(e => e.photo_url);
    const results: Record<string, PhotoStatus> = {};

    // Mark employees without photos
    employees.forEach(e => {
      if (!e.photo_url) results[e.id] = 'invalid';
    });

    // Validate in batches of 5
    const batchSize = 5;
    for (let i = 0; i < withPhotos.length; i += batchSize) {
      const batch = withPhotos.slice(i, i + batchSize);
      const promises = batch.map(async (emp) => {
        const ok = await validatePhoto(emp.photo_url!);
        results[emp.id] = ok ? 'valid' : 'invalid';
      });
      await Promise.all(promises);
      setProgress(Math.round(((i + batch.length) / withPhotos.length) * 100));
      setPhotoStatuses({ ...results });
    }

    setPhotoStatuses(results);
    setIsValidating(false);
    setProgress(100);
    return results;
  }, []);

  const clearValidation = useCallback(() => {
    setPhotoStatuses({});
    setProgress(0);
  }, []);

  const validCount = Object.values(photoStatuses).filter(s => s === 'valid').length;
  const invalidCount = Object.values(photoStatuses).filter(s => s === 'invalid').length;

  return { photoStatuses, isValidating, progress, validateAll, clearValidation, validCount, invalidCount };
}
