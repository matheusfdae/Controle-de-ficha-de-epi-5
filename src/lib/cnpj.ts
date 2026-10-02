export const soDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/** Confere os dois dígitos verificadores do CNPJ. */
export function cnpjValido(cnpj: string): boolean {
  const d = soDigitos(cnpj).split('').map(Number);
  if (d.length !== 14 || d.every(n => n === d[0])) return false;
  const dv = (n: number[], pesos: number[]) => {
    const r = n.reduce((s, x, i) => s + x * pesos[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return dv(d.slice(0, 12), p1) === d[12] && dv(d.slice(0, 13), [6, ...p1]) === d[13];
}

export function formatarCnpj(cnpj: string | null | undefined): string {
  const d = soDigitos(cnpj);
  return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : d;
}
