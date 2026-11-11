import { describe, expect, it } from 'vitest';
import { TELAS, ligarModuloDaTela, linhasDasTelas, telaDaRota, telaVisivel, telasDasLinhas } from '@/lib/telas';
import { emptyPermissions, rowsToPermissions } from '@/lib/permissions';

describe('telas do menu por usuário', () => {
  it('tela sem marcação aparece (quem já usa continua vendo)', () => {
    expect(telaVisivel({}, 'menu-pedidos-gasto')).toBe(true);
    expect(telaVisivel({ 'menu-pedidos-gasto': false }, 'menu-pedidos-gasto')).toBe(false);
  });

  it('grava e lê as linhas "tela:" sem misturar com os módulos', () => {
    const linhas = linhasDasTelas({ 'menu-postos': false });
    expect(linhas).toHaveLength(TELAS.length);
    expect(linhas.find(l => l.module === 'tela:menu-postos')?.can_view).toBe(false);
    expect(linhas.find(l => l.module === 'tela:menu-estoque')?.can_view).toBe(true);
    const lidas = telasDasLinhas([...linhas, { module: 'estoque', can_view: true }]);
    expect(lidas['menu-postos']).toBe(false);
    expect(lidas.estoque).toBeUndefined();
    const perms = rowsToPermissions([{ module: 'tela:menu-postos' as never, can_view: true }, { module: 'estoque', can_view: true }]);
    expect(perms.estoque.view).toBe(true);
    expect(Object.keys(perms).some(k => k.startsWith('tela:'))).toBe(false);
  });

  it('tela da rota aberta (a mais específica)', () => {
    expect(telaDaRota('/')?.id).toBe('menu-dashboard');
    expect(telaDaRota('/pedidos/gasto-mensal')?.id).toBe('menu-pedidos-gasto');
    expect(telaDaRota('/pedidos/posto/123')?.id).toBe('menu-pedidos');
    expect(telaDaRota('/estoque/entrada')?.id).toBe('menu-estoque');
    expect(telaDaRota('/usuarios')).toBeUndefined();
  });

  it('marcar a tela liga o que o módulo precisa', () => {
    const gerar = TELAS.find(t => t.id === 'menu-crachas-gerar')!;
    const p = ligarModuloDaTela(emptyPermissions(), gerar);
    expect(p.crachas).toEqual({ view: true, create: true });
  });

  it('ids únicos', () => {
    expect(new Set(TELAS.map(t => t.id)).size).toBe(TELAS.length);
  });
});
