import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useSearchParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import AppLayout from "@/components/AppLayout";
import { ModuleId, ActionId } from "@/lib/permissions";

// Páginas carregadas sob demanda (code splitting)
const Login               = lazy(() => import('./pages/Login'));
const AceitarConvite      = lazy(() => import('./pages/AceitarConvite'));
const ResetPassword       = lazy(() => import('./pages/ResetPassword'));
const Convites            = lazy(() => import('./pages/Convites'));
const Dashboard           = lazy(() => import('./pages/Dashboard'));
const NovaFicha           = lazy(() => import('./pages/NovaFicha'));
const ConsultarFichas     = lazy(() => import('./pages/ConsultarFichas'));
const VisualizarFicha     = lazy(() => import('./pages/VisualizarFicha'));
const AssinarFicha        = lazy(() => import('./pages/AssinarFicha'));
const AssinaturasPendentes = lazy(() => import('./pages/AssinaturasPendentes'));
const Vencimentos         = lazy(() => import('./pages/Vencimentos'));
const RankPostos          = lazy(() => import('./pages/RankPostos'));
const Configuracoes       = lazy(() => import('./pages/Configuracoes'));
const Usuarios            = lazy(() => import('./pages/Usuarios'));
const Estoque             = lazy(() => import('./pages/Estoque'));
const Funcoes             = lazy(() => import('./pages/Funcoes'));
const ModelosFicha        = lazy(() => import('./pages/ModelosFicha'));
const Integracao          = lazy(() => import('./pages/Integracao'));
const TermosColetivos     = lazy(() => import('./pages/TermosColetivos'));
const TermoColetivoNovo   = lazy(() => import('./pages/TermoColetivoNovo'));
const TermoColetivoView   = lazy(() => import('./pages/TermoColetivoView'));
const AssinarTermoColetivo = lazy(() => import('./pages/AssinarTermoColetivo'));
const NotFound            = lazy(() => import('./pages/NotFound'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // 1 min — evita refetches desnecessários ao alternar abas
      retry: 1,
    },
  },
});

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
    Carregando…
  </div>
);

function ProtectedLayout() {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.mustChangePassword && window.location.pathname !== '/reset-password') {
    return <Navigate to="/reset-password" replace />;
  }
  return <AppLayout />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Gate por módulo/ação da matriz de permissões (src/lib/permissions.ts),
// em vez do isAdmin binário — admin sempre passa (can() já tem esse bypass).
function RequireModule({ module, action = 'view', children }: {
  module: ModuleId; action?: ActionId; children: React.ReactNode;
}) {
  const { can } = useAuth();
  if (!can(module, action)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// /nova-ficha é compartilhada por EPI e Uniforme (?tipo=epi|uniforme,
// default 'epi' — mesma leitura que NovaFicha.tsx faz), então o módulo
// exigido depende da query string.
function RequireNovaFicha({ children }: { children: React.ReactNode }) {
  const { can } = useAuth();
  const [searchParams] = useSearchParams();
  const module: ModuleId = searchParams.get('tipo') === 'uniforme' ? 'fichas_uniforme' : 'fichas_epi';
  if (!can(module, 'create')) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// /consultar é compartilhada por EPI e Uniforme (?tipo=epi|uniforme,
// mesmo padrão de RequireNovaFicha acima).
function RequireConsultar({ children }: { children: React.ReactNode }) {
  const { can } = useAuth();
  const [searchParams] = useSearchParams();
  const module: ModuleId = searchParams.get('tipo') === 'uniforme' ? 'fichas_uniforme' : 'fichas_epi';
  if (!can(module, 'view')) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login"           element={<Login />} />
        <Route path="/aceitar-convite" element={<AceitarConvite />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/assinar/:token"     element={<AssinarFicha />} />
        <Route path="/assinar-termo-coletivo/:token" element={<AssinarTermoColetivo />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/"             element={<Dashboard />} />
          <Route path="/nova-ficha"   element={<RequireNovaFicha><NovaFicha /></RequireNovaFicha>} />
          <Route path="/consultar"    element={<RequireConsultar><ConsultarFichas /></RequireConsultar>} />
          <Route path="/ficha/:id"    element={<RequireModule module="fichas_epi"><VisualizarFicha /></RequireModule>} />
          <Route path="/vencimentos"  element={<RequireModule module="vencimentos"><Vencimentos /></RequireModule>} />
          <Route path="/pendentes"    element={<RequireModule module="assinar_tablet"><AssinaturasPendentes /></RequireModule>} />
          <Route path="/rank-postos"  element={<RequireModule module="rank"><RankPostos /></RequireModule>} />
          <Route path="/configuracoes" element={<RequireModule module="configuracoes"><Configuracoes /></RequireModule>} />
          <Route path="/usuarios"     element={<AdminRoute><Usuarios /></AdminRoute>} />
          <Route path="/convites"     element={<Convites />} />
          <Route path="/estoque"      element={<RequireModule module="estoque"><Estoque /></RequireModule>} />
          <Route path="/funcoes"      element={<RequireModule module="funcoes"><Funcoes /></RequireModule>} />
          <Route path="/modelos-ficha" element={<RequireModule module="configuracoes"><ModelosFicha /></RequireModule>} />
          <Route path="/integracao"   element={<RequireModule module="integracao"><Integracao /></RequireModule>} />
          <Route path="/termos-coletivos" element={<RequireModule module="termos_coletivos"><TermosColetivos /></RequireModule>} />
          <Route path="/termo-coletivo/novo" element={<RequireModule module="termos_coletivos" action="create"><TermoColetivoNovo /></RequireModule>} />
          <Route path="/termo-coletivo/:id" element={<RequireModule module="termos_coletivos"><TermoColetivoView /></RequireModule>} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
