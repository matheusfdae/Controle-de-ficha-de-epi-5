import type { ActionId, ModuleId, PermissionMap } from './permissions';

/**
 * Telas do menu que cada usuário enxerga (Usuários → Telas). Fica guardado em
 * user_permissions com module = "tela:<id>" e can_view. Tela SEM linha aparece
 * (assim quem já usava o sistema continua vendo tudo o que via); só some a tela
 * desmarcada. A permissão do módulo (ver/criar/editar/excluir) continua valendo
 * por cima: a tela aparece se estiver marcada E o módulo permitir.
 * O id é o mesmo `guia` do item no menu (AppSidebar).
 */
export interface TelaDef {
  id: string;
  label: string;
  grupo: string;
  /** Endereço da tela (a mais comprida que casar com a rota aberta manda). */
  url: string;
  /** Módulo/ação que a tela precisa para funcionar (marcada a tela, isso é ligado junto). */
  modulo?: ModuleId;
  acao?: ActionId;
}

export const TELAS: TelaDef[] = [
  { id: 'menu-dashboard', label: 'Dashboard', grupo: 'Geral', url: '/', modulo: 'dashboard' },
  { id: 'menu-assinar', label: 'Assinar (Tablet)', grupo: 'Geral', url: '/pendentes', modulo: 'assinar_tablet' },
  { id: 'menu-vencimentos', label: 'Vencimentos', grupo: 'Geral', url: '/vencimentos', modulo: 'vencimentos' },
  { id: 'menu-rank', label: 'Fichas por Posto', grupo: 'Geral', url: '/rank-postos', modulo: 'rank' },
  { id: 'menu-colaboradores-senior', label: 'Colaboradores Senior', grupo: 'Geral', url: '/colaboradores', modulo: 'colaboradores' },

  { id: 'menu-termo-coletivo', label: 'Termo Coletivo EPI', grupo: 'EPI', url: '/termos-coletivos' },
  { id: 'menu-consultar-epi', label: 'Consultar Termos EPI', grupo: 'EPI', url: '/termos-epi', modulo: 'termos_coletivos' },

  { id: 'menu-nova-ficha-uniforme', label: 'Nova Ficha Uniforme', grupo: 'Uniforme', url: '/nova-ficha', modulo: 'fichas_uniforme', acao: 'create' },
  { id: 'menu-consultar-uniforme', label: 'Consultar Fichas Uniforme', grupo: 'Uniforme', url: '/consultar' },

  { id: 'menu-crachas', label: 'Painel de Crachás', grupo: 'Crachás', url: '/crachas', modulo: 'crachas' },
  { id: 'menu-crachas-colaboradores', label: 'Colaboradores (crachás)', grupo: 'Crachás', url: '/crachas/colaboradores', modulo: 'crachas' },
  { id: 'menu-crachas-solicitar', label: 'Solicitações de crachá', grupo: 'Crachás', url: '/crachas/solicitar', modulo: 'crachas' },
  { id: 'menu-crachas-gerar', label: 'Gerar Crachás', grupo: 'Crachás', url: '/crachas/gerar', modulo: 'crachas', acao: 'create' },
  { id: 'menu-crachas-modelos', label: 'Modelos de Crachá', grupo: 'Crachás', url: '/crachas/modelos', modulo: 'crachas' },
  { id: 'menu-crachas-historico', label: 'Histórico de crachás', grupo: 'Crachás', url: '/crachas/historico', modulo: 'crachas' },
  { id: 'menu-crachas-relatorios', label: 'Relatórios de crachás', grupo: 'Crachás', url: '/crachas/relatorios', modulo: 'crachas' },
  { id: 'menu-crachas-config', label: 'Config. de Crachás', grupo: 'Crachás', url: '/crachas/configuracoes', modulo: 'crachas', acao: 'edit' },

  { id: 'menu-pedidos', label: 'Pedidos', grupo: 'Pedidos de material', url: '/pedidos', modulo: 'pedidos_material' },
  { id: 'menu-pedidos-estoque', label: 'Estoque do Posto', grupo: 'Pedidos de material', url: '/pedidos/estoque', modulo: 'pedidos_material' },
  { id: 'menu-pedidos-gerencial', label: 'Painel Gerencial', grupo: 'Pedidos de material', url: '/pedidos/gerencial', modulo: 'pedidos_material' },
  { id: 'menu-pedidos-gasto', label: 'Gasto Mensal', grupo: 'Pedidos de material', url: '/pedidos/gasto-mensal', modulo: 'pedidos_material' },
  { id: 'menu-pedidos-config', label: 'Config. de Pedidos', grupo: 'Pedidos de material', url: '/pedidos/configuracoes', modulo: 'pedidos_material' },

  { id: 'menu-integracao', label: 'Integração', grupo: 'Administração', url: '/integracao', modulo: 'integracao' },
  { id: 'menu-estoque', label: 'Estoque', grupo: 'Administração', url: '/estoque', modulo: 'estoque' },
  { id: 'menu-funcoes', label: 'Funções', grupo: 'Administração', url: '/funcoes', modulo: 'funcoes' },
  { id: 'menu-postos', label: 'Postos', grupo: 'Administração', url: '/postos', modulo: 'configuracoes' },
  { id: 'menu-modelos-ficha', label: 'Modelos de Ficha', grupo: 'Administração', url: '/modelos-ficha', modulo: 'configuracoes' },
  { id: 'menu-configuracoes', label: 'Configurações', grupo: 'Administração', url: '/configuracoes', modulo: 'configuracoes' },
];

export const GRUPOS_TELAS = [...new Set(TELAS.map(t => t.grupo))];

/** tela -> aparece? (tela sem marcação = aparece) */
export type TelasMap = Record<string, boolean>;
export const PREFIXO_TELA = 'tela:';

export const ehLinhaDeTela = (module?: string | null) => !!module && module.startsWith(PREFIXO_TELA);

export function telasDasLinhas(rows: { module?: string | null; can_view?: boolean | null }[]): TelasMap {
  const m: TelasMap = {};
  for (const r of rows) if (ehLinhaDeTela(r.module)) m[r.module!.slice(PREFIXO_TELA.length)] = !!r.can_view;
  return m;
}

/** Linhas para gravar: uma por tela (marcada ou não). */
export function linhasDasTelas(telas: TelasMap) {
  return TELAS.map(t => ({
    module: `${PREFIXO_TELA}${t.id}`, can_view: telas[t.id] !== false, can_create: false, can_edit: false, can_delete: false,
  }));
}

export const telaVisivel = (telas: TelasMap, id: string) => telas[id] !== false;

/** Tela da rota aberta (para bloquear quem digitar o endereço de uma tela desmarcada). */
export function telaDaRota(pathname: string): TelaDef | undefined {
  const casa = (url: string) => (url === '/' ? pathname === '/' : pathname === url || pathname.startsWith(`${url}/`));
  return TELAS.filter(t => casa(t.url)).sort((a, b) => b.url.length - a.url.length)[0];
}

/** Ao marcar uma tela, liga o que o módulo dela precisa (ver + a ação da tela). */
export function ligarModuloDaTela(perms: PermissionMap, tela: TelaDef): PermissionMap {
  if (!tela.modulo) return perms;
  const atual = perms[tela.modulo] ?? {};
  return { ...perms, [tela.modulo]: { ...atual, view: true, ...(tela.acao ? { [tela.acao]: true } : {}) } };
}
