export type MotivoEntrega = 'admissao' | 'substituicao' | 'perda_extravio' | 'demissao' | 'complemento';
export type Turno = 'diurno' | 'noturno';

export interface DevolucaoInfo {
  data?: string;
  quantidade?: number;
  recebidoPor?: string;
}

export interface EPIItem {
  id: string;
  descricao: string;
  ca: string;
  quantidade: number;
  tamanho: string;
  dataEntrega: string;
  postoServico: string;
  recebido: boolean;
  devolucao?: DevolucaoInfo;
  /** Data de validade do CA/EPI */
  dataValidade?: string;
  /** ID do EPI no catálogo (para baixa de estoque) */
  epiId?: string;
}

export interface EPIFicha {
  id: string;
  /** Número sequencial da ficha (fichas_epi.numero). */
  numero?: number;
  nomeFuncionario: string;
  funcao: string;
  telefone: string;
  motivo: MotivoEntrega;
  turno: Turno;
  empresa: string;
  cpf: string;
  matricula: string;
  posto: string;
  /** Estado (UF) da ficha: de onde sai o estoque. Fixo depois de criada. */
  uf: string;
  dataEntrega: string;
  itens: EPIItem[];
  assinaturaColaborador?: string;
  assinaturaResponsavel?: string;
  status: 'pendente' | 'assinada';
  criadoEm: string;
  assinadoEm?: string;
  observacoes?: string;
  /** Modelo de layout do PDF (ver src/services/modelosFichaService.ts) */
  modeloId?: string;
}
