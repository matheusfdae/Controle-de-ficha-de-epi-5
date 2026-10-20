import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FilePlus2, Search, CalendarClock, Settings, ShieldCheck, LogOut, Users, Package, Briefcase, UserPlus, ClipboardSignature, HardHat, Shirt, FileSignature, MapPin, FileStack,
  IdCard, Palette, Printer, History, BarChart3, Inbox,
} from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ModuleId, ActionId } from '@/lib/permissions';

const baseItems: Array<{ title: string; guia: string; url: string; icon: typeof LayoutDashboard; end: boolean; module: ModuleId }> = [
  { title: 'Dashboard', guia: 'menu-dashboard', url: '/', icon: LayoutDashboard, end: true, module: 'dashboard' },
  { title: 'Assinar (Tablet)', guia: 'menu-assinar', url: '/pendentes', icon: ClipboardSignature, end: false, module: 'assinar_tablet' },
  { title: 'Vencimentos', guia: 'menu-vencimentos', url: '/vencimentos', icon: CalendarClock, end: false, module: 'vencimentos' },
  { title: 'Fichas por Posto', guia: 'menu-rank', url: '/rank-postos', icon: MapPin, end: false, module: 'rank' },
  { title: 'Colaboradores Senior', guia: 'menu-colaboradores-senior', url: '/colaboradores', icon: Users, end: false, module: 'colaboradores' },
];

const epiItems: Array<{ title: string; guia: string; url: string; icon: typeof FilePlus2; end: boolean; module?: ModuleId; action?: ActionId }> = [
  { title: 'Nova Ficha EPI', guia: 'menu-nova-ficha-epi', url: '/nova-ficha?tipo=epi', icon: FilePlus2, end: false, module: 'fichas_epi', action: 'create' },
  { title: 'Termo Coletivo EPI', guia: 'menu-termo-coletivo', url: '/termos-coletivos', icon: FileSignature, end: false },
  { title: 'Consultar Fichas EPI', guia: 'menu-consultar-epi', url: '/consultar?tipo=epi', icon: Search, end: false },
];

const uniformeItems: Array<{ title: string; guia: string; url: string; icon: typeof FilePlus2; end: boolean; module?: ModuleId; action?: ActionId }> = [
  { title: 'Nova Ficha Uniforme', guia: 'menu-nova-ficha-uniforme', url: '/nova-ficha?tipo=uniforme', icon: FilePlus2, end: false, module: 'fichas_uniforme', action: 'create' },
  { title: 'Consultar Fichas Uniforme', guia: 'menu-consultar-uniforme', url: '/consultar?tipo=uniforme', icon: Search, end: false },
];

const crachaItems: Array<{ title: string; guia: string; url: string; icon: typeof IdCard; end: boolean; action?: ActionId }> = [
  { title: 'Painel de Crachás', guia: 'menu-crachas', url: '/crachas', icon: IdCard, end: true },
  { title: 'Colaboradores', guia: 'menu-crachas-colaboradores', url: '/crachas/colaboradores', icon: Users, end: false },
  { title: 'Solicitações', guia: 'menu-crachas-solicitar', url: '/crachas/solicitar', icon: Inbox, end: false },
  { title: 'Gerar Crachás', guia: 'menu-crachas-gerar', url: '/crachas/gerar', icon: Printer, end: false, action: 'create' },
  { title: 'Modelos de Crachá', guia: 'menu-crachas-modelos', url: '/crachas/modelos', icon: Palette, end: false },
  { title: 'Histórico', guia: 'menu-crachas-historico', url: '/crachas/historico', icon: History, end: false },
  { title: 'Relatórios', guia: 'menu-crachas-relatorios', url: '/crachas/relatorios', icon: BarChart3, end: false },
  { title: 'Config. de Crachás', guia: 'menu-crachas-config', url: '/crachas/configuracoes', icon: Settings, end: false, action: 'edit' },
];

