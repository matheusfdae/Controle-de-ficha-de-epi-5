import { useState } from 'react';
import { Employee } from '@/modules/crachas/types/badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, MoreVertical, Eye, Edit, FileDown, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmployeeTableProps {
  employees: Employee[];
  onViewBadge: (employee: Employee) => void;
  onEditEmployee: (employee: Employee) => void;
}

const statusConfig = {
  ativo: { label: 'Ativo', className: 'bg-success/10 text-success border-success/20' },
  emitido: { label: 'Emitido', className: 'bg-primary/10 text-primary border-primary/20' },
  reemitido: { label: 'Reemitido', className: 'bg-warning/10 text-warning border-warning/20' },
  cancelado: { label: 'Cancelado', className: 'bg-destructive/10 text-destructive border-destructive/20' },
};

export function EmployeeTable({ employees, onViewBadge, onEditEmployee }: EmployeeTableProps) {
  const [search, setSearch] = useState('');

  const filteredEmployees = employees.filter((emp) =>
    emp.nomeCompleto.toLowerCase().includes(search.toLowerCase()) ||
    emp.matricula.toLowerCase().includes(search.toLowerCase()) ||
    emp.cargo.toLowerCase().includes(search.toLowerCase()) ||
    emp.unidade.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, matrícula, cargo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden shadow-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[60px]">Foto</TableHead>
              <TableHead>Colaborador</TableHead>
              <TableHead>Matrícula</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEmployees.map((employee) => (
              <TableRow key={employee.id} className="table-row-hover">
                <TableCell>
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-muted">
                    {employee.fotoUrl ? (
                      <img
                        src={employee.fotoUrl}
                        alt={employee.nomeCompleto}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground font-medium">
                        {employee.nomeCompleto.charAt(0)}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium text-foreground">{employee.nomeCompleto}</p>
                    <p className="text-xs text-muted-foreground">{employee.empresa}</p>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-sm">{employee.matricula}</TableCell>
                <TableCell>{employee.cargo}</TableCell>
                <TableCell className="text-sm">{employee.unidade}</TableCell>
                <TableCell className="text-sm">
                  {new Date(employee.dataValidade).toLocaleDateString('pt-BR')}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn(statusConfig[employee.status].className)}>
                    {statusConfig[employee.status].label}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onViewBadge(employee)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Visualizar Crachá
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEditEmployee(employee)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <FileDown className="h-4 w-4 mr-2" />
                        Baixar PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Printer className="h-4 w-4 mr-2" />
                        Imprimir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Results count */}
      <p className="text-sm text-muted-foreground">
        Mostrando {filteredEmployees.length} de {employees.length} colaboradores
      </p>
    </div>
  );
}
