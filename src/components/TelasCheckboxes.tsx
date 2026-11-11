import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { MODULES, type PermissionMap } from '@/lib/permissions';
import { GRUPOS_TELAS, TELAS, ligarModuloDaTela, telaVisivel, type TelasMap } from '@/lib/telas';

/**
 * Usuários → Telas: uma caixa por tela do menu. Marcou, aparece; desmarcou, some
 * (e não abre nem digitando o endereço). Marcar uma tela liga junto o que o
 * módulo dela precisa na aba de ações (ver, e criar/editar quando a tela exige).
 */
const ROTULO_ACAO = { view: 'ver', create: 'criar', edit: 'editar', delete: 'excluir' } as const;

export function TelasCheckboxes({ telas, permissions, onChange }: {
  telas: TelasMap;
  permissions: PermissionMap;
  onChange: (telas: TelasMap, permissions: PermissionMap) => void;
}) {
  const marcar = (ids: string[], valor: boolean) => {
    const novas = { ...telas };
    let perms = permissions;
    for (const id of ids) {
      novas[id] = valor;
      const t = TELAS.find(x => x.id === id);
      if (valor && t) perms = ligarModuloDaTela(perms, t);
    }
    onChange(novas, perms);
  };
  // Marcada, mas o módulo (aba de ações) não deixa: avisa que não vai aparecer.
  const bloqueio = (id: string) => {
    const t = TELAS.find(x => x.id === id)!;
    if (!t.modulo || !telaVisivel(telas, id)) return null;
    const acao = t.acao ?? 'view';
    if (permissions[t.modulo]?.[acao]) return null;
    return `sem "${ROTULO_ACAO[acao]}" em ${MODULES.find(m => m.id === t.modulo)?.label ?? t.modulo}`;
  };
  const total = TELAS.filter(t => telaVisivel(telas, t.id)).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground mr-auto">{total} de {TELAS.length} telas marcadas. Marcou, aparece no menu; desmarcou, some.</span>
        <Button type="button" variant="outline" size="sm" onClick={() => marcar(TELAS.map(t => t.id), true)}>Marcar todas</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => marcar(TELAS.map(t => t.id), false)}>Desmarcar todas</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {GRUPOS_TELAS.map(g => {
          const doGrupo = TELAS.filter(t => t.grupo === g);
          const todas = doGrupo.every(t => telaVisivel(telas, t.id));
          const algumas = !todas && doGrupo.some(t => telaVisivel(telas, t.id));
          return (
            <div key={g} className="rounded-lg border p-3 space-y-1.5">
              <label className="flex items-center gap-2 font-semibold text-sm cursor-pointer">
                <Checkbox checked={todas ? true : algumas ? 'indeterminate' : false}
                  onCheckedChange={() => marcar(doGrupo.map(t => t.id), !todas)} aria-label={`Todas as telas de ${g}`} />
                {g}
              </label>
              {doGrupo.map(t => {
                const aviso = bloqueio(t.id);
                return (
                  <label key={t.id} className="flex items-start gap-2 pl-6 text-sm cursor-pointer">
                    <Checkbox className="mt-0.5" checked={telaVisivel(telas, t.id)} onCheckedChange={v => marcar([t.id], !!v)} />
                    <span>
                      {t.label}
                      {aviso && <span className="block text-[11px] text-amber-600">não aparece: {aviso} (aba Ações)</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
