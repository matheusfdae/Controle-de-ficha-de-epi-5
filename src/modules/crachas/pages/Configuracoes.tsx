import { IA_DISPONIVEL } from '@/modules/crachas/lib/recursos';
import { useState, useEffect } from 'react';
import { MainLayout } from '@/modules/crachas/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, Shield, FileText, Save, CalendarIcon, Sparkles } from 'lucide-react';
import { PageHeader } from '@/modules/crachas/components/layout/PageHeader';
import { toast } from 'sonner';
import { ImportConfigAI } from '@/modules/crachas/components/ai/ImportConfigAI';

const Configuracoes = () => {
  
  // Print settings
  const [dpi, setDpi] = useState('300');
  const [badgeWidth, setBadgeWidth] = useState('85');
  const [badgeHeight, setBadgeHeight] = useState('54');
  const [duplexPrint, setDuplexPrint] = useState(false);
  const [cutMarks, setCutMarks] = useState(true);
  const [multiplePerPage, setMultiplePerPage] = useState(true);

  // SLA settings
  const [slaDays, setSlaDays] = useState('5');

  // Expiration settings
  const [defaultValidity, setDefaultValidity] = useState('12');
  const [customValidityMonths, setCustomValidityMonths] = useState('18');
  const [expirationAlertDays, setExpirationAlertDays] = useState('30');
  const [autoRenew, setAutoRenew] = useState(false);
  
  // Load SLA on mount
  useEffect(() => {
    const savedSla = localStorage.getItem('sla_days');
    if (savedSla) setSlaDays(savedSla);
  }, []);

  return (
    <MainLayout>
      <PageHeader
        title="Configurações"
        description="Impressão, notificações e segurança dos crachás"
      />

      <Tabs defaultValue="impressao" className="space-y-6">
        <TabsList className="bg-muted/50">
          {IA_DISPONIVEL && <TabsTrigger value="ia" className="gap-2">
            <Sparkles className="h-4 w-4" />
            IA Importação
          </TabsTrigger>}
          <TabsTrigger value="impressao" className="gap-2">
            <FileText className="h-4 w-4" />
            Impressão
          </TabsTrigger>
          <TabsTrigger value="notificacoes" className="gap-2">
            <Bell className="h-4 w-4" />
            Notificações
          </TabsTrigger>
          <TabsTrigger value="seguranca" className="gap-2">
            <Shield className="h-4 w-4" />
            Segurança
          </TabsTrigger>
        </TabsList>

        {/* IA Importação Tab */}
        <TabsContent value="ia" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Configuração de Importação com IA
              </CardTitle>
              <CardDescription>
                Use o assistente inteligente para definir como os dados da planilha serão mapeados para os campos dos crachás. 
                Descreva em linguagem natural o que deseja configurar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImportConfigAI />
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="impressao" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configurações de Impressão</CardTitle>
              <CardDescription>
                Defina as preferências padrão para geração de PDFs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dpi">Qualidade (DPI)</Label>
                  <Input
                    id="dpi"
                    type="number"
                    value={dpi}
                    onChange={(e) => setDpi(e.target.value)}
                    min={72}
                    max={600}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="badgeWidth">Largura (mm)</Label>
                  <Input
                    id="badgeWidth"
                    type="number"
                    value={badgeWidth}
                    onChange={(e) => setBadgeWidth(e.target.value)}
                    min={30}
                    max={200}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="badgeHeight">Altura (mm)</Label>
                  <Input
                    id="badgeHeight"
                    type="number"
                    value={badgeHeight}
                    onChange={(e) => setBadgeHeight(e.target.value)}
                    min={30}
                    max={200}
                  />
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Impressão Frente e Verso</p>
                  <p className="text-sm text-muted-foreground">
                    Gerar PDF com layout para impressão duplex
                  </p>
                </div>
                <Switch checked={duplexPrint} onCheckedChange={setDuplexPrint} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Marcas de Corte</p>
                  <p className="text-sm text-muted-foreground">
                    Incluir linhas de corte no PDF
                  </p>
                </div>
                <Switch checked={cutMarks} onCheckedChange={setCutMarks} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Múltiplos por Página</p>
                  <p className="text-sm text-muted-foreground">
                    Agrupar vários crachás por folha A4
                  </p>
                </div>
                <Switch checked={multiplePerPage} onCheckedChange={setMultiplePerPage} />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  className="gap-2"
                  onClick={() => {
                    toast.success('Configurações de impressão salvas!');
                  }}
                >
                  <Save className="h-4 w-4" />
                  Salvar Impressão
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Validade dos Crachás */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                Validade dos Crachás
              </CardTitle>
              <CardDescription>
                Configure o período de validade padrão para novos crachás
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Período de Validade Padrão</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={defaultValidity}
                  onChange={(e) => setDefaultValidity(e.target.value)}
                >
                  <option value="3">3 meses</option>
                  <option value="6">6 meses</option>
                  <option value="12">1 ano</option>
                  <option value="24">2 anos</option>
                  <option value="36">3 anos</option>
                  <option value="60">5 anos</option>
                  <option value="custom">Personalizado</option>
                </select>
              </div>

              {defaultValidity === 'custom' && (
                <div className="space-y-2">
                  <Label>Validade personalizada (em meses)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={customValidityMonths}
                    onChange={(e) => setCustomValidityMonths(e.target.value)}
                    placeholder="Ex: 18"
                  />
                </div>
              )}

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Alerta de Vencimento</p>
                  <p className="text-sm text-muted-foreground">
                    Dias antes do vencimento para exibir alerta
                  </p>
                </div>
                <Input
                  type="number"
                  className="w-24"
                  value={expirationAlertDays}
                  onChange={(e) => setExpirationAlertDays(e.target.value)}
                  min={1}
                  max={180}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Renovação Automática</p>
                  <p className="text-sm text-muted-foreground">
                    Sugerir renovação automática ao vencer
                  </p>
                </div>
                <Switch
                  checked={autoRenew}
                  onCheckedChange={setAutoRenew}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  className="gap-2"
                  onClick={() => {
                    toast.success('Configurações de validade salvas!');
                  }}
                >
                  <Save className="h-4 w-4" />
                  Salvar Validade
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* SLA de Solicitação */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                Prazo de Solicitação (SLA)
              </CardTitle>
              <CardDescription>
                Defina o prazo máximo em dias para que uma solicitação de crachá seja considerada dentro do prazo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Prazo máximo (dias úteis)</p>
                  <p className="text-sm text-muted-foreground">
                    Solicitações que ultrapassarem esse prazo serão marcadas como "Fora do Prazo"
                  </p>
                </div>
                <Input
                  type="number"
                  className="w-24"
                  value={slaDays}
                  onChange={(e) => setSlaDays(e.target.value)}
                  min={1}
                  max={90}
                />
              </div>

              <div className="p-4 rounded-xl bg-muted/30 border border-border">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Como funciona:</strong> O sistema calcula a diferença entre a data de criação da solicitação e a data atual. 
                  Se exceder <strong className="text-foreground">{slaDays} dia(s)</strong>, o crachá será exibido como <span className="text-destructive font-semibold">Fora do Prazo</span> no dashboard e relatórios.
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  className="gap-2"
                  onClick={() => {
                    localStorage.setItem('sla_days', slaDays);
                    toast.success('Configurações de SLA salvas!');
                  }}
                >
                  <Save className="h-4 w-4" />
                  Salvar SLA
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="notificacoes" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Preferências de Notificação</CardTitle>
              <CardDescription>
                Configure quando e como deseja receber alertas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Crachás Próximos do Vencimento</p>
                  <p className="text-sm text-muted-foreground">
                    Alertar 30 dias antes do vencimento
                  </p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Novos Colaboradores</p>
                  <p className="text-sm text-muted-foreground">
                    Notificar quando novos registros forem sincronizados
                  </p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Erros de Sincronização</p>
                  <p className="text-sm text-muted-foreground">
                    Alertar quando houver falha na sincronização
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Segurança Tab */}
        <TabsContent value="seguranca" className="space-y-6">

          <Card>
            <CardHeader>
              <CardTitle>Controle de Acesso</CardTitle>
              <CardDescription>
                Gerencie permissões e níveis de acesso
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Autenticação Obrigatória</p>
                  <p className="text-sm text-muted-foreground">Exigir login para acessar o sistema</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Log de Atividades</p>
                  <p className="text-sm text-muted-foreground">Registrar todas as ações dos usuários</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div>
                <p className="font-medium text-foreground mb-3">Perfis de Acesso</p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span>Administrativo</span>
                    <span className="text-muted-foreground">Acesso total</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span>Operacional</span>
                    <span className="text-muted-foreground">Emissão e visualização</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span>Visualização</span>
                    <span className="text-muted-foreground">Apenas consulta</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
};

export default Configuracoes;
