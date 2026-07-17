import { useSearchParams, Navigate } from 'react-router-dom';
import { SignUp } from '@clerk/clerk-react';
import { ShieldCheck } from 'lucide-react';

// Rota de aceite de convite: só funciona com um __clerk_ticket válido na URL
// (link do e-mail de convite gerado por admin-invite-user). Sem ticket não
// existe cadastro público — redireciona pro login. O <SignUp/> do Clerk
// consome o ticket automaticamente (e-mail já vem verificado pelo convite,
// só pede a senha).
export default function AceitarConvite() {
  const [params] = useSearchParams();
  const hasTicket = !!params.get('__clerk_ticket');

  if (!hasTicket) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mx-auto">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">Aceitar convite</h1>
          <p className="text-sm text-muted-foreground">Defina sua senha para concluir o cadastro</p>
        </div>
        <SignUp
          routing="virtual"
          fallbackRedirectUrl="/"
          signInUrl="/login"
          appearance={{
            elements: {
              rootBox: 'w-full mx-auto',
              card: 'shadow-lg border rounded-lg w-full',
              footerAction: 'hidden',
            },
          }}
        />
      </div>
    </div>
  );
}
