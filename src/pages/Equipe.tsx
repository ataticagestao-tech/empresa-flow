import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, UserPlus, Trash2, Shield, Eye, Wrench } from 'lucide-react';

import { AppLayout } from '@/components/layout/AppLayout';
import { PageToolbar } from '@/components/layout/PageToolbar';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import { useRole, type Role } from '@/hooks/useRole';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ExportMenu } from '@/components/ExportMenu';

interface MembroEquipe {
  user_companies_id: string;
  user_id: string;
  role: Role;
  is_default: boolean;
  full_name: string | null;
  email: string | null;
}

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Proprietário',
  operador: 'Operador',
  visualizador: 'Visualizador',
};

const ROLE_DESC: Record<Role, string> = {
  owner: 'Acesso total. Excluir, configurar empresa, gerenciar equipe.',
  operador: 'Lança e edita vendas, CR, CP, conciliação. NÃO exclui nem mexe em config.',
  visualizador: 'Apenas visualiza. Não cria, edita ou exclui nada.',
};

const ROLE_ICONS: Record<Role, typeof Shield> = {
  owner: Shield,
  operador: Wrench,
  visualizador: Eye,
};

const ROLE_COLORS: Record<Role, { bg: string; text: string }> = {
  owner: { bg: '#FEE2E2', text: '#B91C1C' },
  operador: { bg: '#DBEAFE', text: '#1E40AF' },
  visualizador: { bg: '#F3F4F6', text: '#374151' },
};

