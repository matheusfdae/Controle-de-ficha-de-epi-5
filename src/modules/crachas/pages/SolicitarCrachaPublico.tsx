import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BadgeCheck, Camera, CheckCircle2, Loader2, LogOut, Search, UserCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { nomePostoTrabalho } from '../../../../supabase/functions/_shared/senior';
import {
  MOTIVOS, TIPOS_SANGUINEOS, buscarColaborador, cpfValido, enviarSolicitacao, formatarCpf, formatarTelefone,
  identificarSolicitante, matriculaValida, prepararFoto, soDigitos,
  type ColaboradorParaCracha, type Motivo, type Solicitante, type SolicitanteIdentificado,
} from '../lib/solicitacaoService';

/**
 * Link público: qualquer colaborador ativo pede um crachá (o próprio ou de
 * outro). 1) ele se identifica (matrícula OU CPF dele); 2) informa a matrícula ou o CPF
 * do colaborador e confere os dados que vieram da Senior; 3) manda foto e
 * motivo. O RH aprova na tela Solicitações.
 */

const STATUS: Record<string, string> = {
  recebida: 'recebida, aguardando o RH',
  em_analise: 'em análise pelo RH',
  aprovada: 'aprovada',
  rejeitada: 'recusada',
};
const dataBr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

const LEMBRAR = 'cracha-solicitante';
const lembrado = (): { matricula?: string; telefone?: string } => {
  try { return JSON.parse(localStorage.getItem(LEMBRAR) || '{}'); } catch { return {}; }
};
const lembrar = (dados: { matricula?: string; telefone?: string }) => {
  try { localStorage.setItem(LEMBRAR, JSON.stringify({ ...lembrado(), ...dados })); } catch { /* sem armazenamento */ }
};

