import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShieldCheck, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [busy, setBusy] = useState(false);
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await login(email, password);
    setBusy(false);
    if (r.ok) {
      toast.success('Login realizado com sucesso!');
      navigate('/');
    } else {
      toast.error(r.error || 'Falha no login');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await signup(email, password, nome);
    setBusy(false);
    if (r.ok) {
      toast.success('Conta criada! Verifique seu e-mail para confirmar.');
    } else {
      toast.error(r.error || 'Falha no cadastro');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mx-auto">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-xl">EPI Manager</CardTitle>
          <CardDescription>Gestão de EPIs e Uniformes</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid grid-cols-2 w-full mb-4">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@empresa.com" autoComplete="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" autoComplete="current-password" required />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  <LogIn className="h-4 w-4 mr-2" /> Entrar
                </Button>
                <div className="text-center">
                  <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-primary">
                    Esqueci minha senha
                  </Link>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome completo</Label>
                  <Input id="nome" value={nome} onChange={e => setNome(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email-s">E-mail</Label>
                  <Input id="email-s" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-s">Senha</Label>
                  <Input id="password-s" type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={6} required />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  <UserPlus className="h-4 w-4 mr-2" /> Criar conta
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  Novas contas começam como <strong>colaborador</strong>. Um administrador pode promover seu acesso.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
