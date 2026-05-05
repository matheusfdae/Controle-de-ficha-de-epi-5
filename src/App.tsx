import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import NovaFicha from "./pages/NovaFicha";
import ConsultarFichas from "./pages/ConsultarFichas";
import VisualizarFicha from "./pages/VisualizarFicha";
import AssinarFicha from "./pages/AssinarFicha";
import Vencimentos from "./pages/Vencimentos";
import Configuracoes from "./pages/Configuracoes";
import Usuarios from "./pages/Usuarios";
import Estoque from "./pages/Estoque";
import Funcoes from "./pages/Funcoes";
import Integracao from "./pages/Integracao";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedLayout() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Carregando…</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <AppLayout />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/assinar/:id" element={<AssinarFicha />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/nova-ficha" element={<AdminRoute><NovaFicha /></AdminRoute>} />
        <Route path="/consultar" element={<ConsultarFichas />} />
        <Route path="/ficha/:id" element={<VisualizarFicha />} />
        <Route path="/vencimentos" element={<Vencimentos />} />
        <Route path="/configuracoes" element={<AdminRoute><Configuracoes /></AdminRoute>} />
        <Route path="/usuarios" element={<AdminRoute><Usuarios /></AdminRoute>} />
        <Route path="/estoque" element={<AdminRoute><Estoque /></AdminRoute>} />
        <Route path="/funcoes" element={<AdminRoute><Funcoes /></AdminRoute>} />
        <Route path="/integracao" element={<AdminRoute><Integracao /></AdminRoute>} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
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
