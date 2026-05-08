const KEY = 'epi_empresas';

export interface Empresa {
  id: string;
  nome: string;
  subtitulo?: string;
  cnpj?: string;
  endereco?: string;
  responsavelNome?: string;
  responsavelCargo?: string;
}

function readAll(): Empresa[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeAll(list: Empresa[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function listEmpresas(): Empresa[] {
  return readAll();
}

export function saveEmpresa(e: Omit<Empresa, 'id'> & { id?: string }): Empresa {
  const list = readAll();
  if (e.id) {
    const idx = list.findIndex(x => x.id === e.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...e } as Empresa;
      writeAll(list);
      return list[idx];
    }
  }
  const novo: Empresa = { ...e, id: crypto.randomUUID() } as Empresa;
  list.push(novo);
  writeAll(list);
  return novo;
}

export function deleteEmpresa(id: string) {
  writeAll(readAll().filter(e => e.id !== id));
}