export default function Equipe() {
  const { activeClient, user } = useAuth();
  const { selectedCompany } = useCompany();
  const { isOwner, isLoading: roleLoading } = useRole();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<Role>('operador');

  // Lista membros da equipe (user_companies JOIN profiles)
  const { data: membros = [], isLoading } = useQuery({
    queryKey: ['equipe', selectedCompany?.id],
    queryFn: async (): Promise<MembroEquipe[]> => {
      if (!selectedCompany?.id) return [];
      const { data, error } = await (activeClient as any)
        .from('user_companies')
        .select(`
          id,
          user_id,
          role,
          is_default,
          profiles!user_id ( full_name, email )
        `)
        .eq('company_id', selectedCompany.id)
        .order('role');
      if (error) throw error;
      return (data || []).map((r: any) => ({
        user_companies_id: r.id,
        user_id: r.user_id,
        role: r.role as Role,
        is_default: r.is_default,
        full_name: r.profiles?.full_name ?? null,
        email: r.profiles?.email ?? null,
      }));
    },
    enabled: !!selectedCompany?.id && isOwner,
  });

  // Mudar role
  const changeRole = useMutation({
    mutationFn: async (input: { user_companies_id: string; new_role: Role }) => {
      const { error } = await (activeClient as any)
        .from('user_companies')
        .update({ role: input.new_role })
        .eq('id', input.user_companies_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Permissão atualizada');
      queryClient.invalidateQueries({ queryKey: ['equipe'] });
    },
    onError: (err: any) => toast.error('Erro: ' + (err.message || 'desconhecido')),
  });

  // Remover vínculo
  const removeMember = useMutation({
    mutationFn: async (uc_id: string) => {
      const { error } = await (activeClient as any)
        .from('user_companies')
        .delete()
        .eq('id', uc_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Usuário removido da empresa');
      queryClient.invalidateQueries({ queryKey: ['equipe'] });
    },
    onError: (err: any) => toast.error('Erro ao remover: ' + (err.message || 'desconhecido')),
  });

  // Adicionar usuário
  const addMember = useMutation({
    mutationFn: async (input: { email: string; role: Role }) => {
      if (!selectedCompany?.id) throw new Error('Empresa não selecionada');

      // Busca user pelo email (em profiles)
      const { data: profile } = await (activeClient as any)
        .from('profiles')
        .select('id, full_name, email')
        .ilike('email', input.email.trim())
        .maybeSingle();
      if (!profile) {
        throw new Error('Não encontrei usuário com esse e-mail. Ele precisa criar uma conta primeiro em ataticagestao.com.');
      }

      // Verifica se já está vinculado
      const { data: existing } = await (activeClient as any)
        .from('user_companies')
        .select('id, role')
        .eq('user_id', profile.id)
        .eq('company_id', selectedCompany.id)
        .maybeSingle();
      if (existing) {
        // Atualiza role se já existe
        const { error } = await (activeClient as any)
          .from('user_companies')
          .update({ role: input.role })
          .eq('id', existing.id);
        if (error) throw error;
        return 'updated';
      }

      // Cria vínculo novo
      const { error } = await (activeClient as any)
        .from('user_companies')
        .insert({
          user_id: profile.id,
          company_id: selectedCompany.id,
          role: input.role,
          is_default: false,
        });
      if (error) throw error;
      return 'created';
    },
    onSuccess: (kind) => {
      toast.success(kind === 'updated' ? 'Permissão do usuário atualizada' : 'Usuário adicionado à equipe');
      setShowAdd(false);
      setAddEmail('');
      setAddRole('operador');
      queryClient.invalidateQueries({ queryKey: ['equipe'] });
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao adicionar'),
  });

  if (roleLoading) {
    return (
      <AppLayout title="Equipe">
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#059669]" />
        </div>
      </AppLayout>
    );
  }

  if (!isOwner) {
    return (
      <AppLayout title="Equipe">
        <Card className="p-8 m-4 text-center">
          <Shield size={32} className="mx-auto text-[#E53E3E] mb-3" />
          <h2 className="text-lg font-semibold mb-2">Acesso restrito</h2>
          <p className="text-sm text-[#667085]">
            Somente o proprietário da empresa pode gerenciar a equipe.
          </p>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Equipe">
      <div className="p-5 space-y-4">
        <PageToolbar title={`Equipe — ${selectedCompany?.nome_fantasia ?? ""}`} subtitle="Gerencie quem tem acesso a esta empresa e o que cada um pode fazer.">
          <div className="flex items-center gap-2">
            <ExportMenu
              rows={membros}
              baseName="equipe"
              titulo="EQUIPE"
              size="md"
              columns={[
                { header: "Usuário", value: (m: MembroEquipe) => m.full_name || "(sem nome)", pdfFlex: 20, excelWidth: 28 },
                { header: "Email", value: (m: MembroEquipe) => m.email || "(sem email)", pdfFlex: 22, excelWidth: 32 },
                { header: "Nível", value: (m: MembroEquipe) => ROLE_LABELS[m.role], align: "center", pdfFlex: 12, excelWidth: 18 },
              ]}
            />
            <Button onClick={() => setShowAdd(true)} className="bg-[#059669] hover:bg-[#047857] text-white">
              <UserPlus size={16} className="mr-1.5" />
              Adicionar usuário
            </Button>
          </div>
        </PageToolbar>

        {/* Legenda de roles */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3 text-[#1D2939]">Níveis de acesso</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(['owner', 'operador', 'visualizador'] as Role[]).map((r) => {
              const Icon = ROLE_ICONS[r];
              const colors = ROLE_COLORS[r];
              return (
                <div key={r} className="flex items-start gap-3 p-3 rounded border border-[#EAECF0]">
                  <div
                    className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: colors.bg, color: colors.text }}
                  >
                    <Icon size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: colors.text }}>
                      {ROLE_LABELS[r]}
                    </div>
                    <p className="text-xs text-[#667085] mt-0.5">{ROLE_DESC[r]}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Lista de membros */}
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-[#059669] mx-auto" />
            </div>
          ) : membros.length === 0 ? (
            <EmptyState
              icon={<UserPlus size={32} />}
              title="Nenhum usuário vinculado"
              description="Adicione um usuário para começar."
            />
          ) : (
            <table className="w-full">
              <thead className="bg-[#F9FAFB] border-b border-[#EAECF0]">
                <tr>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
                    Usuário
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
                    Nível
                  </th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {membros.map((m) => {
                  const isYou = m.user_id === user?.id;
                  const Icon = ROLE_ICONS[m.role];
                  const colors = ROLE_COLORS[m.role];
                  return (
                    <tr key={m.user_companies_id} className="border-b border-[#EAECF0] last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#ECFDF4] text-[#059669] flex items-center justify-center font-semibold text-sm">
                            {(m.full_name || m.email || '?').slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-[#1D2939]">
                              {m.full_name || '(sem nome)'} {isYou && <span className="text-xs text-[#667085] ml-1">(você)</span>}
                            </div>
                            <div className="text-xs text-[#667085]">{m.email || '(sem email)'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isYou ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold"
                            style={{ background: colors.bg, color: colors.text }}
                          >
                            <Icon size={12} />
                            {ROLE_LABELS[m.role]}
                          </span>
                        ) : (
                          <Select
                            value={m.role}
                            onValueChange={(v) => changeRole.mutate({ user_companies_id: m.user_companies_id, new_role: v as Role })}
                          >
                            <SelectTrigger className="w-[180px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="owner">Proprietário</SelectItem>
                              <SelectItem value="operador">Operador</SelectItem>
                              <SelectItem value="visualizador">Visualizador</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!isYou && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[#E53E3E] hover:bg-[#FEE2E2] h-8 px-2"
                            onClick={async () => {
                              const ok = await confirm({
                                title: `Remover ${m.full_name || m.email} da equipe?`,
                                description: 'Ele perderá acesso a esta empresa. Não exclui a conta dele do sistema.',
                                confirmLabel: 'Remover',
                                variant: 'destructive',
                              });
                              if (!ok) return;
                              removeMember.mutate(m.user_companies_id);
                            }}
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* Modal Adicionar Usuário */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogTitle>Adicionar usuário à equipe</DialogTitle>
          <DialogDescription>
            O usuário precisa já ter conta criada em ataticagestao.com. Você pode buscar pelo e-mail dele.
          </DialogDescription>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="email@exemplo.com"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="role">Nível de acesso</Label>
              <Select value={addRole} onValueChange={(v) => setAddRole(v as Role)}>
                <SelectTrigger id="role" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operador">Operador (lança vendas, CR, CP — não exclui)</SelectItem>
                  <SelectItem value="visualizador">Visualizador (só vê)</SelectItem>
                  <SelectItem value="owner">Proprietário (acesso total — cuidado!)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-[#667085] mt-1">{ROLE_DESC[addRole]}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} disabled={addMember.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => addMember.mutate({ email: addEmail, role: addRole })}
              disabled={!addEmail.trim() || addMember.isPending}
              className="bg-[#059669] hover:bg-[#047857] text-white"
            >
              {addMember.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
