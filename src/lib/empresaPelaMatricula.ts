/** Nome das empresas como vem da Senior (R030EMP.NomEmp): 1 = matriz (segurança), 3 = apoio. */
export const EMPRESAS_SENIOR = {
  1: '5 ESTRELAS SISTEMA DE SEGURANÇA LTDA',
  3: '5 ESTRELAS SERVIÇOS DE APOIO',
} as const;

const limpar = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();

/** Primeiro dígito da matrícula da Senior indica a empresa: 1 = matriz, 3 = apoio. */
export function empresaPelaMatricula(matricula: string): string | null {
  const primeiro = matricula.trim()[0];
  return primeiro === '1' ? EMPRESAS_SENIOR[1] : primeiro === '3' ? EMPRESAS_SENIOR[3] : null;
}

/** Empresa do colaborador na Senior: o nome da empresa; sem ele, a razão social da filial. */
export function empresaDaSenior(empresaNome: string | null | undefined, razaoSocial?: string | null): string | null {
  return limpar(empresaNome) || limpar(razaoSocial) || null;
}
