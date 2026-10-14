import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Copy, ExternalLink, Loader2, LogIn, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import {
  LoginContaMs, StatusContaMs, desconectarContaMs, iniciarLoginContaMs, statusContaMs, verificarLoginContaMs,
} from '@/services/emailConvocacaoService';

/**
 * Conta do Microsoft 365 que envia os e-mails (modelo delegado, escolha do TI):
 * a pessoa da conta faz login uma vez em microsoft.com/device com o código
 * mostrado aqui; o sistema guarda só a autorização, nunca a senha.
 */
export default function ContaMicrosoftCard({ podeEditar }: { podeEditar: boolean }) {
  const [status, setStatus] = useState<StatusContaMs | null>(null);
  const [tenant, setTenant] = useState('');
  const [cliente, setCliente] = useState('');
  const [caixa, setCaixa] = useState('naoresponda@grupo5estrelas.com.br');
  const [login, setLogin] = useState<LoginContaMs | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const carregar = () => statusContaMs().then(s => {
    setStatus(s);
    setTenant(t => t || s.tenant_id);
    setCliente(c => c || s.client_id);
    if (s.caixa) setCaixa(s.caixa);
  }).catch(e => toast.error(e instanceof Error ? e.message : 'Erro ao ler a conta'));
  useEffect(() => { carregar(); return () => clearTimeout(timer.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Enquanto o código está na tela, pergunta à Microsoft se já autorizaram.
  useEffect(() => {
    if (!login) return;
    const conferir = async () => {
      if (Date.now() > new Date(login.expira_em).getTime()) {
        setLogin(null);
        return toast.error('O código expirou. Clique em "Conectar conta" de novo.');
      }
      try {
        const r = await verificarLoginContaMs();
        if (r.conectado) {
          setLogin(null);
          toast.success(`Conta conectada: ${r.conta ?? ''}`);
          carregar();
          return;
        }
        timer.current = setTimeout(conferir, Math.max(login.intervalo, 3) * 1000);
      } catch (e) {
        setLogin(null);
        toast.error(e instanceof Error ? e.message : 'Falha no login');
      }
    };
    timer.current = setTimeout(conferir, Math.max(login.intervalo, 3) * 1000);
    return () => clearTimeout(timer.current);
  }, [login]); // eslint-disable-line react-hooks/exhaustive-deps

  async function conectar() {
    setOcupado(true);
    try {
      setLogin(await iniciarLoginContaMs(tenant, cliente, caixa));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível iniciar o login');
    } finally {
      setOcupado(false);
    }
  }

  async function desconectar() {
    setOcupado(true);
    try {
      await desconectarContaMs();
      toast.success('Conta desconectada: o sistema não envia mais e-mails até conectar de novo.');
      carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao desconectar');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Conta do Microsoft 365 que envia
          {status?.conectado
            ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Conectada</Badge>
            : <Badge variant="outline">Não conectada</Badge>}
        </CardTitle>
        <CardDescription>
          Os e-mails saem pela caixa escolhida (ex.: a compartilhada naoresponda@). Um usuário com permissão
          "Enviar como" nela faz login uma vez na página da Microsoft; o sistema guarda só a autorização, nunca a senha.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.conectado && !login && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-emerald-50 p-3 dark:bg-emerald-950/30">
            <span className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {status.caixa
                ? <>Enviando como <b>{status.caixa}</b> (autorizado por {status.conta || 'conta conectada'})</>
                : <>Enviando como <b>{status.conta || '(conta)'}</b></>}
            </span>
            {podeEditar && (
              <Button variant="outline" size="sm" onClick={desconectar} disabled={ocupado}>
                <LogOut className="h-4 w-4 mr-1" /> Desconectar
              </Button>
            )}
          </div>
        )}

        {login ? (
          <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4 space-y-3">
            <p className="text-sm">
              {caixa
                ? <>Com um usuário que tem a permissão <b>"Enviar como"</b> na caixa <b>{caixa}</b>, abra a página abaixo, digite o código e autorize:</>
                : <>Na conta que vai enviar os e-mails, abra a página abaixo, digite o código e autorize:</>}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <code className="rounded bg-background px-3 py-2 text-2xl font-bold tracking-widest">{login.codigo}</code>
              <Button variant="outline" size="sm"
                onClick={() => navigator.clipboard.writeText(login.codigo).then(() => toast.success('Código copiado'))}>
                <Copy className="h-4 w-4 mr-1" /> Copiar
              </Button>
              <Button asChild size="sm">
                <a href={login.url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-1" /> Abrir {login.url.replace(/^https?:\/\//, '')}</a>
              </Button>
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Aguardando a autorização… (o código vale até{' '}
              {new Date(login.expira_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})
            </p>
            <Button variant="ghost" size="sm" onClick={() => setLogin(null)}>Cancelar</Button>
          </div>
        ) : podeEditar && (
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr] items-end">
            <div>
              <Label htmlFor="ms-tenant" className="text-xs">Directory (tenant) ID</Label>
              <Input id="ms-tenant" value={tenant} onChange={e => setTenant(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
            </div>
            <div>
              <Label htmlFor="ms-client" className="text-xs">Application (client) ID</Label>
              <Input id="ms-client" value={cliente} onChange={e => setCliente(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="ms-caixa" className="text-xs">Enviar como (caixa compartilhada; vazio = a própria conta que fizer o login)</Label>
              <Input id="ms-caixa" value={caixa} onChange={e => setCaixa(e.target.value)} placeholder="naoresponda@grupo5estrelas.com.br" />
            </div>
            <Button className="sm:col-span-2 sm:justify-self-end" onClick={conectar} disabled={ocupado || !tenant.trim() || !cliente.trim()}>
              {ocupado ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <LogIn className="h-4 w-4 mr-1" />}
              {status?.conectado ? 'Trocar conta' : 'Conectar conta'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
