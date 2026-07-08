import { useEffect, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { MODULES, PermissionMap, ActionId, ModuleId, emptyPermissions } from '@/lib/permissions';

interface Props {
  value: PermissionMap;
  onChange: (v: PermissionMap) => void;
  disabled?: boolean;
}

const ACTION_LABEL: Record<ActionId, string> = {
  view: 'Ver', create: 'Criar', edit: 'Editar', delete: 'Excluir',
};

export function PermissionsMatrix({ value, onChange, disabled }: Props) {
  const [state, setState] = useState<PermissionMap>(value || emptyPermissions());

  useEffect(() => { setState(value || emptyPermissions()); }, [value]);

  const toggle = (mod: ModuleId, act: ActionId) => {
    if (disabled) return;
    const current = state[mod]?.[act] ?? false;
    const next: PermissionMap = {
      ...state,
      [mod]: { ...state[mod], [act]: !current },
    };
    // Marcar/desmarcar "Ver" impacta: se desmarcou ver, remove os outros
    if (act === 'view' && current) {
      next[mod] = { view: false };
    }
    // Se marcou create/edit/delete e não tem view, marca view automaticamente
    if (act !== 'view' && !current && !next[mod].view) {
      next[mod] = { ...next[mod], view: true };
    }
    setState(next);
    onChange(next);
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-3 py-2 font-semibold">Módulo</th>
            {(['view','create','edit','delete'] as ActionId[]).map(a => (
              <th key={a} className="px-2 py-2 text-center font-semibold w-20">{ACTION_LABEL[a]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MODULES.map(m => (
            <tr key={m.id} className="border-t">
              <td className="px-3 py-2 font-medium">{m.label}</td>
              {(['view','create','edit','delete'] as ActionId[]).map(a => (
                <td key={a} className="px-2 py-2 text-center">
                  {m.actions.includes(a) ? (
                    <Checkbox
                      checked={!!state[m.id]?.[a]}
                      onCheckedChange={() => toggle(m.id, a)}
                      disabled={disabled}
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
