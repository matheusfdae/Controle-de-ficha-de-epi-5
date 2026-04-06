import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardList, Search, ShieldCheck } from 'lucide-react';
import { seedDemoData } from '@/services/fichaService';

export default function Index() {
  useEffect(() => {
    seedDemoData();
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-8 text-center">
        <div className="space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-2">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Ficha de EPI</h1>
          <p className="text-muted-foreground">
            Gerencie fichas de Equipamento de Proteção Individual de forma simples e rápida.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link to="/nova-ficha">
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-primary/30 h-full">
              <CardHeader className="items-center text-center space-y-2 py-8">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
                  <ClipboardList className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">Nova Ficha de EPI</CardTitle>
                <CardDescription>Criar uma nova ficha de entrega</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link to="/consultar">
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-primary/30 h-full">
              <CardHeader className="items-center text-center space-y-2 py-8">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent/10">
                  <Search className="h-6 w-6 text-accent" />
                </div>
                <CardTitle className="text-lg">Consultar Fichas</CardTitle>
                <CardDescription>Ver fichas geradas e seus status</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
