import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardCheck, FileDown, Handshake, Loader2, LogOut, Moon, Send, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { cpfValido, formatarCpf, matriculaValida, soDigitos, type Solicitante } from '@/modules/crachas/lib/solicitacaoService';
import {
  EMPRESAS, HORARIOS, MOTIVOS, TURNOS, dataBr, enviarLancamento, horaBr, identificarFiscal, relatorioDoDia, turnoDoHorario,
  type ColaboradorSenior, type DadosLancamento, type FiscalIdentificado, type StatusMov,
} from '../lib/movimentacaoService';
import EscolherColaborador, { SeloReserva } from '../components/EscolherColaborador';
import { pdfRelatorioDia } from '../lib/relatorioDiaPdf';
import PassagemPlantaoCard from '../components/PassagemPlantaoCard';

/**
 * Link público do Controle de Movimentação Diária (substitui o Microsoft Forms).
 * O fiscal se identifica com a matrícula ou o CPF e lança quem faltou e quem
 * cobriu. A data é ele quem escolhe; se não for a de hoje, o lançamento fica
 * DIVERGENTE e a fiscalização recebe um e-mail.
 */

const LEMBRAR = 'movimentacao-fiscal';
const lembrada = (): string => { try { return localStorage.getItem(LEMBRAR) ?? ''; } catch { return ''; } };
const lembrar = (m: string) => { try { localStorage.setItem(LEMBRAR, m); } catch { /* sem armazenamento */ } };

const OUTRO = 'OUTRO';

interface Form {
  empresa: string; data: string;
  falta: ColaboradorSenior | null;
  sem_cobertura: boolean; cobertura: ColaboradorSenior | null;
  posto: string; motivo: string; justificativa: string;
  horario: string; horario_outro: string; turno: string;
  cobertura_por_extra: boolean | null; ocorrencias: number | null;
}
const vazio = (): Form => ({
  empresa: '', data: '', falta: null, sem_cobertura: false, cobertura: null,
  posto: '', motivo: '', justificativa: '', horario: '', horario_outro: '', turno: '', cobertura_por_extra: null, ocorrencias: null,
});

/** Botões de escolha única (no lugar dos "radio" do Forms). */
function Opcoes<T extends string | number | boolean>({ valor, opcoes, mudar, colunas = 2, rotulo }: {
  valor: T | null | ''; opcoes: readonly { v: T; t: string }[]; mudar: (v: T) => void; colunas?: number; rotulo: string;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }}>
      {opcoes.map(o => (
        <button key={String(o.v)} type="button" role="radio" aria-checked={valor === o.v} onClick={() => mudar(o.v)}
          className={cn('rounded-md border px-2 py-2 text-sm font-medium transition-colors',
            valor === o.v ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}>
          {o.t}
        </button>
      ))}
    </div>
  );
}

