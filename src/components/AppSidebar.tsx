import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FilePlus2, Search, CalendarClock, Settings, ShieldCheck, LogOut, Users, Package, Briefcase,
} from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const baseItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard, end: true, adminOnly: false },
  { title: 'Nova Ficha', url: '/nova-ficha', icon: FilePlus2, end: false, adminOnly: true },
  { title: 'Consultar Fichas', url: '/consultar', icon: Search, end: false, adminOnly: false },
  { title: 'Vencimentos', url: '/vencimentos', icon: CalendarClock, end: false, adminOnly: false },
];

const adminItems = [
  { title: 'Estoque', url: '/estoque', icon: Package, end: false },
  { title: 'Funções', url: '/funcoes', icon: Briefcase, end: false },
  { title: 'Usuários', url: '/usuarios', icon: Users, end: false },
  { title: 'Configurações', url: '/configuracoes', icon: Settings, end: false },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { pathname } = useLocation();
  const { user, logout, isAdmin } = useAuth();

  const isActive = (path: string, end?: boolean) =>
    end ? pathname === path : pathname === path || pathname.startsWith(path + '/');

  const visibleBase = baseItems.filter(i => !i.adminOnly || isAdmin);

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
              {visibleBase.map(item => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url, item.end)} tooltip={item.title}>
                    <NavLink to={item.url} end={item.end} className="flex items-center gap-2.5">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span className="text-sm">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administração</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map(item => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url, item.end)} tooltip={item.title}>
                      <NavLink to={item.url} end={item.end} className="flex items-center gap-2.5">
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
