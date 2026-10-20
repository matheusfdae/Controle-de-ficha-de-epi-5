export interface Employee {
  id: string;
  nomeCompleto: string;
  matricula: string;
  cargo: string;
  unidade: string;
  empresa: string;
  fotoUrl: string;
  tipoCracha: string;
  dataValidade: string;
  observacoes?: string;
  status: 'ativo' | 'emitido' | 'reemitido' | 'cancelado';
  createdAt: string;
  updatedAt: string;
}

export interface BadgeTemplate {
  id: string;
  nome: string;
  descricao: string;
  largura: number;
  altura: number;
  layoutUrl?: string;
  campos: BadgeField[];
  createdAt: string;
  updatedAt: string;
}

export interface BadgeField {
  id: string;
  tipo: 'texto' | 'foto' | 'qrcode' | 'logo';
  campo: string;
  x: number;
  y: number;
  largura: number;
  altura: number;
  fonte?: string;
  tamanhoFonte?: number;
  cor?: string;
  alinhamento?: 'left' | 'center' | 'right';
}

export interface BadgeHistory {
  id: string;
  employeeId: string;
  templateId: string;
  acao: 'emitido' | 'reemitido' | 'cancelado' | 'alterado';
  dataAcao: string;
  usuario: string;
  observacao?: string;
}

export interface SyncStatus {
  lastSync: string | null;
  isSyncing: boolean;
  totalRecords: number;
  errors: string[];
}