// "Usuários" fica de fora daqui — continua exclusivo de Admin/RH (isAdmin),
// não vira controlável pela matriz de permissões.
const adminItems: Array<{ title: string; guia: string; url: string; icon: typeof Package; end: boolean; module: ModuleId }> = [
  { title: 'Integração', guia: 'menu-integracao', url: '/integracao', icon: UserPlus, end: false, module: 'integracao' },
  { title: 'Estoque', guia: 'menu-estoque', url: '/estoque', icon: Package, end: false, module: 'estoque' },
  { title: 'Funções', guia: 'menu-funcoes', url: '/funcoes', icon: Briefcase, end: false, module: 'funcoes' },
  { title: 'Postos', guia: 'menu-postos', url: '/postos', icon: MapPin, end: false, module: 'configuracoes' },
  { title: 'Modelos de Ficha', guia: 'menu-modelos-ficha', url: '/modelos-ficha', icon: FileStack, end: false, module: 'configuracoes' },
  { title: 'Configurações', guia: 'menu-configuracoes', url: '/configuracoes', icon: Settings, end: false, module: 'configuracoes' },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { pathname } = useLocation();
  const { user, logout, isAdmin, can } = useAuth();

  const isActive = (path: string, end?: boolean) =>
    end ? pathname === path : pathname === path || pathname.startsWith(path + '/');

  const visibleBaseItems = baseItems.filter(i => can(i.module, 'view'));
  const visibleEpiItems = epiItems.filter(i => !i.module || can(i.module, i.action ?? 'view'));
  const visibleUniformeItems = uniformeItems.filter(i => !i.module || can(i.module, i.action ?? 'view'));
  const visibleCrachaItems = crachaItems.filter(i => can('crachas', i.action ?? 'view'));
  const visibleAdminItems = adminItems.filter(i => can(i.module, 'view'));
  const showAdminSection = isAdmin || visibleAdminItems.length > 0;

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b px-3 py-4">
        <div className="flex items-center gap-2.5">
          <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-bold text-sm text-foreground leading-tight truncate">EPI Manager</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Gestão de Segurança</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operacional</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleBaseItems.map(item => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url, item.end)} tooltip={item.title}>
                    <NavLink to={item.url} end={item.end} data-guia={item.guia} className="flex items-center gap-2.5">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span className="text-sm">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-1.5"><HardHat className="h-3 w-3" /> EPI</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleEpiItems.map(item => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url.split('?')[0], item.end)} tooltip={item.title}>
                    <NavLink to={item.url} end={item.end} data-guia={item.guia} className="flex items-center gap-2.5">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span className="text-sm">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-1.5"><Shirt className="h-3 w-3" /> Uniforme</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleUniformeItems.map(item => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url.split('?')[0], item.end)} tooltip={item.title}>
                    <NavLink to={item.url} end={item.end} data-guia={item.guia} className="flex items-center gap-2.5">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span className="text-sm">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleCrachaItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-1.5"><IdCard className="h-3 w-3" /> Crachás</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleCrachaItems.map(item => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url, item.end)} tooltip={item.title}>
                      <NavLink to={item.url} end={item.end} data-guia={item.guia} className="flex items-center gap-2.5">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span className="text-sm">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {showAdminSection && (
          <SidebarGroup>
            <SidebarGroupLabel>Administração</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdminItems.map(item => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url, item.end)} tooltip={item.title}>
                      <NavLink to={item.url} end={item.end} data-guia={item.guia} className="flex items-center gap-2.5">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span className="text-sm">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {isAdmin && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive('/usuarios', false)} tooltip="Usuários">
                      <NavLink to="/usuarios" data-guia="menu-usuarios" className="flex items-center gap-2.5">
                        <Users className="h-4 w-4" />
                        {!collapsed && <span className="text-sm">Usuários</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t p-3">
        {!collapsed ? (
          <div className="space-y-2">
            <div className="px-1 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{user?.nome}</p>
                <p className="text-[10px] text-muted-foreground truncate">@{user?.username}</p>
              </div>
              <Badge variant={isAdmin ? 'default' : 'secondary'} className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                {isAdmin ? 'ADMIN' : 'OPERADOR'}
              </Badge>
            </div>
            <Button variant="outline" size="sm" onClick={logout} className="w-full h-8">
              <LogOut className="h-3.5 w-3.5 mr-1.5" /> Sair
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="icon" onClick={logout} title="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
