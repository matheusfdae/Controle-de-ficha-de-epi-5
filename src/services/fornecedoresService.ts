import { supabase } from '@/integrations/supabase/client';
import { soDigitos } from '@/lib/cnpj';

export interface Fornecedor {
  id: string;
  nome: string;
  cnpj: string | null;
  nicho: string | null;
  ativo: boolean;
  observacao: string | null;
}

export async function listFornecedores(): Promise<Fornecedor[]> {
  const { data, error } = await supabase
    .from('fornecedores').select('id, nome, cnpj, nicho, ativo, observacao').order('nome');
  if (error) throw error;
  return data ?? [];
}

export async function salvarFornecedor(f: Partial<Fornecedor> & { nome: string }): Promise<void> {
  const payload = {
    nome: f.nome.trim(),
    cnpj: soDigitos(f.cnpj) || null,
    nicho: f.nicho?.trim() || null,
    ativo: f.ativo ?? true,
    observacao: f.observacao?.trim() || null,
  };
  const { error } = f.id
    ? await supabase.from('fornecedores').update(payload).eq('id', f.id)
    : await supabase.from('fornecedores').insert(payload);
  if (error) {
    throw new Error(error.code === '23505' ? 'Já existe um fornecedor com este CNPJ.' : error.message);
  }
}

export async function excluirFornecedor(id: string): Promise<void> {
  const { error } = await supabase.from('fornecedores').delete().eq('id', id);
  if (error) throw error;
}
