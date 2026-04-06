import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import NovaFicha from "./pages/NovaFicha";
import ConsultarFichas from "./pages/ConsultarFichas";
import VisualizarFicha from "./pages/VisualizarFicha";
import AssinarFicha from "./pages/AssinarFicha";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/nova-ficha" element={<NovaFicha />} />
          <Route path="/consultar" element={<ConsultarFichas />} />
          <Route path="/ficha/:id" element={<VisualizarFicha />} />
          <Route path="/assinar/:id" element={<AssinarFicha />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