const Campo = ({ n, titulo, obrig = true, children, dica }: { n: number; titulo: string; obrig?: boolean; children: React.ReactNode; dica?: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-sm">{n}. {titulo}{obrig && <span className="text-destructive"> *</span>}</Label>
    {children}
    {dica}
  </div>
);

const SeloStatus = ({ status }: { status: StatusMov }) => (
  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
    status === 'ok' ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100'
      : 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100')}>
    {status === 'ok' ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
    {status === 'ok' ? 'OK' : 'DIVERGENTE'}
  </span>
);

const MovimentacaoPublica = () => {
  const [por, setPor] = useState<'matricula' | 'cpf'>('matricula');
  const [solMat, setSolMat] = useState(lembrada());
  const [solCpf, setSolCpf] = useState('');
  const [quem, setQuem] = useState<Solicitante | null>(null);
  const [fiscal, setFiscal] = useState<FiscalIdentificado | null>(null);
  const [aba, setAba] = useState('novo');
  const [f, setF] = useState<Form>(vazio());
  const [resultado, setResultado] = useState<{ codigo: string; status: StatusMov; data: string; data_lancamento: string; ok_pelo_plantao?: boolean } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [diaRelatorio, setDiaRelatorio] = useState('');
  const [gerandoPdf, setGerandoPdf] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(x => ({ ...x, [k]: v }));

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    let s: Solicitante;
    if (por === 'matricula') {
      const m = matriculaValida(solMat);
      if (!m) return toast.error('Informe a sua matrícula (só números).');
      s = { matricula: m };
    } else {
      if (!cpfValido(solCpf)) return toast.error('CPF inválido.');
      s = { cpf: solCpf };
    }
    setCarregando(true);
    try {
      const r = await identificarFiscal(s);
      setQuem(s); setFiscal(r);
      setDiaRelatorio(r.plantao?.data_plantao ?? r.hoje);
      if (s.matricula) lembrar(String(s.matricula));
    } catch (err) { toast.error((err as Error).message); } finally { setCarregando(false); }
  };

  const baixarRelatorio = async (dia: string) => {
    if (!quem || !dia) return toast.error('Escolha o dia do relatório.');
    setGerandoPdf(true);
    try {
      const r = await relatorioDoDia(quem, dia);
      await pdfRelatorioDia(r);
      if (!r.lancamentos.length) toast.info(`Nenhum lançamento seu em ${dataBr(dia)}: o PDF saiu vazio.`);
    } catch (err) { toast.error((err as Error).message); } finally { setGerandoPdf(false); }
  };

  const sair = () => { setQuem(null); setFiscal(null); setSolCpf(''); setF(vazio()); setResultado(null); setAba('novo'); };

  const escolherHorario = (h: string) => {
    setF(x => ({ ...x, horario: h, turno: h !== OUTRO ? (turnoDoHorario(h) ?? x.turno) : x.turno }));
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quem || !fiscal) return;
    const horario = f.horario === OUTRO ? f.horario_outro.trim() : f.horario;
    const faltando: string[] = [];
    if (!f.empresa) faltando.push('empresa');
    if (!f.data) faltando.push('data');
    if (!f.falta) faltando.push('quem está na falta');
    if (!f.sem_cobertura && !f.cobertura) faltando.push('quem efetuou a cobertura');
    if (!f.posto.trim()) faltando.push('posto');
    if (!f.motivo) faltando.push('motivo');
    if (!horario) faltando.push('horário');
    if (!f.turno) faltando.push('turno');
    if (f.cobertura_por_extra === null) faltando.push('cobertura por extra');
    if (faltando.length) return toast.error(`Falta preencher: ${faltando.join(', ')}.`);
    if (f.data > fiscal.hoje) return toast.error('A data não pode ser depois de hoje.');

    if (f.falta && f.cobertura && f.falta.id === f.cobertura.id) return toast.error('Quem cobriu não pode ser a mesma pessoa que faltou.');
    const posto = fiscal.postos.find(p => p.nome.trim().toLowerCase() === f.posto.trim().toLowerCase());
    const dados: DadosLancamento = {
      empresa: f.empresa, data: f.data,
      falta_senior_id: f.falta!.id,
      sem_cobertura: f.sem_cobertura, cobertura_senior_id: f.sem_cobertura ? null : f.cobertura?.id ?? null,
      posto_id: posto?.id ?? null, posto_nome: posto?.nome ?? f.posto.trim(),
      motivo: f.motivo, justificativa: f.justificativa.trim(), horario, turno: f.turno,
      cobertura_por_extra: f.cobertura_por_extra, ocorrencias: f.ocorrencias,
    };
    if (!dataOk(f.data) && !window.confirm(
      `A data informada (${dataBr(f.data)}) não é a de hoje (${dataBr(fiscal.hoje)}).\n\nO lançamento vai ficar DIVERGENTE e a fiscalização será avisada por e-mail. Enviar assim mesmo?`)) return;

    setCarregando(true);
    try {
      const r = await enviarLancamento(quem, dados);
      setResultado(r);
      setFiscal(x => (x ? { ...x, lancamentos: r.lancamentos } : x));
      // Mantém empresa, data, posto e horário (o fiscal costuma lançar vários do mesmo plantão).
      setF(x => ({ ...vazio(), empresa: x.empresa, data: x.data, posto: x.posto, horario: x.horario, horario_outro: x.horario_outro, turno: x.turno, ocorrencias: x.ocorrencias }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { toast.error((err as Error).message); } finally { setCarregando(false); }
  };

  // Noturno depois da meia-noite: a data do plantão (ontem) também fica OK.
  const dataPlantao = fiscal?.plantao?.data_plantao ?? fiscal?.hoje ?? '';
  const plantaoDeOntem = !!fiscal?.plantao?.noturno && dataPlantao !== fiscal.hoje;
  function dataOk(d: string) { return !!fiscal && (d === fiscal.hoje || d === dataPlantao); }
  const dataDivergente = !!f.data && !!fiscal && !dataOk(f.data);

  return (
    <div className="min-h-screen bg-background py-6 px-4">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground flex items-center justify-center gap-2">
            <ClipboardCheck className="h-7 w-7 text-primary" /> Movimentação diária
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Lançamento de falta e cobertura (extra) do plantão.</p>
        </div>

        {!quem || !fiscal ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Fiscal</CardTitle>
              <CardDescription>Informe a <strong>sua</strong> matrícula ou o <strong>seu</strong> CPF.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={entrar} className="space-y-3">
                <div className="inline-flex rounded-md border p-0.5 text-sm">
                  {(['matricula', 'cpf'] as const).map(op => (
                    <button key={op} type="button" onClick={() => setPor(op)}
                      className={`px-3 py-1 rounded ${por === op ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                      {op === 'matricula' ? 'Matrícula' : 'CPF'}
                    </button>
                  ))}
                </div>
                {por === 'matricula' ? (
                  <div>
                    <Label htmlFor="fis-mat">Sua matrícula</Label>
                    <Input id="fis-mat" inputMode="numeric" autoComplete="off" value={solMat}
                      onChange={e => setSolMat(soDigitos(e.target.value).slice(0, 9))} />
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="fis-cpf">Seu CPF</Label>
                    <Input id="fis-cpf" inputMode="numeric" autoComplete="off" value={formatarCpf(solCpf)}
                      onChange={e => setSolCpf(soDigitos(e.target.value))} placeholder="000.000.000-00" />
                  </div>
                )}
                <Button type="submit" className="w-full gap-2" disabled={carregando}>
                  {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />} Entrar
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Fiscal</p>
                  <p className="font-semibold truncate">{fiscal.nome}</p>
                  <p className="text-xs text-muted-foreground truncate">Matrícula {fiscal.matricula}{fiscal.cargo ? ` · ${fiscal.cargo}` : ''}</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-1 shrink-0">
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => setAba('relatorio')}><Handshake className="h-4 w-4" /> Passar plantão</Button>
                  <Button variant="ghost" size="sm" className="gap-1" onClick={sair}><LogOut className="h-4 w-4" /> Sair</Button>
                </div>
              </CardContent>
            </Card>

            {resultado && (
              <div role="status" className={cn('rounded-lg border p-4 flex gap-3',
                resultado.status === 'ok' ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40' : 'border-amber-300 bg-amber-50 dark:bg-amber-950/40')}>
                {resultado.status === 'ok'
                  ? <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                  : <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0" />}
                <div className="text-sm space-y-1">
                  <p className="font-semibold">Lançamento {resultado.codigo} registrado — <SeloStatus status={resultado.status} /></p>
                  {resultado.status === 'ok'
                    ? <p>{resultado.ok_pelo_plantao
                      ? `Data do plantão noturno ${dataBr(resultado.data)}, lançada em ${dataBr(resultado.data_lancamento)} ainda dentro do plantão.`
                      : `Data ${dataBr(resultado.data)} lançada no próprio dia.`}</p>
                    : <p>Data informada {dataBr(resultado.data)}, lançada em {dataBr(resultado.data_lancamento)}. A fiscalização será avisada por e-mail.</p>}
                  <button type="button" className="text-primary underline text-xs" onClick={() => setResultado(null)}>Fechar</button>
                </div>
              </div>
            )}

            <Tabs value={aba} onValueChange={setAba}>
              <TabsList className="grid grid-cols-3 w-full h-auto">
                <TabsTrigger value="novo" className="whitespace-normal">Novo</TabsTrigger>
                <TabsTrigger value="meus" className="whitespace-normal">Meus ({fiscal.lancamentos.length})</TabsTrigger>
                <TabsTrigger value="relatorio" className="whitespace-normal gap-1"><FileDown className="h-3.5 w-3.5" /> Relatório / plantão</TabsTrigger>
              </TabsList>

              <TabsContent value="novo">
                <Card>
                  <CardContent className="pt-5">
                    <form onSubmit={enviar} className="space-y-5">
                      <Campo n={1} titulo="Empresa">
                        <Opcoes rotulo="Empresa" valor={f.empresa} opcoes={EMPRESAS.map(v => ({ v, t: v }))} mudar={v => set('empresa', v)} />
                      </Campo>

                      <Campo n={2} titulo="Data" dica={
                        dataDivergente ? (
                          <p className="text-xs rounded-md bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100 px-2 py-1.5 flex gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            Não é a data de hoje ({dataBr(fiscal.hoje)}): o lançamento vai ficar DIVERGENTE e a fiscalização será avisada.
                          </p>
                        ) : f.data ? (
                          <p className="text-xs text-emerald-700 dark:text-emerald-400 flex gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" />
                            {f.data !== fiscal.hoje ? 'Data do seu plantão noturno: vai ficar OK.' : 'Lançamento do dia: vai ficar OK.'}</p>
                        ) : null
                      }>
                        {fiscal.plantao?.noturno && (
                          <div className="mb-2 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-xs text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100 flex gap-2">
                            <Moon className="h-4 w-4 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <p>Plantão noturno: <strong>{fiscal.plantao.entrada} às {fiscal.plantao.saida}</strong>.</p>
                              {plantaoDeOntem && (
                                <>
                                  <p>Você está no plantão que começou em <strong>{dataBr(dataPlantao)}</strong>. Lançamentos com essa data ficam OK até as {fiscal.plantao.aceita_ate?.slice(11, 16)} de hoje.</p>
                                  {f.data !== dataPlantao && (
                                    <button type="button" className="underline font-medium" onClick={() => set('data', dataPlantao)}>Usar a data do plantão ({dataBr(dataPlantao)})</button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="relative">
                          <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                          <Input type="date" className="pl-8" max={fiscal.hoje} value={f.data} onChange={e => set('data', e.target.value)} aria-label="Data" />
                        </div>
                      </Campo>

                      <fieldset className="space-y-3 rounded-md border p-3">
                        <legend className="px-1 text-xs font-semibold text-muted-foreground">QUEM ESTÁ NA FALTA</legend>
                        <Campo n={3} titulo="Quem está na falta (nome, matrícula ou CPF)" dica={<p className="text-[11px] text-muted-foreground">Os dados vêm da Senior.</p>}>
                          <EscolherColaborador quem={quem} rotulo="quem está na falta" valor={f.falta} mudar={c => set('falta', c)}
                            excluirId={f.cobertura?.id} />
                        </Campo>
                      </fieldset>

                      <fieldset className="space-y-3 rounded-md border p-3">
                        <legend className="px-1 text-xs font-semibold text-muted-foreground">QUEM EFETUOU A COBERTURA</legend>
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox checked={f.sem_cobertura} onCheckedChange={v => set('sem_cobertura', v === true)} />
                          Ninguém cobriu (posto descoberto)
                        </label>
                        {!f.sem_cobertura && (
                          <Campo n={4} titulo="Quem efetuou a cobertura (nome, matrícula ou CPF)">
                            <EscolherColaborador quem={quem} rotulo="quem efetuou a cobertura" valor={f.cobertura} mudar={c => set('cobertura', c)}
                              excluirId={f.falta?.id} />
                          </Campo>
                        )}
                      </fieldset>

                      <Campo n={5} titulo="Qual posto foi realizado a extra?" dica={
                        f.posto && !fiscal.postos.some(p => p.nome.toLowerCase() === f.posto.trim().toLowerCase())
                          ? <p className="text-xs text-muted-foreground">Posto fora da lista: vai como digitado (ex.: reserva técnica).</p> : null
                      }>
                        <Input list="mov-postos" autoComplete="off" placeholder="Digite para buscar o posto" value={f.posto}
                          onChange={e => set('posto', e.target.value.slice(0, 150))} />
                        <datalist id="mov-postos">
                          {fiscal.postos.map(p => <option key={p.id} value={p.nome} />)}
                        </datalist>
                      </Campo>

                      <Campo n={6} titulo="Motivo da extra">
                        <Opcoes rotulo="Motivo" valor={f.motivo} opcoes={MOTIVOS.map(v => ({ v, t: v }))} mudar={v => set('motivo', v)} />
                      </Campo>

                      <Campo n={7} titulo="Outros (caso tenha alguma justificativa)" obrig={false}>
                        <Textarea rows={2} value={f.justificativa} onChange={e => set('justificativa', e.target.value.slice(0, 500))} />
                      </Campo>

                      <Campo n={8} titulo="Horário da extra">
                        <Opcoes rotulo="Horário" valor={f.horario} colunas={2}
                          opcoes={[...HORARIOS.map(v => ({ v: v as string, t: v.replace(' AS ', ' às ') })), { v: OUTRO, t: 'Outro horário' }]}
                          mudar={escolherHorario} />
                        {f.horario === OUTRO && (
                          <Input className="mt-2" placeholder="Digite o horário (ex.: 07:00 às 16:00)" value={f.horario_outro}
                            onChange={e => { const v = e.target.value.slice(0, 40); setF(x => ({ ...x, horario_outro: v, turno: turnoDoHorario(v) ?? x.turno })); }} />
                        )}
                      </Campo>

                      <Campo n={9} titulo="Turno em que a extra foi realizada">
                        <Opcoes rotulo="Turno" valor={f.turno} opcoes={TURNOS.map(v => ({ v, t: v }))} mudar={v => set('turno', v)} />
                      </Campo>

                      <Campo n={10} titulo="Cobertura por extra?">
                        <Opcoes rotulo="Cobertura por extra" valor={f.cobertura_por_extra}
                          opcoes={[{ v: true, t: 'SIM' }, { v: false, t: 'NÃO' }]} mudar={v => set('cobertura_por_extra', v)} />
                      </Campo>

                      <Campo n={11} titulo="Quantas ocorrências de falta / postos descobertos teve no seu plantão?" obrig={false}>
                        <Opcoes rotulo="Ocorrências no plantão" valor={f.ocorrencias} colunas={6}
                          opcoes={Array.from({ length: 11 }, (_, i) => ({ v: i, t: String(i) }))}
                          mudar={v => set('ocorrencias', f.ocorrencias === v ? null : v)} />
                      </Campo>

                      <Button type="submit" className="w-full gap-2" size="lg" disabled={carregando}>
                        {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar lançamento
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="meus">
                <Card>
                  <CardContent className="pt-4 space-y-2">
                    {fiscal.lancamentos.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Nenhum lançamento ainda.</p>}
                    {fiscal.lancamentos.map(l => (
                      <div key={l.id} className="rounded-md border p-3 text-sm space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{dataBr(l.data)} · {l.posto}</span>
                          <SeloStatus status={l.status} />
                        </div>
                        <p className="text-muted-foreground">
                          {l.motivo}: <span className="text-foreground">{l.falta_nome}</span>
                          {l.falta_reserva && <SeloReserva className="ml-1 align-middle" />}
                          {' → '}{l.cobertura_nome ? <span className="text-foreground">{l.cobertura_nome}</span> : 'ninguém cobriu'}
                          {l.cobertura_reserva && <SeloReserva className="ml-1 align-middle" />}
                        </p>
                        <p className="text-xs text-muted-foreground">{l.horario} · {l.turno} · lançado em {horaBr(l.criado_em)} · {l.codigo}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="relatorio" className="space-y-4">
                <PassagemPlantaoCard quem={quem} fiscal={fiscal} dataPlantao={dataPlantao} />
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Relatório do dia (PDF)</CardTitle>
                    <CardDescription>
                      Os seus lançamentos do dia escolhido: os com essa data e os feitos nesse dia com outra data.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {[...new Set([fiscal.hoje, dataPlantao])].filter(Boolean).map(d => (
                        <Button key={d} type="button" variant="outline" size="sm" className="gap-1.5" disabled={gerandoPdf}
                          onClick={() => { setDiaRelatorio(d); baixarRelatorio(d); }}>
                          <FileDown className="h-4 w-4" /> {d === fiscal.hoje ? 'Hoje' : 'Plantão'} ({dataBr(d)})
                        </Button>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="mov-dia-rel" className="text-sm">Outro dia</Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                          <Input id="mov-dia-rel" type="date" className="pl-8" max={fiscal.hoje} value={diaRelatorio}
                            onChange={e => setDiaRelatorio(e.target.value)} />
                        </div>
                        <Button type="button" className="gap-1.5 shrink-0" disabled={gerandoPdf || !diaRelatorio} onClick={() => baixarRelatorio(diaRelatorio)}>
                          {gerandoPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Baixar PDF
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Quem está na reserva da Senior sai marcado como RESERVA no relatório.</p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
};

export default MovimentacaoPublica;
