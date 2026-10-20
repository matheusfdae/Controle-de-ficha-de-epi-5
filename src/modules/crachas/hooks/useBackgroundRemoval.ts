import { useState, useCallback } from 'react';
import { removeBackground as imglyRemoveBackground } from '@imgly/background-removal';

/**
 * Hook para remoção automática de fundo de fotos usando @imgly/background-removal.
 * Processa client-side (WASM). Retorna uma data URL PNG transparente.
 */
export function useBackgroundRemoval() {
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const removeBackground = useCallback(async (file: File): Promise<string> => {
    setIsRemoving(true);
    setError(null);
    try {
      // 'isnet_fp16' é o modelo mais rápido/leve disponível (equivalente ao "small").
      const blob = await imglyRemoveBackground(file, {
        model: 'isnet_fp16',
        output: {
          format: 'image/png',
          quality: 0.9,
        },
      });

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error || new Error('Falha ao ler imagem'));
        reader.readAsDataURL(blob);
      });

      return dataUrl;
    } catch (err: any) {
      const message = err?.message || 'Não foi possível remover o fundo da foto.';
      setError(message);
      throw err;
    } finally {
      setIsRemoving(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setIsRemoving(false);
  }, []);

  return { isRemoving, error, removeBackground, reset };
}
