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

// Seed demo data
export function seedDemoData(): void {
  if (getFichas().length > 0) return;
  
  const demo: EPIFicha = {
    id: generateId(),
    nomeColaborador: 'João da Silva',
    cpf: '123.456.789-00',
    matricula: '00123',
    cargo: 'Eletricista',
    setor: 'Manutenção',
    empresa: 'Empresa Exemplo Ltda',
    dataEntrega: new Date().toISOString().split('T')[0],
    status: 'pendente',
    criadoEm: new Date().toISOString(),
    itens: [
      { id: generateId(), nome: 'Capacete de Segurança', ca: '12345', quantidade: 1, dataEntrega: new Date().toISOString().split('T')[0], recebido: true },
      { id: generateId(), nome: 'Luvas de Proteção', ca: '23456', quantidade: 2, dataEntrega: new Date().toISOString().split('T')[0], recebido: true },
      { id: generateId(), nome: 'Óculos de Proteção', ca: '34567', quantidade: 1, dataEntrega: new Date().toISOString().split('T')[0], recebido: false },
      { id: generateId(), nome: 'Botina de Segurança', ca: '45678', quantidade: 1, dataEntrega: new Date().toISOString().split('T')[0], recebido: true },
      { id: generateId(), nome: 'Protetor Auricular', ca: '56789', quantidade: 2, dataEntrega: new Date().toISOString().split('T')[0], recebido: false },
    ],
  };
  saveFicha(demo);
}
