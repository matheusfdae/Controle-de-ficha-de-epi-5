import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Trash2, UserPlus, Save, FileSignature, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Funcao, listFuncoes } from '@/services/estoqueService';

interface Colab {
  id: string;
  nome: string;
  matricula: string | null;
  posto: string | null;
  funcao_id: string | null;
  funcao_nome: string | null;
  data_admissao: string | null;
  status: string;
  profile_id: string | null;
}

export default function Integracao() {
  const navigate = useNavigate();
  const [colabs, setColabs] = useState<Colab[]>([]);
  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [open, setOpen] = useState(false);
  const [integrating, setIntegrating] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: '', matricula: '', posto: '', funcao_id: '', data_admissao: '',
  });

  // Modal de integração (preenchimento de tamanhos)
  const [intModalColab, setIntModalColab] = useState<Colab | null>(null);
  const [intItens, setIntItens] = useState<Array<{ epi_id: string; nome: string; ca: string; quantidade: number; tamanho: string; incluir: boolean | null }>>([]);
  const [intUniformes, setIntUniformes] = useState<Array<{ descricao: string; tamanho: string; quantidade: number; incluir: boolean | null }>>([
    { descricao: 'Camisa', tamanho: '', quantidade: 2, incluir: null },
    { descricao: 'Calça', tamanho: '', quantidade: 2, incluir: null },
    { descricao: 'Calçado de segurança', tamanho: '', quantidade: 1, incluir: null },
  ]);

  const load = async () => {
    const { data, error } = await supabase
      .from('colaboradores_integracao').select('*')
      .order('created_at', { ascending: false });
    if (error) return toast.error(error.message);
    setColabs((data || []) as Colab[]);
  };

  useEffect(() => {
    load();
    listFuncoes().then(setFuncoes);
  }, []);

  const handleSave = async () => {
    if (!form.nome.trim()) return toast.error('Informe o nome');
    const f = funcoes.find(x => x.id === form.funcao_id);
    const { error } = await supabase.from('colaboradores_integracao').insert({
      nome: form.nome,
      matricula: form.matricula || null,
      posto: form.posto || null,
      funcao_id: form.funcao_id || null,
      funcao_nome: f?.nome || null,
      data_admissao: form.data_admissao || null,
    });
    if (error) return toast.error(error.message);
    toast.success('Colaborador cadastrado');
    setOpen(false);
    setForm({ nome: '', matricula: '', posto: '', funcao_id: '', data_admissao: '' });
    load();
  };

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('colaboradores_integracao')
      .update({ status }).eq('id', id);
    if (error) return toast.error(error.message);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir este colaborador?')) return;
    await supabase.from('colaboradores_integracao').delete().eq('id', id);
    load();
  };

  const integrar = async (c: Colab) => {
    if (!c.funcao_id) {
      toast.error('Defina a função antes de integrar.');
      return;
    }
    // Carrega itens da função para o modal
    const { data: funcaoEpis } = await supabase
      .from('funcao_epis').select('*, epis(nome, ca_numero)')
      .eq('funcao_id', c.funcao_id);

    const itens = (funcaoEpis || []).map((fe: any) => ({
      epi_id: fe.epi_id,
      nome: fe.epis?.nome || '',
      ca: fe.epis?.ca_numero || '',
      quantidade: fe.quantidade || 1,
      tamanho: fe.tamanho || '',
      incluir: null as boolean | null,
    }));
    setIntItens(itens);
    setIntUniformes([
      { descricao: 'Camisa', tamanho: '', quantidade: 2, incluir: null },
      { descricao: 'Calça', tamanho: '', quantidade: 2, incluir: null },
      { descricao: 'Calçado de segurança', tamanho: '', quantidade: 1, incluir: null },
    ]);
    setIntModalColab(c);
  };

  const confirmarIntegracao = async () => {
    if (!intModalColab) return;
    const c = intModalColab;
    setIntegrating(c.id);
    try {
      let profileId = c.profile_id;

      // 1) Cria/recupera o profile
      if (!profileId) {
        const newId = crypto.randomUUID();
        const { error: pErr } = await supabase.from('profiles').insert({
          id: newId,
          nome_completo: c.nome,
          matricula: c.matricula,
          cargo: c.funcao_nome,
          setor: c.posto,
          data_admissao: c.data_admissao,
        });
        if (pErr) throw pErr;
        profileId = newId;
      }

      // 2) Cria Ficha de EPI
      const { data: fichaEpi, error: feErr } = await supabase
        .from('fichas_epi').insert({
          colaborador_id: profileId,
          nome_funcionario: c.nome,
          funcao: c.funcao_nome,
          funcao_id: c.funcao_id,
          matricula_snapshot: c.matricula,
          setor_snapshot: c.posto,
          motivo: 'admissao',
          status: 'pendente_assinatura',
        }).select().single();
      if (feErr) throw feErr;

      const incluirEpi = intItens.filter(it => it.incluir !== false);
      if (incluirEpi.length > 0) {
        const itensPayload = incluirEpi.map(it => ({
          ficha_id: fichaEpi.id,
          epi_id: it.epi_id,
          descricao: it.nome,
          ca: it.ca,
          quantidade: it.quantidade || 1,
          tamanho: it.tamanho || null,
          motivo_entrega: 'admissao' as const,
          estado: 'novo' as const,
        }));
        await supabase.from('fichas_epi_itens').insert(itensPayload);
      }

      // 3) Cria Ficha de Uniforme com itens
      const { data: fichaUni, error: fuErr } = await supabase
        .from('fichas_uniforme').insert({
          colaborador_id: profileId,
          status: 'pendente_assinatura',
        }).select().single();
      if (fuErr) throw fuErr;

      const uniItens = intUniformes.filter(u => u.descricao.trim() && u.incluir !== false);
      if (uniItens.length > 0) {
        await supabase.from('fichas_uniforme_itens').insert(
          uniItens.map(u => ({
            ficha_id: fichaUni.id,
            descricao: u.descricao,
            tamanho: u.tamanho || null,
            quantidade: u.quantidade || 1,
            motivo_entrega: 'admissao' as const,
            estado: 'novo' as const,
          })),
        );
      }

      // 4) Atualiza integração mantendo pendente até assinaturas
      await supabase.from('colaboradores_integracao').update({
        profile_id: profileId,
      }).eq('id', c.id);

      toast.success('Fichas geradas! Status ficará pendente até as assinaturas.');
      setIntModalColab(null);
      load();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao integrar');
    } finally {
      setIntegrating(null);
    }
  };

  const statusTone = (s: string) =>
    s === 'integrado' ? 'default' : s === 'cancelado' ? 'destructive' : 'secondary';

  return (
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">RH • Onboarding</p>
            <h1 className="text-3xl font-bold tracking-tight">Integração</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cadastre os novos colaboradores que serão contratados.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><UserPlus className="h-4 w-4 mr-1" /> Novo colaborador</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo Colaborador (Integração)</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nome *</Label>
                  <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Nome completo" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Matrícula</Label>
                    <Input value={form.matricula} onChange={e => setForm({ ...form, matricula: e.target.value })} />
                  </div>
                  <div><Label>Posto</Label>
                    <Input value={form.posto} onChange={e => setForm({ ...form, posto: e.target.value })} placeholder="Ex.: Parkshopping" />
                  </div>
                </div>
                <div><Label>Função</Label>
                  <Select value={form.funcao_id} onValueChange={v => setForm({ ...form, funcao_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {funcoes.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Data prevista de admissão</Label>
                  <Input type="date" value={form.data_admissao} onChange={e => setForm({ ...form, data_admissao: e.target.value })} />
                </div>
              </div>
              <DialogFooter><Button onClick={handleSave}><Save className="h-4 w-4 mr-1" /> Salvar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-3">
          {colabs.map(c => (
            <Card key={c.id}>
              <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <p className="font-bold">{c.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {[c.matricula && `Matrícula: ${c.matricula}`, c.posto && `Posto: ${c.posto}`, c.funcao_nome && `Função: ${c.funcao_nome}`].filter(Boolean).join(' • ')}
                  </p>
                  {c.data_admissao && <p className="text-xs text-muted-foreground">Admissão: {new Date(c.data_admissao).toLocaleDateString('pt-BR')}</p>}
                  {c.profile_id && c.status === 'pendente' && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <FileSignature className="h-3 w-3" /> Fichas geradas — aguardando assinaturas
                    </p>
                  )}
                </div>
                <Badge variant={statusTone(c.status) as any}>{c.status}</Badge>
                {!c.profile_id && c.status === 'pendente' && (
                  <Button size="sm" onClick={() => integrar(c)} disabled={integrating === c.id}>
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    {integrating === c.id ? 'Integrando...' : 'Integrar'}
                  </Button>
                )}
                {c.profile_id && (
                  <Button size="sm" variant="outline" onClick={() => navigate('/fichas')}>
                    Ver fichas
                  </Button>
                )}
                <Select value={c.status} onValueChange={(v) => setStatus(c.id, v)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="integrado">Integrado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove(c.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
          {colabs.length === 0 && (
            <p className="text-center text-muted-foreground py-12">
              <UserPlus className="h-10 w-10 mx-auto mb-2 opacity-40" /> Nenhum colaborador na integração ainda.
            </p>
          )}
        </div>
      </div>

      {/* Modal de Integração: preenchimento de tamanhos */}
      <Dialog open={!!intModalColab} onOpenChange={(v) => !v && setIntModalColab(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Integrar — {intModalColab?.nome}</DialogTitle>
            <DialogDescription>
              Preencha os tamanhos/numerações. As fichas de EPI e Uniforme serão geradas com esses dados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* EPIs da função */}
            <section>
              <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide">EPIs ({intItens.length})</h3>
              {intItens.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum EPI vinculado a esta função.</p>
              )}
              <div className="space-y-2">
                {intItens.map((it, idx) => (
                  <div key={idx} className={`grid grid-cols-12 gap-2 items-end border rounded p-2 ${it.incluir === false ? 'opacity-50 bg-muted/40' : ''}`}>
                    <div className="col-span-4">
                      <Label className="text-xs">Item</Label>
                      <p className="text-sm font-medium truncate">{it.nome}</p>
                      {it.ca && <p className="text-xs text-muted-foreground">CA {it.ca}</p>}
                    </div>
                    <div className="col-span-3">
                      <Label className="text-xs">Incluir?</Label>
                      <div className="flex gap-1">
                        <Button type="button" size="sm" variant={it.incluir === true ? 'default' : 'outline'}
                          onClick={() => setIntItens(prev => prev.map((x, i) => i === idx ? { ...x, incluir: true } : x))}>Sim</Button>
                        <Button type="button" size="sm" variant={it.incluir === false ? 'default' : 'outline'}
                          onClick={() => setIntItens(prev => prev.map((x, i) => i === idx ? { ...x, incluir: false } : x))}>Não</Button>
                      </div>
                    </div>
                    <div className="col-span-3">
                      <Label className="text-xs">Tamanho/Nº</Label>
                      <Input
                        value={it.tamanho}
                        placeholder="Ex: M, 42"
                        disabled={it.incluir === false}
                        onChange={e => {
                          const v = e.target.value;
                          setIntItens(prev => prev.map((x, i) => i === idx ? { ...x, tamanho: v } : x));
                        }}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Qtd</Label>
                      <Input
                        type="number" min={1}
                        value={it.quantidade}
                        disabled={it.incluir === false}
                        onChange={e => {
                          const v = parseInt(e.target.value) || 1;
                          setIntItens(prev => prev.map((x, i) => i === idx ? { ...x, quantidade: v } : x));
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Uniformes */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm uppercase tracking-wide">Uniformes</h3>
                <Button size="sm" variant="outline" onClick={() => setIntUniformes(p => [...p, { descricao: '', tamanho: '', quantidade: 1, incluir: null }])}>
                  <Plus className="h-3 w-3 mr-1" /> Adicionar
                </Button>
              </div>
              <div className="space-y-2">
                {intUniformes.map((u, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end border rounded p-2">
                    <div className="col-span-5">
                      <Label className="text-xs">Peça</Label>
                      <Input
                        value={u.descricao}
                        placeholder="Camisa, Calça, Calçado..."
                        onChange={e => {
                          const v = e.target.value;
                          setIntUniformes(prev => prev.map((x, i) => i === idx ? { ...x, descricao: v } : x));
                        }}
                      />
                    </div>
                    <div className="col-span-3">
                      <Label className="text-xs">Tamanho/Nº</Label>
                      <Input
                        value={u.tamanho}
                        placeholder="P, M, G, 40..."
                        onChange={e => {
                          const v = e.target.value;
                          setIntUniformes(prev => prev.map((x, i) => i === idx ? { ...x, tamanho: v } : x));
                        }}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Qtd</Label>
                      <Input
                        type="number" min={1}
                        value={u.quantidade}
                        onChange={e => {
                          const v = parseInt(e.target.value) || 1;
                          setIntUniformes(prev => prev.map((x, i) => i === idx ? { ...x, quantidade: v } : x));
                        }}
                      />
                    </div>
                    <div className="col-span-2">
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setIntUniformes(prev => prev.filter((_, i) => i !== idx))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIntModalColab(null)}>Cancelar</Button>
            <Button onClick={confirmarIntegracao} disabled={!!integrating}>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              {integrating ? 'Gerando...' : 'Gerar Fichas'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
