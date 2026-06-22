import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";

// Páginas carregadas sob demanda (code splitting)
const Login               = lazy(() => import('./pages/Login'));
const ForgotPassword      = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword       = lazy(() => import('./pages/ResetPassword'));
const Dashboard           = lazy(() => import('./pages/Dashboard'));
const NovaFicha           = lazy(() => import('./pages/NovaFicha'));
const ConsultarFichas     = lazy(() => import('./pages/ConsultarFichas'));
const VisualizarFicha     = lazy(() => import('./pages/VisualizarFicha'));
const AssinarFicha        = lazy(() => import('./pages/AssinarFicha'));
const AssinaturasPendentes = lazy(() => import('./pages/AssinaturasPendentes'));
const Vencimentos         = lazy(() => import('./pages/Vencimentos'));
const Configuracoes       = lazy(() => import('./pages/Configuracoes'));
const Usuarios            = lazy(() => import('./pages/Usuarios'));
const Estoque             = lazy(() => import('./pages/Estoque'));
const Funcoes             = lazy(() => import('./pages/Funcoes'));
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

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login"           element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/assinar/:id"     element={<AssinarFicha />} />
        <Route path="/assinar-termo-coletivo/:id/:itemId" element={<AssinarTermoColetivo />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/"             element={<Dashboard />} />
          <Route path="/nova-ficha"   element={<AdminRoute><NovaFicha /></AdminRoute>} />
          <Route path="/consultar"    element={<ConsultarFichas />} />
          <Route path="/ficha/:id"    element={<VisualizarFicha />} />
          <Route path="/vencimentos"  element={<Vencimentos />} />
          <Route path="/pendentes"    element={<AssinaturasPendentes />} />
          <Route path="/configuracoes" element={<AdminRoute><Configuracoes /></AdminRoute>} />
          <Route path="/usuarios"     element={<AdminRoute><Usuarios /></AdminRoute>} />
          <Route path="/estoque"      element={<AdminRoute><Estoque /></AdminRoute>} />
          <Route path="/funcoes"      element={<AdminRoute><Funcoes /></AdminRoute>} />
          <Route path="/integracao"   element={<AdminRoute><Integracao /></AdminRoute>} />
          <Route path="/termos-coletivos" element={<TermosColetivos />} />
          <Route path="/termo-coletivo/novo" element={<AdminRoute><TermoColetivoNovo /></AdminRoute>} />
          <Route path="/termo-coletivo/:id" element={<TermoColetivoView />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

const App = () => (
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
);

export default App;
