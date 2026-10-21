import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Plus, Trash2, Save, ShieldCheck, Tablet, Monitor, MessageCircle, Search, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { EPIFicha, EPIItem, MotivoEntrega, Turno } from '@/types/epi';
import { generateId, saveFicha, criarTokenAssinatura } from '@/services/fichaService';
import { getConfig, loadConfig } from '@/services/configService';
import SignaturePad from '@/components/SignaturePad';
import SelfieAssinatura from '@/components/SelfieAssinatura';
import { Funcao, EPI, listFuncoes, listEpis, listFuncaoEpis } from '@/services/estoqueService';
import { Empresa, listEmpresas } from '@/services/empresasService';
import { Posto, listPostos } from '@/services/postosService';
import { useAuth } from '@/contexts/AuthContext';
import { EMPRESAS_SENIOR, empresaDaSenior, empresaPelaMatricula } from '@/lib/empresaPelaMatricula';
import { chaveSolta, limparNomePosto } from '@/lib/geoPlanilha';
import { ModeloFicha, listModelosAtivos } from '@/services/modelosFichaService';
import { supabase } from '@/integrations/supabase/client';
import BackButton from '@/components/BackButton';
import EstadoSelect, { useEstadoLembrado } from '@/components/EstadoSelect';
import {
  consultarColaboradorSenior, consultarColaboradorSeniorPorCpf, formatCpf, nomePostoTrabalho, SITUACAO_TRABALHANDO,
  turnoDaEscala,
} from '@/services/seniorService';

