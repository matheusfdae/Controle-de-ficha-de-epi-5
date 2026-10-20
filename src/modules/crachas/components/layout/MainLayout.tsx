import type { ReactNode } from 'react';

/** O menu e o cabeçalho vêm do layout do EPI; aqui só o espaçamento das telas de crachás. */
export function MainLayout({ children }: { children: ReactNode }) {
  return <div className="p-4 lg:p-8 pb-20"><div className="max-w-7xl mx-auto space-y-6">{children}</div></div>;
}

export default MainLayout;
