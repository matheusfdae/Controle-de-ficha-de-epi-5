import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { listEpis, EPI } from '@/services/estoqueService';
import { createTermoColetivo, TermoColetivoItem } from '@/services/termoColetivoService';

type Linha = Omit<TermoColetivoItem, 'termo_id' | 'id' | 'ordem'>;

const mesAtual = () => {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const linhaVazia = (): Linha => ({
  colaborador_nome: '',
  colaborador_cpf: '',
  epi_id: null,
  material: '',
  ca: '',
  tamanho: '',
  quantidade: 1,
});

export default function TermoColetivoNovo() {
  const navigate = useNavigate();
  const [posto, setPosto] = useState('');
  const [mesRef, setMesRef] = useState(mesAtual());
  const [lider, setLider] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([linhaVazia()]);
  const [epis, setEpis] = useState<EPI[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { listEpis().then(setEpis).catch(() => {}); }, []);

  const updateLinha = (i: number, patch: Partial<Linha>) => {
    setLinhas(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const onSelectEpi = (i: number, epiId: string) => {
    const epi = epis.find(e => e.id === epiId);
    updateLinha(i, {
      epi_id: epi?.id ?? null,
      material: epi?.nome ?? '',
      ca: (epi as any)?.ca_numero ?? '',
    });
  };

  const addLinha = () => setLinhas(prev => [...prev, linhaVazia()]);
  const removeLinha = (i: number) => setLinhas(prev => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!posto.trim() || !mesRef.trim()) return toast.error('Informe POSTO e MÊS de referência');
    const validas = linhas.filter(l => l.colaborador_nome.trim() && l.material.trim());
    if (validas.length === 0) return toast.error('Adicione ao menos uma linha com colaborador e material');
    setSaving(true);
    try {
      const id = await createTermoColetivo(
        { posto, mes_referencia: mesRef, lider, empresa, observacoes },
        validas,
      );
      toast.success('Termo coletivo criado');
      navigate(`/termo-coletivo/${id}`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao salvar');
    } finally { setSaving(false); }
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 max-w-7xl">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
        <h1 className="text-xl font-bold">Novo Termo Coletivo de EPI</h1>
        <Button onClick={submit} disabled={saving}><Save className="h-4 w-4 mr-1" />Salvar</Button>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Cabeçalho</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-4 gap-3">
          <div><Label>POSTO</Label><Input value={posto} onChange={e => setPosto(e.target.value)} /></div>
          <div><Label>MÊS de referência</Label><Input value={mesRef} onChange={e => setMesRef(e.target.value)} placeholder="MM/AAAA" /></div>
          <div><Label>LÍDER</Label><Input value={lider} onChange={e => setLider(e.target.value)} /></div>
          <div><Label>Empresa</Label><Input value={empresa} onChange={e => setEmpresa(e.target.value)} /></div>
          <div className="md:col-span-4"><Label>Observações</Label><Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Linhas (1 material por linha)</CardTitle>
          <Button size="sm" variant="outline" onClick={addLinha}><Plus className="h-4 w-4 mr-1" /> Adicionar linha</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {linhas.map((l, i) => (
            <div key={i} className="grid md:grid-cols-12 gap-2 items-end border rounded-md p-2">
              <div className="md:col-span-3"><Label className="text-xs">Colaborador</Label><Input value={l.colaborador_nome} onChange={e => updateLinha(i, { colaborador_nome: e.target.value })} /></div>
              <div className="md:col-span-2"><Label className="text-xs">CPF</Label><Input value={l.colaborador_cpf ?? ''} onChange={e => updateLinha(i, { colaborador_cpf: e.target.value })} /></div>
              <div className="md:col-span-3">
                <Label className="text-xs">EPI / Material</Label>
                <Select value={l.epi_id ?? '__custom'} onValueChange={v => v === '__custom' ? updateLinha(i, { epi_id: null }) : onSelectEpi(i, v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__custom">Personalizado</SelectItem>
                    {epis.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                {!l.epi_id && <Input className="mt-1" placeholder="Descrição livre" value={l.material} onChange={e => updateLinha(i, { material: e.target.value })} />}
              </div>
              <div className="md:col-span-1"><Label className="text-xs">CA</Label><Input value={l.ca ?? ''} onChange={e => updateLinha(i, { ca: e.target.value })} /></div>
              <div className="md:col-span-1"><Label className="text-xs">Tam.</Label><Input value={l.tamanho ?? ''} onChange={e => updateLinha(i, { tamanho: e.target.value })} /></div>
              <div className="md:col-span-1"><Label className="text-xs">Qtd</Label><Input type="number" min={1} value={l.quantidade} onChange={e => updateLinha(i, { quantidade: Number(e.target.value) || 1 })} /></div>
              <div className="md:col-span-1 flex justify-end">
                <Button variant="ghost" size="icon" onClick={() => removeLinha(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