export default function NovaFicha() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tipo = (searchParams.get('tipo') === 'uniforme' ? 'uniforme' : 'epi') as 'epi' | 'uniforme';
  const today = new Date().toISOString().split('T')[0];
  const [config, setConfig] = useState(getConfig());
  const [uf, setUf] = useEstadoLembrado('nova-ficha');
  const { estados } = useAuth();

  const [form, setForm] = useState({
    nomeFuncionario: '',
    funcao: '',
    telefone: '',
    cpf: '',
    matricula: '',
    motivo: 'admissao' as MotivoEntrega,
    turno: 'diurno' as Turno,
    posto: '',
    localSenior: '',
    centroCustoCodigo: '',
    centroCusto: '',
    postoTrabalhoCodigo: '',
    postoTrabalho: '',
    escala: '',
    empresa: config.empresaNome,
    dataEntrega: today,
    observacoes: '',
    modeloId: '',
  });

  const [itens, setItens] = useState<EPIItem[]>([
    { id: generateId(), descricao: 'Gandola em Gabardine Azul', ca: '', quantidade: 2, tamanho: '', dataEntrega: today, postoServico: '', recebido: false },
    { id: generateId(), descricao: 'Calça em Gabardine Azul', ca: '', quantidade: 2, tamanho: '', dataEntrega: today, postoServico: '', recebido: false },
    { id: generateId(), descricao: 'Sapato Antiderrapante Spider Pro', ca: '48583', quantidade: 1, tamanho: '', dataEntrega: today, postoServico: '', recebido: false },
  ]);

  const [assinaturaColaborador, setAssinaturaColaborador] = useState('');
  const [selfie, setSelfie] = useState('');
  const [selfieEm, setSelfieEm] = useState('');
  const [assinaturaResponsavel, setAssinaturaResponsavel] = useState(config.assinaturaEmpresa || '');

  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [epis, setEpis] = useState<EPI[]>([]);
  const [funcaoId, setFuncaoId] = useState<string>('');
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [modelos, setModelos] = useState<ModeloFicha[]>([]);
  const [postos, setPostos] = useState<Posto[]>([]);

  useEffect(() => { listPostos().then(setPostos).catch(() => {}); }, []);

  const [funcoesCarregadas, setFuncoesCarregadas] = useState(false);
  useEffect(() => {
    listFuncoes().then(setFuncoes).catch(() => {}).finally(() => setFuncoesCarregadas(true));
    listEpis(tipo).then(setEpis).catch(() => {});
    setEmpresas(listEmpresas());
  }, [tipo]);

  useEffect(() => {
    listModelosAtivos().then(list => {
      setModelos(list);
      const padrao = list.find(m => m.padrao) ?? list[0];
      if (padrao) setForm(prev => ({ ...prev, modeloId: prev.modeloId || padrao.id }));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    loadConfig().then(cfg => {
      if (!active) return;
      setConfig(cfg);
      setForm(prev => ({ ...prev, empresa: prev.empresa || cfg.empresaNome }));
      setAssinaturaResponsavel(prev => prev || cfg.assinaturaEmpresa || '');
    });
    return () => { active = false; };
  }, []);

  // "Tipo de uniforme" (cadastro de Funções): só preenche os itens. A função do
  // colaborador é texto próprio, vindo do cargo na Senior.
  // Cada estado tem as suas funções: a ficha só oferece as do estado escolhido.
  const funcoesDoEstado = funcoes.filter(f => f.uf === uf);
  useEffect(() => {
    if (funcaoId && funcoes.length && !funcoes.some(f => f.id === funcaoId && f.uf === uf)) setFuncaoId('');
  }, [uf, funcoes]); // eslint-disable-line react-hooks/exhaustive-deps

  const aplicarFuncao = async (id: string) => {
    setFuncaoId(id);
    if (!id) return;
    try {
      const vincs = await listFuncaoEpis(id);
      // Filtra somente itens compatíveis com o tipo atual da ficha (EPI ou Uniforme)
      const idsValidos = new Set(epis.map(e => e.id));
      const novosItens: EPIItem[] = vincs
        .filter(v => idsValidos.has(v.epi_id))
        .map(v => {
          const epi = epis.find(e => e.id === v.epi_id);
          return {
            id: generateId(),
            descricao: epi?.nome || '',
            ca: epi?.ca_numero || '',
            quantidade: v.quantidade || 1,
            tamanho: v.tamanho || '',
            dataEntrega: today,
            postoServico: '',
            recebido: false,
            epiId: v.epi_id,
          };
        });
      if (novosItens.length) setItens(novosItens);
    } catch { /* ignore */ }
  };

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  // Empresa pela matrícula: 1xxxxxx = segurança (matriz), 3xxxxxx = apoio. Vale para
  // matrícula digitada ou do histórico; a busca na Senior traz o nome da própria Senior.
  // Não passa por cima de uma empresa escolhida à mão (cadastrada em Configurações).
  useEffect(() => {
    const empresa = empresaPelaMatricula(form.matricula);
    if (!empresa) return;
    setForm(prev => {
      const automatica = !prev.empresa || prev.empresa === config.empresaNome
        || ['MATRIZ', 'APOIO', ...Object.values(EMPRESAS_SENIOR)].includes(prev.empresa);
      return automatica && prev.empresa !== empresa ? { ...prev, empresa } : prev;
    });
  }, [form.matricula]); // eslint-disable-line react-hooks/exhaustive-deps

  const addItem = () => {
    setItens(prev => [...prev, {
      id: generateId(),
      descricao: '',
      ca: '',
      quantidade: 1,
      tamanho: '',
      dataEntrega: today,
      postoServico: '',
      recebido: false,
    }]);
  };

  const removeItem = (id: string) => {
    setItens(prev => prev.filter(i => i.id !== id));
  };

  const updateItem = (id: string, field: keyof EPIItem, value: any) => {
    setItens(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const [finalizeOpen, setFinalizeOpen] = useState(false);

  const buildFicha = (asSigned: boolean): EPIFicha => ({
    id: generateId(),
    ...form,
    uf,
    itens,
    assinaturaColaborador: assinaturaColaborador || undefined,
    assinaturaResponsavel: assinaturaResponsavel || undefined,
    ...(asSigned && selfie && { selfieColaborador: selfie, selfieEm }),
    status: asSigned ? 'assinada' : 'pendente',
    criadoEm: new Date().toISOString(),
    assinadoEm: asSigned ? new Date().toISOString() : undefined,
  });

  const validateBasics = () => {
    if (!uf) { toast.error('Escolha o estado da ficha'); return false; }
    if (!form.nomeFuncionario.trim()) { toast.error('Informe o nome do funcionário'); return false; }
    if (!form.dataEntrega) { toast.error('Informe a data de entrega'); return false; }
    if (itens.length === 0) { toast.error('Adicione ao menos um item'); return false; }
    return true;
  };

  const handleSave = async (asSigned: boolean) => {
    if (!validateBasics()) return;
    if (asSigned) {
      const checkedItems = itens.filter(i => i.recebido);
      if (checkedItems.length === 0) { toast.error('Marque ao menos um item de EPI'); return; }
      if (!assinaturaColaborador || !assinaturaResponsavel) {
        toast.error('É necessário ambas as assinaturas para finalizar');
        return;
      }
      if (!selfie) {
        toast.error('Tire a selfie do funcionário logo após a rubrica');
        document.getElementById('assinaturas-card')?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    const ficha = buildFicha(asSigned);
    try {
      await saveFicha(ficha);
      toast.success(asSigned ? 'Ficha assinada com sucesso!' : 'Ficha salva como pendente');
      navigate(`/ficha/${ficha.id}`);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar a ficha');
    }
  };

  const handleFinalize = () => {
    if (!validateBasics()) return;
    setFinalizeOpen(true);
  };

  const finalizarTablet = async () => {
    const ficha = buildFicha(false);
    try {
      await saveFicha(ficha);
      setFinalizeOpen(false);
      toast.success('Ficha enviada para o tablet. Acesse "Assinar (Tablet)" no dispositivo logado.');
      navigate('/pendentes');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    }
  };

  const finalizarDesktop = () => {
    setFinalizeOpen(false);
    if (!assinaturaColaborador || !assinaturaResponsavel || !selfie) {
      toast.info('Capture as assinaturas e a selfie do funcionário abaixo e clique em "Confirmar Assinatura"');
      document.getElementById('assinaturas-card')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    handleSave(true);
  };

  const finalizarWhatsApp = async () => {
    const phone = (form.telefone || '').replace(/\D/g, '');
    if (!phone) { toast.error('Informe o telefone do funcionário para enviar via WhatsApp'); return; }
    const ficha = buildFicha(false);
    try {
      await saveFicha(ficha);
      const token = await criarTokenAssinatura(ficha.id);
      if (!token) { toast.error('Erro ao gerar link de assinatura'); return; }
      const link = `${window.location.origin}/assinar/${token}`;
      const msg = `Olá ${form.nomeFuncionario}, segue o link para assinatura da sua ficha de EPI: ${link}`;
      const waNumber = phone.length <= 11 ? `55${phone}` : phone;
      window.open(`https://web.whatsapp.com/send?phone=${waNumber}&text=${encodeURIComponent(msg)}`, '_blank');
      setFinalizeOpen(false);
      toast.success('Link gerado e WhatsApp Web aberto');
      navigate(`/ficha/${ficha.id}`);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    }
  };

  const motivoLabels: Record<MotivoEntrega, string> = {
    admissao: 'Admissão',
    substituicao: 'Substituição',
    perda_extravio: 'Perda/Extravio',
    demissao: 'Demissão',
    complemento: 'Complemento',
  };

  const [seniorBusca, setSeniorBusca] = useState({ por: 'matricula' as 'matricula' | 'cpf', numEmp: '1', numCad: '', cpf: '' });
  const [buscandoSenior, setBuscandoSenior] = useState(false);

  /**
   * O "local" da Senior é posto + função ("SEEC- BOMBEIRO BRIGADISTA"): tira a
   * função e procura no cadastro de postos (nome ou apelido). Sem cadastro,
   * usa o nome limpo para a pessoa conferir.
   */
  function postoDaSenior(local: string | null): { nome: string; uf?: string } | null {
    if (!local) return null;
    const limpo = limparNomePosto(local);
    const chaves = new Set([chaveSolta(limpo), chaveSolta(local)]);
    const achado = postos.find(p => [p.nome, ...p.apelidos].some(n => chaves.has(chaveSolta(n))));
    return achado ? { nome: achado.nome, uf: achado.uf } : (limpo ? { nome: limpo } : null);
  }

  async function buscarNaSenior(direto?: { numEmp: number; numCad: number }) {
    const busca = direto ? { ...seniorBusca, por: 'matricula' as const } : seniorBusca;
    const numEmp = direto?.numEmp ?? Number(seniorBusca.numEmp);
    const numCad = direto?.numCad ?? Number(seniorBusca.numCad);
    const cpf = seniorBusca.cpf.replace(/\D/g, '');
    if (busca.por === 'cpf' && cpf.length !== 11) {
      toast.error('Informe o CPF completo (11 dígitos)');
      return;
    }
    if (busca.por === 'matricula' && (!Number.isInteger(numEmp) || numEmp <= 0 || !Number.isInteger(numCad) || numCad <= 0)) {
      toast.error('Informe o nº da empresa e o cadastro (matrícula) da Senior');
      return;
    }
    setBuscandoSenior(true);
    try {
      const c = busca.por === 'cpf'
        ? await consultarColaboradorSeniorPorCpf(cpf)
        : await consultarColaboradorSenior(numEmp, numCad);
      // Posto: o posto de trabalho da Senior; sem ele, o local.
      const posto = postoDaSenior(nomePostoTrabalho(c.postoDescricao)) ?? postoDaSenior(c.nomeLocal);
      const turno = turnoDaEscala(c.escalaNome);
      setForm(f => ({
        ...f,
        nomeFuncionario: c.nome || f.nomeFuncionario,
        cpf: c.cpf ? formatCpf(c.cpf) : f.cpf,
        telefone: c.telefone || f.telefone,
        matricula: String(c.numCad),
        empresa: empresaDaSenior(c.empresaNome, c.razaoSocial) ?? f.empresa,
        funcao: c.cargo || f.funcao,
        posto: posto?.nome ?? f.posto,
        localSenior: c.nomeLocal ?? '',
        centroCustoCodigo: c.codCentroCusto ?? '',
        centroCusto: c.centroCusto ?? '',
        postoTrabalhoCodigo: c.postoCodigo ?? '',
        postoTrabalho: c.postoDescricao ?? '',
        escala: c.escalaNome ?? '',
        turno: turno ?? f.turno,
      }));
      let ufFicha = uf;
      if (posto) {
        setItens(prev => prev.map(it => (!it.postoServico || it.postoServico === form.posto) ? { ...it, postoServico: posto.nome } : it));
        if (posto.uf && estados.includes(posto.uf)) { setUf(posto.uf); ufFicha = posto.uf; }
      }
      // Se existir no estado da ficha um tipo de uniforme com o nome do cargo, já escolhe e preenche os itens.
      const tipoUniforme = c.cargo && funcoes.find(x => x.uf === ufFicha && x.nome.trim().toLowerCase() === c.cargo!.trim().toLowerCase());
      if (tipoUniforme) await aplicarFuncao(tipoUniforme.id);
      if (c.situacao !== null && c.situacao !== SITUACAO_TRABALHANDO) {
        toast.warning(`Atenção: na Senior este colaborador está "${c.situacaoDescricao || `situação ${c.situacao}`}".`);
      } else {
        toast.success(`Dados de ${c.nome} carregados da Senior`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao consultar a Senior');
    } finally {
      setBuscandoSenior(false);
    }
  }

  // Vindo de Colaboradores Senior (?senior_emp=&senior_cad=): já busca na Senior.
  const buscouDaUrl = useRef(false);
  useEffect(() => {
    const numEmp = Number(searchParams.get('senior_emp'));
    const numCad = Number(searchParams.get('senior_cad'));
    if (buscouDaUrl.current || !funcoesCarregadas || !numEmp || !numCad) return;
    buscouDaUrl.current = true;
    setSeniorBusca(b => ({ ...b, por: 'matricula', numEmp: String(numEmp), numCad: String(numCad) }));
    buscarNaSenior({ numEmp, numCad });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funcoesCarregadas, searchParams]);

  // Auto-preenche dados quando o nome já existe no histórico
  async function autocompletarPorNome(nome: string) {
    const n = (nome || '').trim();
    if (n.length < 3) return;
    try {
      const { data } = await supabase
        .from('fichas_epi')
        .select('nome_funcionario, funcao, telefone, cpf_snapshot, matricula_snapshot, posto_snapshot, empresa, turno, funcao_id')
        .ilike('nome_funcionario', n)
        .order('created_at', { ascending: false })
        .limit(1);
      const prev = data?.[0];
      if (!prev) return;
      setForm(f => ({
        ...f,
        funcao: f.funcao || prev.funcao || '',
        telefone: f.telefone || prev.telefone || '',
        cpf: f.cpf || prev.cpf_snapshot || '',
        matricula: f.matricula || prev.matricula_snapshot || '',
        posto: f.posto || prev.posto_snapshot || '',
        empresa: f.empresa || prev.empresa || f.empresa,
        turno: (f.turno || prev.turno || 'diurno') as Turno,
      }));
      if (!funcaoId && prev.funcao_id) setFuncaoId(prev.funcao_id);
      toast.success('Dados preenchidos a partir do último registro');
    } catch {
      // silencioso
    }
  }

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-4xl mx-auto space-y-6">
        <BackButton />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Nova Ficha de {tipo === 'uniforme' ? 'Uniforme' : 'EPI'}</h2>
          <p className="text-sm text-muted-foreground">Preencha os dados do colaborador e os itens entregues. Ao digitar o nome, os dados anteriores serão sugeridos automaticamente.</p>
        </div>

        {/* Modelo do documento — escolhido antes de preencher o resto */}
        {modelos.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Modelo do documento</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={form.modeloId} onValueChange={v => updateField('modeloId', v)}>
                <SelectTrigger id="modelo"><SelectValue placeholder="Selecione o modelo" /></SelectTrigger>
                <SelectContent>
                  {modelos.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* Employee Data */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados do Funcionário</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="uf">Estado *</Label>
              <EstadoSelect id="uf" value={uf} onChange={setUf} placeholder="Escolha o estado" />
              <p className="text-xs text-muted-foreground mt-1">O estoque sai deste estado. Não muda depois de salvar.</p>
            </div>
            <div className="hidden sm:block" />
            <div className="sm:col-span-2 rounded-lg border border-dashed bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs text-muted-foreground">Buscar na Senior por</Label>
                <div className="inline-flex rounded-md border bg-background p-0.5">
                  {(['matricula', 'cpf'] as const).map(op => (
                    <button key={op} type="button"
                      onClick={() => setSeniorBusca(b => ({ ...b, por: op }))}
                      className={`px-2.5 py-0.5 text-xs rounded ${seniorBusca.por === op ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                      {op === 'matricula' ? 'Matrícula' : 'CPF'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-1 flex flex-wrap items-end gap-2">
                {seniorBusca.por === 'matricula' ? (
                  <>
                    <div className="w-24">
                      <Label htmlFor="senior-emp" className="text-xs">Empresa</Label>
                      <Input id="senior-emp" inputMode="numeric" value={seniorBusca.numEmp}
                        onChange={e => setSeniorBusca(b => ({ ...b, numEmp: e.target.value.replace(/\D/g, '') }))} />
                    </div>
                    <div className="flex-1 min-w-[8rem]">
                      <Label htmlFor="senior-cad" className="text-xs">Cadastro</Label>
                      <Input id="senior-cad" inputMode="numeric" value={seniorBusca.numCad} placeholder="Nº do cadastro"
                        onChange={e => {
                          // Na Senior, matrícula 3xxxxxx é da empresa 3 (Apoio); 1/2/6xxxxxx, da empresa 1.
                          const numCad = e.target.value.replace(/\D/g, '');
                          const numEmp = numCad.startsWith('3') ? '3' : /^[126]/.test(numCad) ? '1' : null;
                          setSeniorBusca(b => ({ ...b, numCad, numEmp: numEmp ?? b.numEmp }));
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscarNaSenior(); } }} />
                    </div>
                  </>
                ) : (
                  <div className="flex-1 min-w-[10rem]">
                    <Label htmlFor="senior-cpf" className="text-xs">CPF</Label>
                    <Input id="senior-cpf" inputMode="numeric" value={seniorBusca.cpf} placeholder="000.000.000-00"
                      onChange={e => setSeniorBusca(b => ({ ...b, cpf: formatCpf(e.target.value.replace(/\D/g, '').slice(0, 11)) }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscarNaSenior(); } }} />
                  </div>
                )}
                <Button type="button" variant="secondary" onClick={() => buscarNaSenior()} disabled={buscandoSenior} data-guia="btn-nova-ficha-buscar">
                  {buscandoSenior ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
                  Buscar
                </Button>
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="nome">Nome do Funcionário *</Label>
              <Input id="nome" value={form.nomeFuncionario}
                onChange={e => updateField('nomeFuncionario', e.target.value)}
                onBlur={() => autocompletarPorNome(form.nomeFuncionario)}
                placeholder="Nome completo" />
            </div>
            <div>
              <Label htmlFor="funcao">Função</Label>
              <Input id="funcao" value={form.funcao} onChange={e => updateField('funcao', e.target.value)}
                placeholder="Cargo do colaborador (vem da Senior)" />
            </div>
            <div>
              <Label htmlFor="tipo-uniforme">Tipo de uniforme</Label>
              <Select value={funcaoId} onValueChange={aplicarFuncao} disabled={funcoesDoEstado.length === 0}>
                <SelectTrigger id="tipo-uniforme">
                  <SelectValue placeholder={!uf ? 'Escolha o estado primeiro'
                    : funcoesDoEstado.length ? 'Selecione (preenche os itens)' : `Nenhum cadastrado em Funções para ${uf}`} />
                </SelectTrigger>
                <SelectContent>
                  {funcoesDoEstado.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="telefone">Telefone</Label>
              <Input id="telefone" value={form.telefone} onChange={e => updateField('telefone', e.target.value)} placeholder="(61) 9xxxx-xxxx" />
            </div>
            <div>
              <Label htmlFor="cpf">CPF</Label>
              <Input id="cpf" value={form.cpf} onChange={e => updateField('cpf', e.target.value)} placeholder="000.000.000-00" />
            </div>
            <div>
              <Label htmlFor="matricula">Matrícula</Label>
              <Input id="matricula" value={form.matricula} onChange={e => updateField('matricula', e.target.value)} placeholder="Nº matrícula" />
            </div>
            <div>
              <Label>Motivo</Label>
              <Select value={form.motivo} onValueChange={v => updateField('motivo', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(motivoLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Turno</Label>
              <Select value={form.turno} onValueChange={v => updateField('turno', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="diurno">Diurno</SelectItem>
                  <SelectItem value="noturno">Noturno</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="posto">Posto</Label>
              <Input id="posto" value={form.posto} onChange={e => {
                const novo = e.target.value;
                const antigo = form.posto;
                updateField('posto', novo);
                setItens(prev => prev.map(it => (!it.postoServico || it.postoServico === antigo) ? { ...it, postoServico: novo } : it));
              }} placeholder="Posto" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="posto-trabalho">
                Posto de trabalho (Senior)
                {form.postoTrabalhoCodigo && <span className="ml-1 font-normal text-muted-foreground">({form.postoTrabalhoCodigo})</span>}
              </Label>
              <Input id="posto-trabalho" value={form.postoTrabalho} onChange={e => updateField('postoTrabalho', e.target.value)}
                placeholder="Vem da Senior" />
              {form.escala && <p className="text-xs text-muted-foreground mt-1">Escala: {form.escala}</p>}
            </div>
            <div>
              <Label htmlFor="local-senior">Local (Senior)</Label>
              <Input id="local-senior" value={form.localSenior} onChange={e => updateField('localSenior', e.target.value)}
                placeholder="Vem da Senior" />
            </div>
            <div>
              <Label htmlFor="centro-custo">
                Centro de custo
                {form.centroCustoCodigo && <span className="ml-1 font-normal text-muted-foreground">(código {form.centroCustoCodigo})</span>}
              </Label>
              <Input id="centro-custo" value={form.centroCusto} onChange={e => updateField('centroCusto', e.target.value)}
                placeholder="Vem da Senior" />
            </div>
            <div>
              <Label htmlFor="empresa">Empresa</Label>
              <Select value={form.empresa} onValueChange={v => updateField('empresa', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                  <SelectContent>
                    {[...new Set([form.empresa, ...Object.values(EMPRESAS_SENIOR), config.empresaNome, ...empresas.map(e => e.nome)])]
                      .filter(Boolean).map(nome => <SelectItem key={nome} value={nome}>{nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="data">Data de Entrega *</Label>
              <Input id="data" type="date" value={form.dataEntrega} onChange={e => updateField('dataEntrega', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* EPI Items */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Itens de {tipo === 'uniforme' ? 'Uniforme' : 'EPI'}</CardTitle>
            <Button variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {itens.map((item) => (
              <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                <Checkbox
                  checked={item.recebido}
                  onCheckedChange={(v) => updateItem(item.id, 'recebido', !!v)}
                  className="mt-2"
                />
                <div className="flex-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="sm:col-span-2">
                    {epis.length > 0 ? (
                      <Select
                        value={item.epiId || '__manual__'}
                        onValueChange={(v) => {
                          if (v === '__manual__') {
                            updateItem(item.id, 'epiId', undefined);
                            return;
                          }
                          const epi = epis.find(e => e.id === v);
                          if (!epi) return;
                          setItens(prev => prev.map(i => i.id === item.id ? {
                            ...i,
                            epiId: epi.id,
                            descricao: epi.nome,
                            ca: epi.ca_numero || '',
                          } : i));
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione o item do catálogo" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__manual__">— Digitar manualmente —</SelectItem>
                          {epis.map(e => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.nome}{e.ca_numero ? ` (CA ${e.ca_numero})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                    {(!item.epiId || epis.length === 0) && (
                      <Input
                        placeholder="Descrição do item"
                        value={item.descricao}
                        onChange={e => updateItem(item.id, 'descricao', e.target.value)}
                        className={epis.length > 0 ? 'mt-2' : ''}
                      />
                    )}
                  </div>
                  <Input
                    placeholder="C.A."
                    value={item.ca}
                    onChange={e => updateItem(item.id, 'ca', e.target.value)}
                  />
                  <Input
                    placeholder="Qtd"
                    type="number"
                    min={1}
                    value={item.quantidade}
                    onChange={e => updateItem(item.id, 'quantidade', parseInt(e.target.value) || 1)}
                  />
                  <Input
                    placeholder="Tam. / Nº"
                    value={item.tamanho}
                    onChange={e => updateItem(item.id, 'tamanho', e.target.value)}
                  />
                  <Input
                    placeholder="Posto de Serviço"
                    value={item.postoServico}
                    onChange={e => updateItem(item.id, 'postoServico', e.target.value)}
                  />
                  <div className="rounded-md border border-dashed bg-background px-3 py-2 text-xs text-muted-foreground flex items-center">
                    Validade: calculada a partir da assinatura (+{config.diasValidadeEpi} dias)
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)} className="text-destructive shrink-0">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {itens.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum item adicionado.</p>
            )}
          </CardContent>
        </Card>

        {/* Observations */}
        <Card>
          <CardHeader><CardTitle className="text-base">Observações</CardTitle></CardHeader>
          <CardContent>
            <Textarea
              value={form.observacoes}
              onChange={e => updateField('observacoes', e.target.value)}
              placeholder="Observações adicionais..."
              rows={3}
            />
          </CardContent>
        </Card>

        {/* Signatures */}
        <Card id="assinaturas-card">
          <CardHeader>
            <CardTitle className="text-base">Assinaturas (apenas para finalização no Desktop)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <SignaturePad label="Assinatura do Funcionário" onSave={setAssinaturaColaborador} />
            <SelfieAssinatura value={selfie} habilitado={!!assinaturaColaborador}
              onChange={foto => { setSelfie(foto); setSelfieEm(new Date().toISOString()); }} />
            <SignaturePad label="Assinatura do Responsável pela Entrega" onSave={setAssinaturaResponsavel} initialValue={assinaturaResponsavel} />
            {assinaturaResponsavel && config.assinaturaEmpresa === assinaturaResponsavel && (
              <p className="text-xs text-muted-foreground -mt-3">✓ Usando assinatura padrão da empresa (configurações)</p>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button variant="outline" className="flex-1" onClick={() => handleSave(false)}>
            <Save className="h-4 w-4 mr-2" /> Salvar como Pendente
          </Button>
          <Button className="flex-1" onClick={handleFinalize} data-guia="btn-nova-ficha-finalizar">
            <ShieldCheck className="h-4 w-4 mr-2" /> Finalizar Ficha
          </Button>
        </div>

        <Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Como deseja coletar a assinatura?</DialogTitle>
              <DialogDescription>
                Escolha o tipo de assinatura para esta ficha.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-3">
              <button
                onClick={finalizarTablet}
                className="group flex flex-col items-center gap-2 p-4 rounded-lg border bg-card hover:border-primary hover:bg-primary/5 transition-colors text-center"
              >
                <Tablet className="h-8 w-8 text-primary" />
                <span className="font-semibold text-sm">Tablet</span>
                <span className="text-[11px] text-muted-foreground">Aparece em "Assinar (Tablet)" no dispositivo logado</span>
              </button>
              <button
                onClick={finalizarDesktop}
                className="group flex flex-col items-center gap-2 p-4 rounded-lg border bg-card hover:border-primary hover:bg-primary/5 transition-colors text-center"
              >
                <Monitor className="h-8 w-8 text-primary" />
                <span className="font-semibold text-sm">Desktop</span>
                <span className="text-[11px] text-muted-foreground">Assinar agora neste computador</span>
              </button>
              <button
                onClick={finalizarWhatsApp}
                className="group flex flex-col items-center gap-2 p-4 rounded-lg border bg-card hover:border-whatsapp hover:bg-whatsapp/5 transition-colors text-center"
              >
                <MessageCircle className="h-8 w-8 text-whatsapp" />
                <span className="font-semibold text-sm">Link via WhatsApp</span>
                <span className="text-[11px] text-muted-foreground">Envia o link para o telefone cadastrado</span>
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
