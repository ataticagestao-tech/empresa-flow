import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
    Plus, Trash2, Edit2, ChevronRight, ChevronDown,
    FileText, Upload, Download, X, Copy, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface ChartOfAccount {
    id: string;
    code: string;
    name: string;
    description?: string;
    account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'cost';
    account_nature: 'debit' | 'credit';
    level: number;
    parent_id: string | null;
    is_analytic: boolean;
    show_in_dre: boolean;
    dre_group?: string;
    dre_order?: number;
}

interface AccountAttachment {
    id: string;
    account_id: string;
    file_name: string;
    file_path: string;
    file_size: number;
    content_type: string;
    description?: string;
    created_at: string;
}

interface ChartOfAccountsManagerProps {
    companyId: string;
}

type ChartOfAccountType = ChartOfAccount["account_type"];
type ChartOfAccountNature = ChartOfAccount["account_nature"];

type ChartOfAccountFormData = {
    code: string;
    name: string;
    description: string;
    account_type: ChartOfAccountType;
    account_nature: ChartOfAccountNature;
    parent_id: string | null;
    is_analytic: boolean;
    show_in_dre: boolean;
    dre_group: string;
    dre_order: number;
};

const accountTypeLabels = {
    asset: 'Ativo',
    liability: 'Passivo',
    equity: 'Patrimônio Líquido',
    revenue: 'Receita',
    expense: 'Despesa',
    cost: 'Custo',
};

const accountTypeColors = {
    asset: 'bg-blue-100 text-blue-800',
    liability: 'bg-red-100 text-red-800',
    equity: 'bg-purple-100 text-purple-800',
    revenue: 'bg-green-100 text-green-800',
    expense: 'bg-orange-100 text-orange-800',
    cost: 'bg-yellow-100 text-yellow-800',
};

