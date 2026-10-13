/** Primeiro dígito da matrícula da Senior indica a empresa: 1 = MATRIZ, 3 = APOIO. */
export function empresaPelaMatricula(matricula: string): 'MATRIZ' | 'APOIO' | null {
  const primeiro = matricula.trim()[0];
  return primeiro === '1' ? 'MATRIZ' : primeiro === '3' ? 'APOIO' : null;
}
