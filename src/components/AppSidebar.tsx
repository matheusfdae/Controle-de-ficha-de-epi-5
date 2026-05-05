import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FilePlus2, Search, CalendarClock, Settings, ShieldCheck, LogOut,
} from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

const items = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard, end: true },
  { title: 'Nova Ficha', url: '/nova-ficha', icon: FilePlus2 },
  { title: 'Consultar Fichas', url: '/consultar', icon: Search },
  { title: 'Vencimentos', url: '/vencimentos', icon: CalendarClock },
  { title: 'Configurações', url: '/configuracoes', icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { pathname } = useLocation();
  const { user, logout } = useAuth();

  const isActive = (path: string, end?: boolean) =>
    end ? pathname === path : pathname === path || pathname.startsWith(path + '/');

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
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map(item => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url, item.end)}
                    tooltip={item.title}
                  >
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
      </SidebarContent>

      <SidebarFooter className="border-t p-3">
        {!collapsed ? (
          <div className="space-y-2">
            <div className="px-1">
              <p className="text-xs font-semibold text-foreground truncate">{user?.nome}</p>
              <p className="text-[10px] text-muted-foreground truncate">@{user?.username}</p>
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
