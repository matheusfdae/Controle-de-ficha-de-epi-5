import { SignIn } from '@clerk/clerk-react';
import { ShieldCheck } from 'lucide-react';

// Cadastro é só por convite de admin (self-signup desligado no Clerk) —
// por isso só <SignIn/>, sem aba de cadastro. O fluxo de "esqueci minha
// senha" já vem embutido no componente.
export default function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mx-auto">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">EPI Manager</h1>
          <p className="text-sm text-muted-foreground">Gestão de EPIs e Uniformes</p>
        </div>
        <SignIn
          routing="virtual"
          fallbackRedirectUrl="/"
          signUpUrl="/login"
          appearance={{
            elements: {
              rootBox: 'w-full mx-auto',
              card: 'shadow-lg border rounded-lg w-full',
              // Sem auto-cadastro público: some com o link "Não tem conta? Cadastre-se".
              footerAction: 'hidden',
            },
          }}
        />
      </div>
    </div>
  );
}
