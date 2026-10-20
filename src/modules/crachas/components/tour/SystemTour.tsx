import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight, Play, Pause, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate, useLocation } from 'react-router-dom';

interface TourStep {
  route: string;
  title: string;
  description: string;
  category: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    route: '/auth',
    category: 'Acesso',
    title: 'Tela de Login',
    description: 'Ponto de entrada do sistema. Colaboradores e administradores fazem login com e-mail e senha. Apenas usuários autorizados acessam o sistema.',
  },
  {
    route: '/crachas',
    category: 'Visão Geral',
    title: 'Dashboard — Visão Geral',
    description: 'Painel principal com indicadores em tempo real: total de colaboradores, crachás emitidos, pendências e vencimentos próximos. Os colaboradores vêm da lista da Senior, atualizada automaticamente.',
  },
  {
    route: '/crachas',
    category: 'Indicadores',
    title: 'Card: Total de Colaboradores',
    description: 'Exibe o número total de colaboradores ativos (Senior + cadastros manuais). Inclui subtítulo com quantos possuem foto cadastrada.',
  },
  {
    route: '/crachas',
    category: 'Indicadores',
    title: 'Card: Pendentes',
    description: 'Mostra colaboradores com dados incompletos — sem foto, sem cargo ou sem data de validade. Cada pendência é detalhada no relatório abaixo.',
  },
  {
    route: '/crachas',
    category: 'Indicadores',
    title: 'Card: Vencimento Próximo',
    description: 'Indica crachás cuja validade expira nos próximos 30 dias. Permite ação rápida para renovação antes do vencimento.',
  },
  {
    route: '/crachas',
    category: 'Relatórios',
    title: 'Relatório de Pendentes',
    description: 'Lista categorizada de pendências: sem foto, sem cargo e sem validade. Clique em qualquer item para ir à lista de colaboradores e resolver.',
  },
  {
    route: '/crachas',
    category: 'Relatórios',
    title: 'Relatório de Vencimentos',
    description: 'Exibe crachás vencidos e os que vencem em 7, 15 e 30 dias. Facilita o planejamento de renovações em lote.',
  },
  {
    route: '/crachas/colaboradores',
    category: 'Integração',
    title: 'Colaboradores da Senior',
    description: 'A lista de colaboradores espelha a Senior: admissões, mudanças de cargo e desligamentos chegam sozinhos a cada atualização (agendada ou pelo botão "Atualizar da Senior"). Foto e dados do crachá ficam guardados aqui.',
  },
  {
    route: '/crachas/colaboradores',
    category: 'Cadastros',
    title: 'Lista de Colaboradores',
    description: 'Visualize todos os colaboradores importados com filtros por nome, empresa e status. Identifique rapidamente quem está com dados pendentes ou crachá vencido.',
  },
  {
    route: '/crachas/modelos',
    category: 'Templates',
    title: 'Modelos de Crachá',
    description: 'Crie e edite templates de crachá com editor visual. Defina campos dinâmicos como nome, foto, cargo e QR code que serão preenchidos automaticamente na geração.',
  },
  {
    route: '/crachas/gerar',
    category: 'Geração',
    title: 'Gerar Crachás',
    description: 'Selecione colaboradores e um template para gerar crachás em lote. Visualize o resultado antes de exportar. Ideal para produção em escala.',
  },
  {
    route: '/crachas/gerar',
    category: 'Geração',
    title: 'Visualização e Impressão',
    description: 'Após gerar, visualize cada crachá individualmente. Exporte em PDF para impressão profissional. O layout segue o padrão do template selecionado.',
  },
  {
    route: '/crachas/historico',
    category: 'Auditoria',
    title: 'Histórico de Ações',
    description: 'Consulte todas as gerações realizadas: data, template usado, quantidade e status. Permite rastrear e auditar cada operação do sistema.',
  },
  {
    route: '/crachas/configuracoes',
    category: 'Sistema',
    title: 'Configurações',
    description: 'Ajuste preferências do sistema como dados da empresa, parâmetros de validação e configurações de segurança.',
  },
  {
    route: '/usuarios',
    category: 'Administração',
    title: 'Gerenciamento de Usuários',
    description: 'Área exclusiva para administradores. Cadastre novos operadores, defina perfis de acesso (admin ou operador) e gerencie a equipe que utiliza o sistema.',
  },
];

interface SystemTourProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SystemTour({ isOpen, onClose }: SystemTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const step = TOUR_STEPS[currentStep];
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  const goToStep = useCallback((index: number) => {
    setCurrentStep(index);
    const target = TOUR_STEPS[index];
    if (target.route !== location.pathname && target.route !== '/auth') {
      navigate(target.route);
    }
  }, [navigate, location.pathname]);

  const next = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      goToStep(currentStep + 1);
    } else {
      setIsPlaying(false);
    }
  }, [currentStep, goToStep]);

  const prev = useCallback(() => {
    if (currentStep > 0) goToStep(currentStep - 1);
  }, [currentStep, goToStep]);

  const restart = useCallback(() => {
    goToStep(0);
    setIsPlaying(false);
  }, [goToStep]);

  // Auto-play
  useEffect(() => {
    if (!isPlaying || !isOpen) return;
    const timer = setTimeout(next, 6000);
    return () => clearTimeout(timer);
  }, [isPlaying, currentStep, isOpen, next]);

  // Navigate to step route on open
  useEffect(() => {
    if (isOpen && step.route !== '/auth' && step.route !== location.pathname) {
      navigate(step.route);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto" onClick={onClose} />

      {/* Tour Panel - bottom center */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl pointer-events-auto animate-slide-up">
        <div className="mx-4 rounded-2xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden">
          {/* Progress bar */}
          <div className="h-1 bg-muted">
            <div
              className="h-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center h-8 min-w-[2rem] rounded-lg bg-primary/10 text-primary text-xs font-bold px-2">
                  {currentStep + 1}/{TOUR_STEPS.length}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full">
                  {step.category}
                </span>
              </div>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-xl" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Content */}
            <h2 className="text-xl font-bold text-foreground mb-2 font-display">{step.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>

            {/* Controls */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/40">
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-xl" onClick={restart} title="Reiniciar">
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 rounded-xl"
                  onClick={() => setIsPlaying(!isPlaying)}
                  title={isPlaying ? 'Pausar' : 'Reproduzir'}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
              </div>

              {/* Step dots */}
              <div className="flex items-center gap-1">
                {TOUR_STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goToStep(i)}
                    className={cn(
                      'h-1.5 rounded-full transition-all duration-300',
                      i === currentStep ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/20 hover:bg-muted-foreground/40'
                    )}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-9 rounded-xl gap-1.5" onClick={prev} disabled={currentStep === 0}>
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <Button size="sm" className="h-9 rounded-xl gap-1.5" onClick={next} disabled={currentStep === TOUR_STEPS.length - 1}>
                  Próximo
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
