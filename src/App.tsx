import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NovaFicha from "./pages/NovaFicha";
import ConsultarFichas from "./pages/ConsultarFichas";
import VisualizarFicha from "./pages/VisualizarFicha";
import AssinarFicha from "./pages/AssinarFicha";
import Vencimentos from "./pages/Vencimentos";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/assinar/:id" element={<AssinarFicha />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/nova-ficha" element={<ProtectedRoute><NovaFicha /></ProtectedRoute>} />
      <Route path="/consultar" element={<ProtectedRoute><ConsultarFichas /></ProtectedRoute>} />
      <Route path="/ficha/:id" element={<ProtectedRoute><VisualizarFicha /></ProtectedRoute>} />
      <Route path="/vencimentos" element={<ProtectedRoute><Vencimentos /></ProtectedRoute>} />
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
