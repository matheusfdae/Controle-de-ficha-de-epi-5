import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { listEpis, EPI } from '@/services/estoqueService';
import { createTermoColetivo, TermoColetivoItem } from '@/services/termoColetivoService';
import BackButton from '@/components/BackButton';
import PageHeader from '@/components/PageHeader';

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

  useEffect(() => { listEpis('epi').then(setEpis).catch(() => {}); }, []);

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
    <div className="p-4 lg:p-8 pb-20">
      <div className="max-w-7xl mx-auto space-y-6">
        <BackButton />
        <PageHeader
          title="Novo Termo Coletivo de EPI"
          actions={<Button onClick={submit} disabled={saving}><Save className="h-4 w-4 mr-1" />Salvar</Button>}
        />

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Cabeçalho</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-4 gap-3">
            <div><Label htmlFor="tc-posto">POSTO</Label><Input id="tc-posto" value={posto} onChange={e => setPosto(e.target.value)} /></div>
            <div><Label htmlFor="tc-mes">MÊS de referência</Label><Input id="tc-mes" value={mesRef} onChange={e => setMesRef(e.target.value)} placeholder="MM/AAAA" /></div>
            <div><Label htmlFor="tc-lider">LÍDER</Label><Input id="tc-lider" value={lider} onChange={e => setLider(e.target.value)} /></div>
            <div><Label htmlFor="tc-empresa">Empresa</Label><Input id="tc-empresa" value={empresa} onChange={e => setEmpresa(e.target.value)} /></div>
            <div className="md:col-span-4"><Label htmlFor="tc-obs">Observações</Label><Textarea id="tc-obs" value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} /></div>
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
    </div>
  );
}
