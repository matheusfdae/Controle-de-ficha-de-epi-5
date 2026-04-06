export interface EPIItem {
  id: string;
  nome: string;
  ca: string;
  quantidade: number;
  dataEntrega: string;
  recebido: boolean;
}

export interface EPIFicha {
  id: string;
  nomeColaborador: string;
  cpf: string;
  matricula: string;
  cargo: string;
  setor: string;
  empresa: string;
  dataEntrega: string;
  itens: EPIItem[];
  assinaturaColaborador?: string; // base64 image
  assinaturaResponsavel?: string; // base64 image
  status: 'pendente' | 'assinada';
  criadoEm: string;
  assinadoEm?: string;
}
