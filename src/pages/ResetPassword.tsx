import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KeyRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const { updatePassword } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // O Supabase coloca o token no hash; o cliente já trata via onAuthStateChange.
    // Apenas indicamos que a página está pronta.
    if (window.location.hash.includes('type=recovery') || window.location.hash.includes('access_token')) {
      setReady(true);
    } else {
      setReady(true); // permite mesmo assim — updateUser falhará se não houver sessão
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error('As senhas não conferem');
      return;
    }
    if (password.length < 6) {
      toast.error('A senha deve ter ao menos 6 caracteres');
      return;
    }
    setBusy(true);
    const r = await updatePassword(password);
    setBusy(false);
    if (r.ok) {
      toast.success('Senha atualizada!');
      navigate('/');
    } else {
      toast.error(r.error || 'Falha ao atualizar senha');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mx-auto">
            <KeyRound className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-xl">Nova senha</CardTitle>
          <CardDescription>Defina sua nova senha de acesso</CardDescription>
        </CardHeader>
        <CardContent>
          {!ready ? (
            <p className="text-sm text-muted-foreground text-center">Carregando…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="p1">Nova senha</Label>
                <Input id="p1" type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={6} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p2">Confirmar senha</Label>
                <Input id="p2" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} minLength={6} required />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>Salvar</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
