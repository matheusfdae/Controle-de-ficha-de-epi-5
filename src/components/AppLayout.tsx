import { Link, Outlet, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { telaDaRota } from '@/lib/telas';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { Separator } from '@/components/ui/separator';
import InstallAppButton from '@/components/InstallAppButton';
import ThemeToggle from '@/components/ThemeToggle';
import ChatAjuda from '@/components/ChatAjuda';
import RoboToggle from '@/components/RoboToggle';
import SinoPedidos from '@/modules/pedidos/components/SinoPedidos';

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/nova-ficha': 'Nova Ficha',
  '/consultar': 'Consultar Fichas',
  '/termos-epi': 'Consultar Termos EPI',
  '/colaboradores': 'Colaboradores Senior',
  '/vencimentos': 'Controle de Vencimentos',
  '/configuracoes': 'Configurações',
  '/usuarios': 'Gestão de Usuários',
  '/rank-postos': 'Fichas por Posto',
  '/postos': 'Postos',
  '/estoque': 'Estoque',
};

export default function AppLayout() {
  const { pathname } = useLocation();
  const { veTela } = useAuth();
  const tela = telaDaRota(pathname);
  const telaBloqueada = tela && !veTela(tela.id) ? tela : null;
  const title =
    titles[pathname] ||
    (pathname.startsWith('/ficha/') ? 'Detalhes da Ficha' : 'EPI Manager');

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 h-14 flex items-center gap-2 border-b border-white/50 dark:border-white/10 bg-white/45 dark:bg-slate-950/40 backdrop-blur-xl backdrop-saturate-150 px-4">
            <SidebarTrigger data-guia="abrir-menu" />
            <Separator orientation="vertical" className="h-5 mx-1" />
            <h1 className="text-sm font-semibold text-foreground truncate">{title}</h1>
            <div className="ml-auto flex items-center gap-1">
              <SinoPedidos />
              <RoboToggle />
              <ThemeToggle />
              <InstallAppButton />
            </div>
          </header>
          <main className="flex-1">
            {telaBloqueada ? (
              <div className="p-8 max-w-md mx-auto text-center space-y-3">
                <Lock className="h-10 w-10 mx-auto text-muted-foreground" />
                <h2 className="text-lg font-semibold">Tela não liberada</h2>
                <p className="text-sm text-muted-foreground">"{telaBloqueada.label}" não está marcada para o seu usuário. Peça ao administrador para liberar em Usuários → Telas.</p>
                <Link to="/" className="text-sm text-primary underline">Voltar ao início</Link>
              </div>
            ) : <Outlet />}
          </main>
          {/* Chat "Dúvidas?": só no localhost até a produção ter a chave nova do
              Gemini (deploy/producao/configurar-assistente.sh). */}
          <ChatAjuda />
        </div>
      </div>
    </SidebarProvider>
  );
}