export function ChartOfAccountsManager({ companyId }: ChartOfAccountsManagerProps) {
    const { activeClient, user } = useAuth();
    const confirm = useConfirm();
    const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
    const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [showInitDialog, setShowInitDialog] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingAccount, setEditingAccount] = useState<ChartOfAccount | null>(null);
    const [selectedAccount, setSelectedAccount] = useState<ChartOfAccount | null>(null);
    const [attachments, setAttachments] = useState<AccountAttachment[]>([]);
    const [uploadingFiles, setUploadingFiles] = useState(false);

    // Form state
    const [formData, setFormData] = useState<ChartOfAccountFormData>({
        code: '',
        name: '',
        description: '',
        account_type: 'expense',
        account_nature: 'debit',
        parent_id: null,
        is_analytic: true,
        show_in_dre: false,
        dre_group: '',
        dre_order: 0,
    });

    const loadAccounts = useCallback(async () => {
        try {
            setIsLoading(true);
            const { data, error } = await activeClient
                .from('chart_of_accounts')
                .select('*')
                .eq('company_id', companyId)
                .order('code');

            if (error) throw error;
            // Map DB columns (is_analytical) to component interface (is_analytic)
            const mapped = (data || []).map((row: any) => ({
                id: row.id,
                code: row.code,
                name: row.name,
                description: row.description,
                account_type: row.account_type,
                account_nature: row.account_nature,
                level: row.level,
                parent_id: row.parent_id,
                is_analytic: row.is_analytical ?? row.is_analytic ?? false,
                show_in_dre: row.show_in_dre ?? false,
                dre_group: row.dre_group,
                dre_order: row.dre_order,
            }));
            setAccounts(mapped);
        } catch (error: any) {
            toast.error('Erro ao carregar plano de contas: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    }, [activeClient, companyId]);

    const checkInitialSetup = useCallback(async () => {
        try {
            setIsLoading(true);
            const { data, error } = await activeClient
                .from('chart_of_accounts')
                .select('id')
                .eq('company_id', companyId)
                .limit(1);

            if (error) throw error;

            if (!data || data.length === 0) {
                setShowInitDialog(true);
            } else {
                await loadAccounts();
            }
        } catch (error: any) {
            toast.error('Erro ao verificar plano de contas: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    }, [activeClient, companyId, loadAccounts]);

    useEffect(() => {
        checkInitialSetup();
    }, [checkInitialSetup]);

    const loadAttachments = async (accountId: string) => {
        try {
            const { data, error } = await activeClient
                .from('chart_account_attachments')
                .select('*')
                .eq('account_id', accountId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setAttachments(data || []);
        } catch (error: any) {
            toast.error('Erro ao carregar anexos: ' + error.message);
        }
    };

    // Buscar templates disponíveis
    const [availableTemplates, setAvailableTemplates] = useState<{ id: string; name: string; description: string; industry: string }[]>([]);

    useEffect(() => {
        const loadTemplates = async () => {
            const { data } = await activeClient
                .from('account_templates')
                .select('id, name, description, industry')
                .order('is_default', { ascending: false });
            setAvailableTemplates(data || []);
        };
        loadTemplates();
    }, [activeClient]);

    const initializeFromTemplate = async (templateId?: string) => {
        try {
            setIsLoading(true);
            toast.info('Criando plano de contas...', { duration: 2000 });

            let selectedTemplateId = templateId;

            if (!selectedTemplateId) {
                // Fallback: buscar template padrão
                const { data: template, error: templateError } = await activeClient
                    .from('account_templates')
                    .select('id')
                    .eq('is_default', true)
                    .limit(1)
                    .maybeSingle();

                if (templateError || !template) {
                    toast.error('Template padrão não encontrado');
                    return;
                }
                selectedTemplateId = template.id;
            }

            // Buscar itens do template
            const { data: items, error: itemsError } = await activeClient
                .from('account_template_items')
                .select('*')
                .eq('template_id', selectedTemplateId)
                .order('level')
                .order('code');

            if (itemsError) throw itemsError;
            if (!items || items.length === 0) {
                toast.error('Template não possui contas');
                return;
            }

            // Criar mapa de códigos pai -> ID criado
            const codeToIdMap = new Map<string, string>();

            // Agrupar por nível para inserir em ordem
            const itemsByLevel = items.reduce((acc, item) => {
                if (!acc[item.level]) acc[item.level] = [];
                acc[item.level].push(item);
                return acc;
            }, {} as Record<number, typeof items>);

            const maxLevel = Math.max(...Object.keys(itemsByLevel).map(Number));

            // Inserir nível por nível
            for (let level = 1; level <= maxLevel; level++) {
                const levelItems = itemsByLevel[level] || [];
                if (levelItems.length === 0) continue;

                const accountsToCreate = levelItems.map(item => {
                    const isAnalytical = item.is_analytical ?? item.is_analytic ?? true;
                    return {
                        company_id: companyId,
                        code: item.code,
                        name: item.name,
                        description: item.description,
                        account_type: item.account_type as ChartOfAccountType,
                        account_nature: item.account_nature as ChartOfAccountNature,
                        level: item.level,
                        parent_id: item.parent_code ? codeToIdMap.get(item.parent_code) || null : null,
                        is_analytical: isAnalytical,
                        is_synthetic: !isAnalytical,
                        show_in_dre: item.show_in_dre,
                        dre_group: item.dre_group,
                        dre_order: item.dre_order,
                    };
                });

                const { data: created, error } = await activeClient
                    .from('chart_of_accounts')
                    .insert(accountsToCreate)
                    .select('id, code');

                if (error) throw error;

                // Mapear códigos -> IDs criados
                if (created) {
                    created.forEach(acc => {
                        codeToIdMap.set(acc.code, acc.id);
                    });
                }
            }

            toast.success(`${items.length} contas criadas com sucesso!`);
            setShowInitDialog(false);
            loadAccounts();
        } catch (error: any) {
            console.error('Erro ao criar plano de contas:', error);
            toast.error('Erro ao criar plano de contas: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const startFromScratch = () => {
        setShowInitDialog(false);
        setShowForm(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const { is_analytic, ...rest } = formData;
            const payload = {
                ...rest,
                company_id: companyId,
                is_analytical: is_analytic,
                is_synthetic: !is_analytic,
                level: formData.parent_id
                    ? (accounts.find(a => a.id === formData.parent_id)?.level || 0) + 1
                    : 1,
            };

            if (editingAccount) {
                const { error } = await activeClient
                    .from('chart_of_accounts')
                    .update(payload)
                    .eq('id', editingAccount.id);

                if (error) throw error;
                toast.success('Conta atualizada com sucesso!');
            } else {
                const { error } = await activeClient
                    .from('chart_of_accounts')
                    .insert([payload]);

                if (error) throw error;
                toast.success('Conta criada com sucesso!');
            }

            setShowForm(false);
            setEditingAccount(null);
            resetForm();
            loadAccounts();
        } catch (error: any) {
            toast.error('Erro ao salvar conta: ' + error.message);
        }
    };

    const handleFileUpload = async (accountId: string, files: FileList) => {
        if (!files || files.length === 0) return;

        try {
            setUploadingFiles(true);

            for (const file of Array.from(files)) {
                // Upload para storage
                // Use companyId as the first folder to satisfy RLS policy
                const filePath = `${companyId}/chart-accounts/${accountId}/${Date.now()}_${file.name}`;
                const { error: uploadError } = await activeClient.storage
                    .from('company-docs')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                // Salvar metadados
                const { error: dbError } = await activeClient
                    .from('chart_account_attachments')
                    .insert([{
                        account_id: accountId,
                        file_name: file.name,
                        file_path: filePath,
                        file_size: file.size,
                        content_type: file.type,
                        created_by: user?.id
                    }]);

                if (dbError) throw dbError;
            }

            toast.success(`${files.length} arquivo(s) anexado(s) com sucesso!`);
            loadAttachments(accountId);
        } catch (error: any) {
            toast.error('Erro ao anexar arquivo: ' + error.message);
        } finally {
            setUploadingFiles(false);
        }
    };

    const handleDownload = async (attachment: AccountAttachment) => {
        try {
            const { data, error } = await activeClient.storage
                .from('company-docs')
                .download(attachment.file_path);

            if (error) throw error;

            const url = URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = attachment.file_name;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error: any) {
            toast.error('Erro ao baixar arquivo: ' + error.message);
        }
    };

    const handleDeleteAttachment = async (attachmentId: string, filePath: string) => {
        const ok = await confirm({
            title: 'Excluir este anexo?',
            description: 'O arquivo será removido permanentemente.',
            confirmLabel: 'Sim, excluir',
            variant: 'destructive',
        });
        if (!ok) return;

        try {
            // Deletar do storage
            await activeClient.storage
                .from('company-docs')
                .remove([filePath]);

            // Deletar do banco
            const { error } = await activeClient
                .from('chart_account_attachments')
                .delete()
                .eq('id', attachmentId);

            if (error) throw error;

            toast.success('Anexo excluído com sucesso!');
            if (selectedAccount) {
                loadAttachments(selectedAccount.id);
            }
        } catch (error: any) {
            toast.error('Erro ao excluir anexo: ' + error.message);
        }
    };

    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: 'Excluir esta conta?',
            description: 'Todas as subcategorias e anexos também serão excluídos. Esta ação não pode ser desfeita.',
            confirmLabel: 'Sim, excluir',
            variant: 'destructive',
        });
        if (!ok) return;

        try {
            const { error } = await activeClient
                .from('chart_of_accounts')
                .delete()
                .eq('id', id);

            if (error) throw error;
            toast.success('Conta excluída com sucesso!');
            loadAccounts();
        } catch (error: any) {
            toast.error('Erro ao excluir conta: ' + error.message);
        }
    };

    const handleResetAndReimport = async () => {
        const ok = await confirm({
            title: 'Recriar plano de contas do zero?',
            description: 'Isso vai APAGAR todas as contas atuais e recriar a partir do template padrão. Esta ação não pode ser desfeita.',
            confirmLabel: 'Sim, recriar',
            variant: 'destructive',
        });
        if (!ok) return;

        try {
            setIsLoading(true);
            // Delete all existing accounts for this company
            const { error: deleteError } = await activeClient
                .from('chart_of_accounts')
                .delete()
                .eq('company_id', companyId);

            if (deleteError) throw deleteError;

            // Reinitialize from template
            await initializeFromTemplate();
        } catch (error: any) {
            toast.error('Erro ao reinicializar: ' + error.message);
            setIsLoading(false);
        }
    };

    const handleEdit = (account: ChartOfAccount) => {
        setEditingAccount(account);
        setFormData({
            code: account.code,
            name: account.name,
            description: account.description || '',
            account_type: account.account_type as ChartOfAccountType,
            account_nature: account.account_nature || 'debit',
            parent_id: account.parent_id,
            is_analytic: account.is_analytic ?? false,
            show_in_dre: account.show_in_dre ?? false,
            dre_group: account.dre_group || '',
            dre_order: account.dre_order || 0,
        });
        setShowForm(true);
    };

    const handleAddSubcategory = (parentAccount: ChartOfAccount) => {
        setFormData({
            ...formData,
            parent_id: parentAccount.id,
            code: parentAccount.code + '.',
            account_type: parentAccount.account_type as ChartOfAccountType,
            account_nature: parentAccount.account_nature,
        });
        setShowForm(true);
    };

    const handleViewAttachments = (account: ChartOfAccount) => {
        setSelectedAccount(account);
        loadAttachments(account.id);
    };

    const resetForm = () => {
        setFormData({
            code: '',
            name: '',
            description: '',
            account_type: 'expense',
            account_nature: 'debit',
            parent_id: null,
            is_analytic: true,
            show_in_dre: false,
            dre_group: '',
            dre_order: 0,
        });
    };

    const toggleExpand = (id: string) => {
        const newExpanded = new Set(expandedAccounts);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedAccounts(newExpanded);
    };

    const renderAccountTree = (parentId: string | null = null, level: number = 0) => {
        const children = accounts.filter(a => a.parent_id === parentId);

        return children.map(account => {
            const hasChildren = accounts.some(a => a.parent_id === account.id);
            const isExpanded = expandedAccounts.has(account.id);

            return (
                <div key={account.id} className={`transition-all ml-${level * 6}`}>
                    <div className="flex items-center gap-2 py-2 px-3 hover:bg-gray-50 rounded-lg group">
                        {hasChildren ? (
                            <button
                                onClick={() => toggleExpand(account.id)}
                                className="p-1 hover:bg-gray-50 rounded"
                            >
                                {isExpanded ? (
                                    <ChevronDown className="w-4 h-4" />
                                ) : (
                                    <ChevronRight className="w-4 h-4" />
                                )}
                            </button>
                        ) : (
                            <div className="w-6" />
                        )}

                        <span className="font-mono text-sm text-muted-foreground min-w-[100px]">{account.code}</span>
                        <span className="flex-1 font-medium">{account.name}</span>

                        <Badge className={accountTypeColors[account.account_type]}>
                            {accountTypeLabels[account.account_type]}
                        </Badge>

                        <Badge variant="outline" className={`text-xs ${account.is_analytic ? 'border-green-300 text-green-700' : 'border-slate-300 text-slate-500'}`}>
                            {account.is_analytic ? 'Analítica' : 'Sintética'}
                        </Badge>

                        <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleViewAttachments(account)}
                                className="h-8 w-8 p-0"
                                title="Ver anexos"
                            >
                                <FileText className="w-4 h-4" />
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleAddSubcategory(account)}
                                className="h-8 w-8 p-0"
                                title="Adicionar subcategoria"
                            >
                                <Plus className="w-4 h-4" />
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEdit(account)}
                                className="h-8 w-8 p-0"
                            >
                                <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDelete(account.id)}
                                className="h-8 w-8 p-0 text-[#E53E3E] hover:text-red-700"
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>

                    {hasChildren && isExpanded && renderAccountTree(account.id, level + 1)}
                </div>
            );
        });
    };

    if (isLoading) {
        return <div className="text-center py-8 text-muted-foreground">Carregando plano de contas...</div>;
    }

    return (
        <div className="space-y-4">
            {/* Dialog de Inicialização */}
            <Dialog open={showInitDialog} onOpenChange={setShowInitDialog}>
                <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Plano de Contas</DialogTitle>
                        <DialogDescription>
                            Esta empresa ainda não possui um plano de contas. Como deseja iniciar?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        {availableTemplates.map(tmpl => (
                            <Button
                                key={tmpl.id}
                                onClick={() => initializeFromTemplate(tmpl.id)}
                                className="w-full justify-start h-auto py-4 px-4"
                                variant="outline"
                            >
                                <div className="text-left">
                                    <div className="font-semibold flex items-center gap-2">
                                        <Copy className="w-4 h-4" />
                                        {tmpl.name}
                                    </div>
                                    <div className="text-sm text-muted-foreground mt-1">
                                        {tmpl.description || `Setor: ${tmpl.industry || 'Geral'}`}
                                    </div>
                                </div>
                            </Button>
                        ))}
                        {availableTemplates.length === 0 && (
                            <Button
                                onClick={() => initializeFromTemplate()}
                                className="w-full justify-start h-auto py-4 px-4"
                                variant="outline"
                            >
                                <div className="text-left">
                                    <div className="font-semibold flex items-center gap-2">
                                        <Copy className="w-4 h-4" />
                                        Usar Template Padrão
                                    </div>
                                    <div className="text-sm text-muted-foreground mt-1">
                                        Criar plano de contas baseado no modelo padrão
                                    </div>
                                </div>
                            </Button>
                        )}
                        <Button
                            onClick={startFromScratch}
                            className="w-full justify-start h-auto py-4 px-4"
                            variant="outline"
                        >
                            <div className="text-left">
                                <div className="font-semibold flex items-center gap-2">
                                    <Plus className="w-4 h-4" />
                                    Criar do Zero
                                </div>
                                <div className="text-sm text-muted-foreground mt-1">
                                    Criar um plano de contas personalizado desde o início
                                </div>
                            </div>
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Dialog de Anexos */}
            <Dialog open={!!selectedAccount} onOpenChange={() => setSelectedAccount(null)}>
                <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Anexos - {selectedAccount?.name}</DialogTitle>
                        <DialogDescription>
                            Código: {selectedAccount?.code}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="file-upload" className="cursor-pointer">
                                <div className="border-2 border-dashed border-[#EAECF0] rounded-lg p-6 hover:border-slate-400 transition-colors text-center">
                                    <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                                    <p className="text-sm text-muted-foreground">
                                        Clique para selecionar arquivos ou arraste aqui
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        PDF, Excel, XML, imagens, etc.
                                    </p>
                                </div>
                            </Label>
                            <input
                                id="file-upload"
                                type="file"
                                multiple
                                className="hidden"
                                aria-label="Selecionar arquivos para anexar"
                                title="Selecionar arquivos"
                                onChange={(e) => {
                                    if (e.target.files && selectedAccount) {
                                        handleFileUpload(selectedAccount.id, e.target.files);
                                    }
                                }}
                            />
                        </div>

                        {attachments.length > 0 && (
                            <div className="space-y-2">
                                <h4 className="font-semibold text-sm">Arquivos anexados:</h4>
                                {attachments.map(attachment => (
                                    <div
                                        key={attachment.id}
                                        className="flex items-center gap-2 p-3 border rounded-lg hover:bg-gray-50"
                                    >
                                        <FileText className="w-4 h-4 text-muted-foreground" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{attachment.file_name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {(attachment.file_size / 1024).toFixed(2)} KB
                                            </p>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleDownload(attachment)}
                                        >
                                            <Download className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleDeleteAttachment(attachment.id, attachment.file_path)}
                                            className="text-[#E53E3E] hover:text-red-700"
                                        >
                                            <X className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Cabeçalho */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">Plano de Contas</h3>
                    <p className="text-sm text-muted-foreground">
                        {accounts.length} conta{accounts.length !== 1 ? 's' : ''} cadastrada{accounts.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleResetAndReimport} className="gap-2">
                        <RefreshCw className="w-4 h-4" />
                        Reinicializar Template
                    </Button>
                    <Button onClick={() => setShowForm(!showForm)} className="gap-2">
                        <Plus className="w-4 h-4" />
                        Nova Categoria
                    </Button>
                </div>
            </div>

            {/* Formulário */}
            {showForm && (
                <Card className="p-4 max-h-[70vh] overflow-y-auto">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Código *</Label>
                                <Input
                                    value={formData.code}
                                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                    placeholder="Ex: 3.1.01"
                                    required
                                />
                            </div>
                            <div>
                                <Label>Nome da Conta *</Label>
                                <Input
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Ex: Receita de Vendas"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <Label>Descrição</Label>
                            <Textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Descrição detalhada da conta..."
                                rows={2}
                            />
                        </div>

                        <div>
                            <Label>Categoria Pai</Label>
                            <Select
                                value={formData.parent_id || "__none__"}
                                onValueChange={(value) => {
                                    const parentId = value === "__none__" ? null : value;
                                    const parent = accounts.find(a => a.id === parentId);
                                    setFormData({
                                        ...formData,
                                        parent_id: parentId,
                                        code: parent ? parent.code + '.' : '',
                                        account_type: parent ? parent.account_type as ChartOfAccountType : formData.account_type,
                                        account_nature: parent ? parent.account_nature : formData.account_nature,
                                    });
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Nenhuma (conta raiz)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">Nenhuma (conta raiz)</SelectItem>
                                    {accounts
                                        .filter(a => a.is_analytic === false || accounts.some(child => child.parent_id === a.id))
                                        .sort((a, b) => a.code.localeCompare(b.code))
                                        .map(a => (
                                            <SelectItem key={a.id} value={a.id}>
                                                {a.code} - {a.name}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Tipo de Conta *</Label>
                                <Select
                                    value={formData.account_type}
                                    onValueChange={(value: any) => setFormData({ ...formData, account_type: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(accountTypeLabels).map(([value, label]) => (
                                            <SelectItem key={value} value={value}>
                                                {label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Natureza *</Label>
                                <Select
                                    value={formData.account_nature}
                                    onValueChange={(value: any) => setFormData({ ...formData, account_nature: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="debit">Devedora</SelectItem>
                                        <SelectItem value="credit">Credora</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="is_analytic"
                                    checked={formData.is_analytic}
                                    onCheckedChange={(checked) => setFormData({ ...formData, is_analytic: !!checked })}
                                />
                                <Label htmlFor="is_analytic" className="text-sm font-normal cursor-pointer">
                                    Conta Analítica (aceita lançamentos)
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="show_in_dre"
                                    checked={formData.show_in_dre}
                                    onCheckedChange={(checked) => setFormData({ ...formData, show_in_dre: !!checked })}
                                />
                                <Label htmlFor="show_in_dre" className="text-sm font-normal cursor-pointer">
                                    Exibir no DRE
                                </Label>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <Button type="submit" className="flex-1">
                                {editingAccount ? 'Atualizar' : 'Criar'} Conta
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setShowForm(false);
                                    setEditingAccount(null);
                                    resetForm();
                                }}
                            >
                                Cancelar
                            </Button>
                        </div>
                    </form>
                </Card>
            )}

            {/* Árvore de Contas */}
            <Card className="p-4">
                {accounts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground space-y-4">
                        <p>Nenhuma conta cadastrada.</p>
                        <Button variant="outline" onClick={() => setShowInitDialog(true)}>
                            Inicializar com Template
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {renderAccountTree()}
                    </div>
                )}
            </Card>
        </div>
    );
}
