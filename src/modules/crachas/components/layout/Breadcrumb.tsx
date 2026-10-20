import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, IdCard } from 'lucide-react';

const routeNames: Record<string, string> = {
  '/crachas': 'Painel',
  '/crachas/colaboradores': 'Colaboradores',
  '/crachas/modelos': 'Modelos de Crachá',
  '/crachas/gerar': 'Gerar Crachás',
  '/crachas/solicitar': 'Solicitações',
  '/crachas/historico': 'Histórico',
  '/crachas/relatorios': 'Relatórios',
  '/crachas/configuracoes': 'Configurações',
};

/** Caminho dentro do módulo Crachás (Crachás > tela atual). */
export function Breadcrumb() {
  const path = useLocation().pathname.replace(/\/+$/, '');
  const base = path.split('/').slice(0, 3).join('/');
  const atual = routeNames[path] || routeNames[base] || 'Página';
  const noPainel = path === '/crachas';

  return (
    <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
      <Link to="/crachas" className="hover:text-foreground transition-colors flex items-center gap-1">
        <IdCard className="h-3.5 w-3.5" />
        <span>Crachás</span>
      </Link>
      {!noPainel && (
        <>
          <ChevronRight className="h-3 w-3 opacity-40" />
          <span className="text-foreground font-medium">{atual}</span>
        </>
      )}
    </nav>
  );
}
