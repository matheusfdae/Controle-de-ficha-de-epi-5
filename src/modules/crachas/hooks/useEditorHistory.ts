import { useState, useCallback, useRef } from 'react';
import { CanvasElement } from '@/modules/crachas/components/editor/types';

interface HistoryState {
  elements: CanvasElement[];
}

export function useEditorHistory(initialElements: CanvasElement[] = []) {
  const [elements, setElementsInternal] = useState<CanvasElement[]>(initialElements);
  const historyRef = useRef<HistoryState[]>([{ elements: initialElements }]);
  const indexRef = useRef(0);
  const maxHistory = 50;

  const setElements = useCallback((updater: CanvasElement[] | ((prev: CanvasElement[]) => CanvasElement[])) => {
    setElementsInternal(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      // Push to history
      const newHistory = historyRef.current.slice(0, indexRef.current + 1);
      newHistory.push({ elements: next });
      if (newHistory.length > maxHistory) newHistory.shift();
      historyRef.current = newHistory;
      indexRef.current = newHistory.length - 1;
      return next;
    });
  }, []);

  const loadElements = useCallback((els: CanvasElement[]) => {
    setElementsInternal(els);
    historyRef.current = [{ elements: els }];
    indexRef.current = 0;
  }, []);

  const undo = useCallback(() => {
    if (indexRef.current > 0) {
      indexRef.current -= 1;
      setElementsInternal(historyRef.current[indexRef.current].elements);
    }
  }, []);

  const redo = useCallback(() => {
    if (indexRef.current < historyRef.current.length - 1) {
      indexRef.current += 1;
      setElementsInternal(historyRef.current[indexRef.current].elements);
    }
  }, []);

  const canUndo = indexRef.current > 0;
  const canRedo = indexRef.current < historyRef.current.length - 1;

  return { elements, setElements, loadElements, undo, redo, canUndo, canRedo };
}
