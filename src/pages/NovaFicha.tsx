import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Plus, Trash2, Save, ShieldCheck, Tablet, Monitor, MessageCircle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { EPIFicha, EPIItem, MotivoEntrega, Turno } from '@/types/epi';
import { generateId, saveFicha } from '@/services/fichaService';
import { getConfig, loadConfig } from '@/services/configService';
import SignaturePad from '@/components/SignaturePad';
import { Funcao, EPI, listFuncoes, listEpis, listFuncaoEpis } from '@/services/estoqueService';
import { Empresa, listEmpresas } from '@/services/empresasService';
import { supabase } from '@/integrations/supabase/client';
import BackButton from '@/components/BackButton';

export default function NovaFicha() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tipo = (searchParams.get('tipo') === 'uniforme' ? 'uniforme' : 'epi') as 'epi' | 'uniforme';
  const today = new Date().toISOString().split('T')[0];
  const [config, setConfig] = useState(getConfig());

  const [form, setForm] = useState({
    nomeFuncionario: '',
    funcao: '',
    telefone: '',
    cpf: '',
    matricula: '',
    motivo: 'admissao' as MotivoEntrega,
    turno: 'diurno' as Turno,
    posto: '',
    empresa: config.empresaNome,
    dataEntrega: today,
    observacoes: '',
  });

  const [itens, setItens] = useState<EPIItem[]>([
    { id: generateId(), descricao: 'Gandola em Gabardine Azul', ca: '', quantidade: 2, tamanho: '', dataEntrega: today, postoServico: '', recebido: false },
    { id: generateId(), descricao: 'Calça em Gabardine Azul', ca: '', quantidade: 2, tamanho: '', dataEntrega: today, postoServico: '', recebido: false },
    { id: generateId(), descricao: 'Sapato Antiderrapante Spider Pro', ca: '48583', quantidade: 1, tamanho: '', dataEntrega: today, postoServico: '', recebido: false },
  ]);

  const [assinaturaColaborador, setAssinaturaColaborador] = useState('');
  const [assinaturaResponsavel, setAssinaturaResponsavel] = useState(config.assinaturaEmpresa || '');

  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [epis, setEpis] = useState<EPI[]>([]);
  const [funcaoId, setFuncaoId] = useState<string>('');
  const [empresas, setEmpresas] = useState<Empresa[]>([]);

  useEffect(() => {
    listFuncoes().then(setFuncoes).catch(() => {});
    listEpis(tipo).then(setEpis).catch(() => {});
    setEmpresas(listEmpresas());
  }, [tipo]);

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

  const aplicarFuncao = async (id: string) => {
    setFuncaoId(id);
    const f = funcoes.find(x => x.id === id);
    if (f) updateField('funcao', f.nome);
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
    itens,
    assinaturaColaborador: assinaturaColaborador || undefined,
    assinaturaResponsavel: assinaturaResponsavel || undefined,
    status: asSigned ? 'assinada' : 'pendente',
    criadoEm: new Date().toISOString(),
    assinadoEm: asSigned ? new Date().toISOString() : undefined,
  });

  const validateBasics = () => {
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
    if (!assinaturaColaborador || !assinaturaResponsavel) {
      toast.info('Capture as assinaturas abaixo e clique em "Confirmar Assinatura"');
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
      const link = `${window.location.origin}/assinar/${ficha.id}`;
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

        {/* Employee Data */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados do Funcionário</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="nome">Nome do Funcionário *</Label>
              <Input id="nome" value={form.nomeFuncionario}
                onChange={e => updateField('nomeFuncionario', e.target.value)}
                onBlur={() => autocompletarPorNome(form.nomeFuncionario)}
                placeholder="Nome completo" />
            </div>
            <div>
              <Label htmlFor="funcao">Função</Label>
              {funcoes.length > 0 ? (
                <Select value={funcaoId} onValueChange={aplicarFuncao}>
                  <SelectTrigger><SelectValue placeholder="Selecione a função (auto-preenche EPIs)" /></SelectTrigger>
                  <SelectContent>
                    {funcoes.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input id="funcao" value={form.funcao} onChange={e => updateField('funcao', e.target.value)} placeholder="Ex: ASG, Líder ASG" />
              )}
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
            <div>
              <Label htmlFor="empresa">Empresa</Label>
              <Select value={form.empresa} onValueChange={v => updateField('empresa', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={config.empresaNome}>{config.empresaNome}</SelectItem>
                    {empresas.map(e => <SelectItem key={e.id} value={e.nome}>{e.nome}</SelectItem>)}
                    <SelectItem value="MATRIZ">MATRIZ</SelectItem>
                    <SelectItem value="APOIO">APOIO</SelectItem>
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
          <Button className="flex-1" onClick={handleFinalize}>
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
                className="group flex flex-col items-center gap-2 p-4 rounded-lg border bg-card hover:border-[#25D366] hover:bg-[#25D366]/5 transition-colors text-center"
              >
                <MessageCircle className="h-8 w-8 text-[#25D366]" />
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
