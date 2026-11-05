import { supabase } from '@/integrations/supabase/client';

// Master (migration 20261105140000_master.sql): apagar qualquer registro do sistema,
// com tudo o que depende dele, e restaurar pela lixeira (90 dias).

export interface TabelaMaster { tabela: string; registros: number; selecionavel: boolean }
export interface RegistroMaster { id: string; resumo: string; dados: Record<string, unknown> }
export interface PreviaMaster { total: number; apaga: { tabela: string; quantidade: number }[]; desliga: { tabela: string; quantidade: number }[] }
export interface LoteLixeira {
  id: string; tabela: string; resumo: string | null; quantidades: Record<string, number>; total: number; motivo: string | null;
  apagado_por_nome: string | null; apagado_em: string; restaurado_em: string | null; restaurado_por_nome: string | null;
}

async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

let souMasterCache: Promise<boolean> | null = null;
/** O usuário logado é Master? (uma consulta por sessão da página) */
export function souMaster(): Promise<boolean> {
  souMasterCache ??= rpc<boolean>('sou_master').then(Boolean).catch(() => { souMasterCache = null; return false; });
  return souMasterCache;
}

export const listarTabelas = () => rpc<TabelaMaster[]>('master_tabelas');
export const buscarRegistros = (tabela: string, busca: string) => rpc<RegistroMaster[]>('master_buscar', { _tabela: tabela, _busca: busca, _limite: 200 });
export const previaApagar = (tabela: string, ids: string[]) => rpc<PreviaMaster>('master_previa', { _tabela: tabela, _ids: ids });
export const apagar = (tabela: string, ids: string[], motivo: string) =>
  rpc<{ lote: string; total: number }>('master_apagar', { _tabela: tabela, _ids: ids, _motivo: motivo || null });
export const listarLixeira = () => rpc<LoteLixeira[]>('master_lixeira');
export const restaurar = (lote: string) => rpc<{ restaurados: number }>('master_restaurar', { _lote: lote });

/** Nome amigável das tabelas mais usadas; as outras aparecem pelo nome técnico. */
const NOMES: Record<string, string> = {
  fichas_epi: 'Fichas de EPI', fichas_epi_itens: 'Itens de ficha de EPI', fichas_uniforme: 'Fichas de uniforme', fichas_uniforme_itens: 'Itens de ficha de uniforme',
  fichas_selfies: 'Selfies das fichas', fichas_assinaturas_anteriores: 'Assinaturas anteriores das fichas', assinaturas: 'Assinaturas', assinatura_tokens: 'Links de assinatura',
  assinaturas_usuario: 'Assinaturas dos usuários', profiles: 'Usuários', user_roles: 'Papéis dos usuários', user_permissions: 'Permissões dos usuários', user_estados: 'Estados dos usuários',
  colaboradores_senior: 'Colaboradores (Senior)', colaboradores_integracao: 'Integração (admissões)', postos: 'Postos', funcoes: 'Funções', funcao_epis: 'EPIs por função',
  epis: 'EPIs', epi_tamanhos: 'Tamanhos de EPI', epi_codigos_fornecedor: 'Códigos de EPI no fornecedor', uniformes: 'Uniformes', modelos_ficha: 'Modelos de ficha',
  movimentacoes_estoque: 'Movimentações de estoque', entradas_estoque: 'Entradas de estoque (NF)', entradas_estoque_itens: 'Itens das entradas de estoque', estoque_minimos: 'Estoque mínimo',
  alertas_estoque: 'Alertas de estoque', fornecedores: 'Fornecedores', termos_epi_coletivos: 'Termos coletivos', termos_epi_coletivos_itens: 'Itens dos termos coletivos',
  termo_coletivo_tokens: 'Links dos termos coletivos', notificacoes: 'Notificações', estados: 'Estados (UF)',
  pedidos_material: 'Pedidos de material', pedidos_material_itens: 'Itens dos pedidos de material', pedido_eventos: 'Histórico dos pedidos', pedido_recorrencias: 'Pedidos recorrentes',
  pedido_aprovadores: 'Aprovadores de pedido', pedido_alerta_contatos: 'Contatos do alerta WhatsApp', pedido_alertas_whatsapp: 'Alertas WhatsApp enviados', posto_materiais: 'Itens por posto',
  materiais: 'Materiais de limpeza', estoque_posto: 'Estoque do posto', estoque_plantoes: 'Plantões de estoque', estoque_plantao_itens: 'Itens dos plantões', estoque_plantao_fotos: 'Fotos dos plantões',
  cracha_employees: 'Crachás: colaboradores', cracha_badge_templates: 'Crachás: modelos', cracha_template_elements: 'Crachás: elementos do modelo', cracha_generation_batches: 'Crachás: lotes gerados',
  cracha_batch_items: 'Crachás: itens dos lotes', cracha_solicitacao_tentativas: 'Crachás: solicitações',
};
export const nomeTabela = (t: string) => NOMES[t] ?? t;
