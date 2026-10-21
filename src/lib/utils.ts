import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Data da ficha no formato DD/MM/AA ("2026-10-21" → "21/10/26"); outro formato fica como veio. */
export function dataCurta(valor: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : (valor ?? '');
}
