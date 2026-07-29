import { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Sem isso, qualquer erro de render (ex.: script de terceiro que falha só em
// certos navegadores/dispositivos) derruba a árvore inteira do React e deixa
// tela branca sem nenhuma pista do que quebrou.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('ErrorBoundary capturou um erro:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md text-center space-y-3">
            <AlertTriangle className="h-10 w-10 mx-auto text-destructive" />
            <h1 className="text-lg font-bold">Ocorreu um erro ao carregar a página</h1>
            <p className="text-sm text-muted-foreground">
              Tente recarregar. Se o problema continuar, informe a mensagem abaixo ao suporte.
            </p>
            <p className="text-xs text-muted-foreground break-words bg-muted rounded p-2">
              {this.state.error.message}
            </p>
            <Button onClick={() => window.location.reload()}>Recarregar página</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