const SolicitarCrachaPublico = () => {
  // Passo 1 — solicitante
  const [identificarPor, setIdentificarPor] = useState<'matricula' | 'cpf'>('matricula');
  const [solMatricula, setSolMatricula] = useState(lembrado().matricula ?? '');
  const [solCpf, setSolCpf] = useState('');
  const [solicitante, setSolicitante] = useState<(Solicitante & SolicitanteIdentificado) | null>(null);
  // Passo 2 — colaborador
  const [buscaPor, setBuscaPor] = useState<'matricula' | 'cpf'>('matricula');
  const [busca, setBusca] = useState('');
  const [colaborador, setColaborador] = useState<ColaboradorParaCracha | null>(null);
  // Passo 3 — pedido
  const [motivo, setMotivo] = useState<Motivo | ''>('');
  const [observacao, setObservacao] = useState('');
  const [tipoSanguineo, setTipoSanguineo] = useState('');
  const [cnv, setCnv] = useState('');
  const [telefone, setTelefone] = useState(lembrado().telefone ?? '');
  const [foto, setFoto] = useState<Blob | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const inputFoto = useRef<HTMLInputElement>(null);

  const [carregando, setCarregando] = useState(false);
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null);

  const tentar = async (acao: () => Promise<void>) => {
    setCarregando(true);
    try { await acao(); } catch (e) { toast.error((e as Error).message || 'Algo deu errado. Tente de novo.'); }
    finally { setCarregando(false); }
  };

  const removerFoto = () => {
    setFoto(null);
    setFotoPreview(atual => { if (atual) URL.revokeObjectURL(atual); return null; });
  };

  const limparPedido = () => {
    setMotivo(''); setObservacao(''); setTipoSanguineo(''); setCnv(''); removerFoto();
  };

  const identificar = (e: React.FormEvent) => {
    e.preventDefault();
    let quem: Solicitante;
    if (identificarPor === 'matricula') {
      const matricula = matriculaValida(solMatricula);
      if (!matricula) return toast.error('Informe a sua matrícula (só números).');
      quem = { matricula };
    } else {
      if (!cpfValido(solCpf)) return toast.error('CPF inválido.');
      quem = { cpf: solCpf };
    }
    tentar(async () => {
      const r = await identificarSolicitante(quem);
      setSolicitante({ ...quem, ...r });
      if (quem.matricula) lembrar({ matricula: String(quem.matricula) });
    });
  };

  const buscar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!solicitante) return;
    const porMatricula = buscaPor === 'matricula';
    const matricula = porMatricula ? matriculaValida(busca) : null;
    if (porMatricula && !matricula) return toast.error('Informe a matrícula do colaborador (só números).');
    if (!porMatricula && !cpfValido(busca)) return toast.error('CPF do colaborador inválido.');
    tentar(async () => {
      setColaborador(null);
      const c = await buscarColaborador(solicitante, porMatricula ? { matricula: matricula! } : { cpf: busca });
      setColaborador(c);
      limparPedido();
      setTipoSanguineo(c.tipo_sanguineo ?? '');
      setCnv(c.cnv ?? '');
    });
  };

  const escolherFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    if (!arquivo.type.startsWith('image/')) return toast.error('Escolha uma imagem.');
    try {
      const blob = await prepararFoto(arquivo);
      removerFoto();
      setFoto(blob);
      setFotoPreview(URL.createObjectURL(blob));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const pendente = !!colaborador?.solicitacao && ['recebida', 'em_analise'].includes(colaborador.solicitacao.status);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!solicitante || !colaborador) return;
    if (!motivo) return toast.error('Escolha o motivo.');
    if (motivo === 'outro' && !observacao.trim()) return toast.error('Explique o motivo na observação.');
    if (!colaborador.tem_foto && !foto) return toast.error('Tire ou escolha a foto do colaborador.');
    if (colaborador.vigilante && !soDigitos(cnv)) return toast.error('Para vigilante, a CNV é obrigatória.');
    const tel = soDigitos(telefone);
    if (tel.length < 10) return toast.error('Informe o seu telefone com DDD.');
    tentar(async () => {
      const r = await enviarSolicitacao(solicitante, {
        matricula: colaborador.matricula, telefone, motivo, observacao, foto, tipoSanguineo, cnv,
      });
      lembrar({ telefone: tel });
      setEnviadoPara(r.nome);
    });
  };

  const outroColaborador = () => {
    setEnviadoPara(null);
    setColaborador(null);
    setBusca('');
    limparPedido();
  };

  const sair = () => {
    outroColaborador();
    setSolicitante(null);
    setSolCpf('');
  };

  const posto = colaborador ? (colaborador.posto ? nomePostoTrabalho(colaborador.posto) : colaborador.local) : null;

  return (
    <div className="min-h-screen bg-background py-6 px-4">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground flex items-center justify-center gap-2">
            <BadgeCheck className="h-7 w-7 text-primary" /> Solicitar crachá
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Identifique-se para solicitar. Os dados do colaborador vêm da Senior.
          </p>
        </div>

        {/* ---------- 1. Solicitante ---------- */}
        {!solicitante ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">1. Quem está solicitando</CardTitle>
              <CardDescription>Informe a <strong>sua</strong> matrícula ou o <strong>seu</strong> CPF.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={identificar} className="space-y-3">
                <div className="inline-flex rounded-md border p-0.5 text-sm">
                  {(['matricula', 'cpf'] as const).map(op => (
                    <button key={op} type="button" onClick={() => setIdentificarPor(op)}
                      className={`px-3 py-1 rounded ${identificarPor === op ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                      {op === 'matricula' ? 'Matrícula' : 'CPF'}
                    </button>
                  ))}
                </div>
                {identificarPor === 'matricula' ? (
                  <div>
                    <Label htmlFor="sol-mat">Sua matrícula</Label>
                    <Input id="sol-mat" inputMode="numeric" autoComplete="off" value={solMatricula}
                      onChange={e => setSolMatricula(soDigitos(e.target.value).slice(0, 9))} />
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="sol-cpf">Seu CPF</Label>
                    <Input id="sol-cpf" inputMode="numeric" autoComplete="off" value={formatarCpf(solCpf)}
                      onChange={e => setSolCpf(soDigitos(e.target.value))} placeholder="000.000.000-00" />
                  </div>
                )}
                <Button type="submit" className="w-full gap-2" disabled={carregando}>
                  {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                  Continuar
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Solicitante</p>
              <p className="font-medium truncate">{solicitante.nome}</p>
              <p className="text-xs text-muted-foreground truncate">{solicitante.cargo}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={sair} className="gap-1 shrink-0">
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </div>
        )}

        {/* ---------- Enviado ---------- */}
        {solicitante && enviadoPara && (
          <Card>
            <CardContent className="pt-8 pb-6 text-center space-y-3">
              <CheckCircle2 className="h-14 w-14 text-primary mx-auto" />
              <h2 className="text-xl font-semibold">Solicitação enviada!</h2>
              <p className="text-muted-foreground">
                O pedido do crachá de <strong>{enviadoPara}</strong> foi para o RH. Se precisar de algo, o RH fala com você.
              </p>
              <Button onClick={outroColaborador}>Solicitar para outro colaborador</Button>
            </CardContent>
          </Card>
        )}

        {/* ---------- 2. Colaborador ---------- */}
        {solicitante && !enviadoPara && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">2. Colaborador</CardTitle>
              <CardDescription>Quem vai receber o crachá (pode ser você mesmo).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={buscar} className="space-y-3">
                <div className="inline-flex rounded-md border p-0.5 text-sm">
                  {(['matricula', 'cpf'] as const).map(op => (
                    <button key={op} type="button"
                      onClick={() => { setBuscaPor(op); setBusca(''); }}
                      className={`px-3 py-1 rounded ${buscaPor === op ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                      {op === 'matricula' ? 'Matrícula' : 'CPF'}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input inputMode="numeric" autoComplete="off"
                    aria-label={buscaPor === 'matricula' ? 'Matrícula do colaborador' : 'CPF do colaborador'}
                    value={buscaPor === 'cpf' ? formatarCpf(busca) : busca}
                    placeholder={buscaPor === 'cpf' ? '000.000.000-00' : 'Matrícula do colaborador'}
                    onChange={e => setBusca(soDigitos(e.target.value).slice(0, buscaPor === 'cpf' ? 11 : 9))} />
                  <Button type="submit" disabled={carregando} className="gap-2 shrink-0">
                    {carregando && !colaborador ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Buscar
                  </Button>
                </div>
              </form>

              {colaborador && (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                  <p className="font-semibold text-base">{colaborador.nome}</p>
                  <p><span className="text-muted-foreground">Matrícula:</span> {colaborador.matricula}</p>
                  {colaborador.cargo && <p><span className="text-muted-foreground">Cargo:</span> {colaborador.cargo}</p>}
                  {posto && <p><span className="text-muted-foreground">Posto:</span> {posto}{colaborador.uf ? ` (${colaborador.uf})` : ''}</p>}
                  {colaborador.empresa && <p><span className="text-muted-foreground">Empresa:</span> {colaborador.empresa}</p>}
                  {colaborador.situacao && <p><span className="text-muted-foreground">Situação:</span> {colaborador.situacao}</p>}
                </div>
              )}

              {colaborador?.solicitacao && (
                <Alert>
                  <AlertDescription>
                    {pendente
                      ? <>Já existe uma solicitação <strong>{STATUS[colaborador.solicitacao.status]}</strong> (enviada em {dataBr(colaborador.solicitacao.enviada_em)}). Não precisa pedir de novo.</>
                      : <>Última solicitação: <strong>{STATUS[colaborador.solicitacao.status] ?? colaborador.solicitacao.status}</strong>
                          {colaborador.solicitacao.enviada_em ? ` em ${dataBr(colaborador.solicitacao.enviada_em)}` : ''}
                          {colaborador.solicitacao.motivo_recusa ? <> — motivo: {colaborador.solicitacao.motivo_recusa}</> : null}.</>}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* ---------- 3. Pedido ---------- */}
        {solicitante && colaborador && !pendente && !enviadoPara && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">3. Pedido</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={enviar} className="space-y-4">
                <div>
                  <Label>Foto do colaborador {colaborador.tem_foto ? '(opcional — já tem foto no cadastro)' : '*'}</Label>
                  <p className="text-xs text-muted-foreground mb-2">De frente, rosto inteiro, fundo claro, sem boné ou óculos escuros.</p>
                  <div className="flex items-center gap-3">
                    <div className="relative w-24 h-32 rounded-lg border-2 border-dashed bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                      {fotoPreview ? (
                        <>
                          <img src={fotoPreview} alt="Foto do colaborador" className="w-full h-full object-cover" style={{ objectPosition: 'center top' }} />
                          <button type="button" onClick={removerFoto} aria-label="Remover foto"
                            className="absolute top-1 right-1 p-1 rounded-full bg-destructive text-destructive-foreground">
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      ) : <Camera className="h-8 w-8 text-muted-foreground" />}
                    </div>
                    <input ref={inputFoto} type="file" accept="image/*" className="hidden" onChange={escolherFoto} />
                    <Button type="button" variant="outline" className="gap-2" onClick={() => inputFoto.current?.click()}>
                      <Camera className="h-4 w-4" /> {foto ? 'Trocar foto' : 'Tirar ou escolher foto'}
                    </Button>
                  </div>
                </div>

                <div>
                  <Label>Motivo *</Label>
                  <Select value={motivo || undefined} onValueChange={v => setMotivo(v as Motivo)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {MOTIVOS.map(m => <SelectItem key={m.valor} value={m.valor}>{m.rotulo}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tipo sanguíneo</Label>
                    <Select value={tipoSanguineo || undefined} onValueChange={setTipoSanguineo}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {TIPOS_SANGUINEOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="cnv">CNV {colaborador.vigilante ? '*' : ''}</Label>
                    <Input id="cnv" inputMode="numeric" value={cnv} onChange={e => setCnv(soDigitos(e.target.value).slice(0, 20))}
                      placeholder={colaborador.vigilante ? 'Obrigatória' : 'Se tiver'} />
                  </div>
                </div>

                <div>
                  <Label htmlFor="obs">Observação {motivo === 'outro' ? '*' : ''}</Label>
                  <Textarea id="obs" rows={2} maxLength={500} value={observacao} onChange={e => setObservacao(e.target.value)} />
                </div>

                <div>
                  <Label htmlFor="tel">Seu telefone (para o RH falar com você) *</Label>
                  <Input id="tel" inputMode="tel" value={formatarTelefone(telefone)} onChange={e => setTelefone(soDigitos(e.target.value))}
                    placeholder="(61) 99999-9999" />
                </div>

                <Button type="submit" size="lg" className="w-full gap-2" disabled={carregando}>
                  {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                  {carregando ? 'Enviando...' : 'Enviar solicitação'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default SolicitarCrachaPublico;
