import { EPIFicha } from '@/types/epi';

const STORAGE_KEY = 'epi_fichas';

export function getFichas(): EPIFicha[] {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

export function getFichaById(id: string): EPIFicha | undefined {
  return getFichas().find(f => f.id === id);
}

export function saveFicha(ficha: EPIFicha): void {
  const fichas = getFichas();
  const idx = fichas.findIndex(f => f.id === ficha.id);
  if (idx >= 0) {
    fichas[idx] = ficha;
  } else {
    fichas.push(ficha);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fichas));
}

export function deleteFicha(id: string): void {
  const fichas = getFichas().filter(f => f.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fichas));
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function seedDemoData(): void {
  if (getFichas().length > 0) return;

  const today = new Date().toISOString().split('T')[0];
  const in30 = new Date(Date.now() + 25 * 86400000).toISOString().split('T')[0];
  const expired = new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0];

  const demo: EPIFicha = {
    id: generateId(),
    nomeFuncionario: 'João da Silva',
    funcao: 'ASG',
    telefone: '(61) 99999-0000',
    cpf: '123.456.789-00',
    matricula: '00123',
    motivo: 'admissao',
    turno: 'diurno',
    setor: 'Manutenção',
    empresa: 'Empresa Exemplo Ltda',
    dataEntrega: today,
    status: 'pendente',
    criadoEm: new Date().toISOString(),
    itens: [
      { id: generateId(), descricao: 'Gandola em Gabardine Azul', ca: '', quantidade: 2, tamanho: 'M', dataEntrega: today, postoServico: 'Sede', recebido: true, dataValidade: in30 },
      { id: generateId(), descricao: 'Calça em Gabardine Azul', ca: '', quantidade: 2, tamanho: '42', dataEntrega: today, postoServico: 'Sede', recebido: true, dataValidade: expired },
      { id: generateId(), descricao: 'Sapato Antiderrapante Spider Pro', ca: '48583', quantidade: 1, tamanho: '40', dataEntrega: today, postoServico: 'Sede', recebido: false, dataValidade: in30 },
      { id: generateId(), descricao: 'Luvas de Proteção', ca: '12345', quantidade: 2, tamanho: 'G', dataEntrega: today, postoServico: 'Sede', recebido: true },
      { id: generateId(), descricao: 'Protetor Auricular', ca: '56789', quantidade: 2, tamanho: '', dataEntrega: today, postoServico: 'Sede', recebido: false },
    ],
  };
  saveFicha(demo);
}
