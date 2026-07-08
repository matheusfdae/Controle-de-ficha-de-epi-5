export type ModuleId =
  | 'dashboard'
  | 'fichas_epi'
  | 'fichas_uniforme'
  | 'termos_coletivos'
  | 'estoque'
  | 'vencimentos'
  | 'rank'
  | 'integracao'
  | 'funcoes'
  | 'usuarios'
  | 'configuracoes'
  | 'assinar_tablet';

export type ActionId = 'view' | 'create' | 'edit' | 'delete';

export interface ModuleDef {
  id: ModuleId;
  label: string;
  /** Ações que fazem sentido para esse módulo */
  actions: ActionId[];
}

export const MODULES: ModuleDef[] = [
  { id: 'dashboard',        label: 'Dashboard',         actions: ['view'] },
  { id: 'assinar_tablet',   label: 'Assinar (Tablet)',  actions: ['view'] },
  { id: 'fichas_epi',       label: 'Fichas EPI',        actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'fichas_uniforme',  label: 'Fichas Uniforme',   actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'termos_coletivos', label: 'Termos Coletivos',  actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'estoque',          label: 'Estoque',           actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'vencimentos',      label: 'Vencimentos',       actions: ['view'] },
  { id: 'rank',             label: 'Rank por Posto',    actions: ['view'] },
  { id: 'integracao',       label: 'Integração',        actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'funcoes',          label: 'Funções',           actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'usuarios',         label: 'Usuários',          actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'configuracoes',    label: 'Configurações',     actions: ['view', 'edit'] },
];

export type PermissionMap = Record<ModuleId, Partial<Record<ActionId, boolean>>>;

export type RolePreset = 'admin' | 'rh' | 'supervisor' | 'almoxarife' | 'colaborador';

const ALL: Partial<Record<ActionId, boolean>> = { view: true, create: true, edit: true, delete: true };
const VIEW: Partial<Record<ActionId, boolean>> = { view: true };
const CRUD_NO_DEL: Partial<Record<ActionId, boolean>> = { view: true, create: true, edit: true };

export function emptyPermissions(): PermissionMap {
  return MODULES.reduce((acc, m) => {
    acc[m.id] = {};
    return acc;
  }, {} as PermissionMap);
}

export const ROLE_PRESETS: Record<RolePreset, PermissionMap> = {
  admin: MODULES.reduce((acc, m) => { acc[m.id] = { ...ALL }; return acc; }, {} as PermissionMap),
  rh: {
    ...emptyPermissions(),
    dashboard: VIEW, assinar_tablet: VIEW,
    fichas_epi: ALL, fichas_uniforme: ALL, termos_coletivos: ALL,
    vencimentos: VIEW, rank: VIEW,
    integracao: ALL, funcoes: CRUD_NO_DEL, usuarios: ALL,
    configuracoes: { view: true, edit: true },
    estoque: VIEW,
  },
  supervisor: {
    ...emptyPermissions(),
    dashboard: VIEW, assinar_tablet: VIEW,
    fichas_epi: VIEW, fichas_uniforme: VIEW, termos_coletivos: VIEW,
    vencimentos: VIEW, rank: VIEW,
  },
  almoxarife: {
    ...emptyPermissions(),
    dashboard: VIEW, assinar_tablet: VIEW,
    fichas_epi: CRUD_NO_DEL, fichas_uniforme: CRUD_NO_DEL, termos_coletivos: CRUD_NO_DEL,
    estoque: ALL, vencimentos: VIEW,
  },
  colaborador: {
    ...emptyPermissions(),
    assinar_tablet: VIEW,
  },
};

export interface PermissionRow {
  module: ModuleId;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export function permissionsToRows(perms: PermissionMap): PermissionRow[] {
  return MODULES.map((m) => ({
    module: m.id,
    can_view: !!perms[m.id]?.view,
    can_create: !!perms[m.id]?.create,
    can_edit: !!perms[m.id]?.edit,
    can_delete: !!perms[m.id]?.delete,
  }));
}

export function rowsToPermissions(rows: Array<Partial<PermissionRow>>): PermissionMap {
  const map = emptyPermissions();
  for (const r of rows) {
    if (!r.module) continue;
    map[r.module as ModuleId] = {
      view: !!r.can_view,
      create: !!r.can_create,
      edit: !!r.can_edit,
      delete: !!r.can_delete,
    };
  }
  return map;
}

export const ROLE_LABELS: Record<RolePreset, string> = {
  admin: 'Administrador',
  rh: 'RH',
  supervisor: 'Supervisor',
  almoxarife: 'Almoxarife',
  colaborador: 'Colaborador',
};

export const ROLE_BADGE_CLASS: Record<RolePreset, string> = {
  admin: 'bg-primary text-primary-foreground',
  rh: 'bg-purple-600 text-white',
  supervisor: 'bg-blue-600 text-white',
  almoxarife: 'bg-amber-600 text-white',
  colaborador: 'bg-muted text-muted-foreground',
};
