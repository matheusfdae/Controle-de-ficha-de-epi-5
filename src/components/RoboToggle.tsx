import { Bot, BotOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { desligarRoboComAviso, useRoboAssistente } from '@/hooks/useRoboAssistente';

/** Botão do topo para ligar e desligar o robô assistente. */
export default function RoboToggle() {
  const { ligado, definir } = useRoboAssistente();
  return (
    <Button variant="ghost" size="icon" className="h-9 w-9"
      title={ligado ? 'Desligar o robô assistente' : 'Ligar o robô assistente'}
      aria-label={ligado ? 'Desligar o robô assistente' : 'Ligar o robô assistente'}
      aria-pressed={ligado}
      onClick={() => (ligado ? desligarRoboComAviso(definir) : (definir(true), toast.success('Assistente ligado')))}>
      {ligado ? <Bot className="h-[1.15rem] w-[1.15rem]" /> : <BotOff className="h-[1.15rem] w-[1.15rem] text-muted-foreground" />}
    </Button>
  );
}
