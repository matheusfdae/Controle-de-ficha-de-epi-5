import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const { resetPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await resetPassword(email);
    setBusy(false);
    if (r.ok) {
      setSent(true);
      toast.success('E-mail enviado!');
    } else {
      toast.error(r.error || 'Falha ao enviar');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mx-auto">
            <Mail className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-xl">Recuperar senha</CardTitle>
          <CardDescription>
            {sent ? 'Verifique sua caixa de entrada' : 'Enviaremos um link para redefinir sua senha'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="text-sm text-muted-foreground text-center space-y-4">
              <p>Se houver uma conta para <strong>{email}</strong>, você receberá um e-mail em instantes.</p>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/login"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao login</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>Enviar link</Button>
              <Button variant="ghost" className="w-full" asChild>
                <Link to="/login"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Link>
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
