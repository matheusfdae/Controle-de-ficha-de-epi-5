import { Outlet, useLocation } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { Separator } from '@/components/ui/separator';
import InstallAppButton from '@/components/InstallAppButton';

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/nova-ficha': 'Nova Ficha',
  '/consultar': 'Consultar Fichas',
  '/vencimentos': 'Controle de Vencimentos',
  '/configuracoes': 'Configurações',
  '/usuarios': 'Gestão de Usuários',
};

export default function AppLayout() {
  const { pathname } = useLocation();
  const title =
    titles[pathname] ||
    (pathname.startsWith('/ficha/') ? 'Detalhes da Ficha' : 'EPI Manager');

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-muted/20">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 h-14 flex items-center gap-2 border-b bg-background/80 backdrop-blur px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-5 mx-1" />
            <h1 className="text-sm font-semibold text-foreground truncate">{title}</h1>
            <div className="ml-auto"><InstallAppButton /></div>
          </header>
          <main className="flex-1">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
