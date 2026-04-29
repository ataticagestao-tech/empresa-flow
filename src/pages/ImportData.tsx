import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AppLayout } from "@/components/layout/AppLayout";
import jsonCompanies from "@/data/companies_import.json";
import { Loader2, AlertCircle, Copy, RefreshCw } from "lucide-react";

export default function ImportData() {
    const { activeClient, user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [logs, setLogs] = useState<string[]>([]);
    const [summary, setSummary] = useState({ success: 0, errors: 0 });
    const [permissionCheck, setPermissionCheck] = useState<any>(null);

    const checkPermissions = useCallback(async () => {
        if (!user) return;

        setPermissionCheck({ status: 'checking' });
        try {
            // Try to read one company (to check Select RLS)
            const { data: companies, error: companyError } = await activeClient
                .from('companies')
                .select('id')
                .limit(1);

            const { data: links, error: linkError } = await activeClient
                .from('user_companies')
                .select('id')
                .eq('user_id', user.id)
                .limit(1);

            const projectUrl = (activeClient as any).supabaseUrl || "URL Desconhecida";

            setPermissionCheck({
                status: 'done',
                companyAccess: !companyError,
                companyError: companyError,
                linkAccess: !linkError,
                linkError: linkError,
                hasCompanies: (companies || []).length > 0,
                hasLinks: (links || []).length > 0,
                projectUrl: projectUrl,
                userId: user.id
            });
        } catch (e: any) {
            setPermissionCheck({ status: 'error', message: e.message });
        }
    }, [activeClient, user]);

    useEffect(() => {
        checkPermissions();
    }, [checkPermissions]);

    const handleCopy = () => {
        if (user?.id) {
            navigator.clipboard.writeText(user.id);
            alert("ID copiado!");
        }
    };

    const handleImport = async () => {
        if (!user) {
            setLogs(prev => [...prev, "ERRO: Você precisa estar logado para importar dados."]);
            return;
        }
        setLoading(true);
        setLogs(prev => [...prev, "Iniciando importação e vínculo de usuários..."]);

        let successCount = 0;
        let errorCount = 0;

        const CHUNK_SIZE = 5;
        for (let i = 0; i < jsonCompanies.length; i += CHUNK_SIZE) {
            const chunk = jsonCompanies.slice(i, i + CHUNK_SIZE);

            await Promise.all(chunk.map(async (company) => {
                try {
                    const insertData: any = { ...company };
                    if (!insertData.cnpj || insertData.cnpj.trim() === '') {
                        delete insertData.cnpj;
                    }

                    // Insert/Update Company
                    const { data: insertedCompany, error: companyError } = await activeClient
                        .from("companies")
                        .upsert(insertData, {
                            onConflict: insertData.cnpj ? 'cnpj' : undefined,
                            ignoreDuplicates: false
                        })
                        .select()
                        .single();

                    if (companyError) throw companyError;

                    if (insertedCompany) {
                        // Link Company to User (Crucial for RLS visibility)
                        const { error: linkError } = await activeClient
                            .from("user_companies")
                            .upsert({
                                user_id: user.id,
                                company_id: insertedCompany.id,
                                is_default: false
                            }, { onConflict: 'user_id, company_id' as any });

                        if (linkError) {
                            console.error("Erro de vínculo", linkError);
                        }
                    }
                    successCount++;
                } catch (e: any) {
                    console.error(e);
                    errorCount++;
                    setLogs(prev => [...prev, `Erro em ${company.razao_social || 'Desconhecido'}: ${e.message}`]);
                }
            }));

            setProgress(Math.min(100, Math.round(((i + CHUNK_SIZE) / jsonCompanies.length) * 100)));
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        setSummary({ success: successCount, errors: errorCount });
        setLogs(prev => [...prev, `Importação concluída. Sucesso: ${successCount}, Erros: ${errorCount}`]);
        setLoading(false);
    };

    return (
        <AppLayout title="Importar Dados">
            <div className="p-8 max-w-4xl mx-auto">

                <Card className="mb-6">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center justify-between">
                            Diagnóstico de Acesso
                            <Button variant="outline" size="sm" onClick={checkPermissions}>
                                <RefreshCw className="w-4 h-4 mr-2" /> Verificar Novamente
                            </Button>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs font-mono bg-white p-4 rounded-b-md">
                        {permissionCheck?.status === 'done' ? (
                            <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <span className="font-bold text-muted-foreground">ID DO USUÁRIO:</span>
                                        <div className="bg-white border p-1 mt-1 break-all">{permissionCheck.userId}</div>
                                    </div>
                                    <div>
                                        <span className="font-bold text-muted-foreground">PROJETO CONECTADO:</span>
                                        <div className="bg-white border p-1 mt-1 break-all text-blue-600">{permissionCheck.projectUrl}</div>
                                    </div>
                                </div>

                                <div>
                                    <span className="font-bold text-muted-foreground">LEITURA DE COMPANIES:</span>
                                    {permissionCheck.companyAccess ? (
                                        <span className="text-green-600 ml-2">OK</span>
                                    ) : (
                                        <span className="text-[#E53E3E] ml-2">
                                            ERRO{permissionCheck.companyError?.message ? ` (${permissionCheck.companyError.message})` : ""}
                                        </span>
                                    )}
                                </div>

                                <div>
                                    <span className="font-bold text-muted-foreground">LEITURA DE USER_COMPANIES:</span>
                                    {permissionCheck.linkAccess ? (
                                        <span className="text-green-600 ml-2">OK</span>
                                    ) : (
                                        <span className="text-[#E53E3E] ml-2">
                                            ERRO{permissionCheck.linkError?.message ? ` (${permissionCheck.linkError.message})` : ""}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div>Carregando diagnósticos...</div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Importar Empresas</CardTitle>
                        <CardDescription>
                            Pode exigir permissões no banco (RLS). Se não autorizado, ajuste as políticas no Supabase.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">

                        {user && (
                            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-md flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                                <div className="flex-1">
                                    <h4 className="text-sm font-semibold text-yellow-800">Verificação de Acesso</h4>
                                    <p className="text-sm text-yellow-700 mt-1">Se você ver erros de "row-level security", é necessário ajustar as políticas (RLS) no Supabase.</p>
                                    <div className="mt-3 flex items-center gap-2 bg-white border p-2 rounded w-fit">
                                        <code className="text-xs font-mono">{user.id}</code>
                                        <Button variant="ghost" size="icon" className="h-6 h-6 w-6" onClick={handleCopy}>
                                            <Copy className="w-3 h-3" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-4">
                            <p>Pronto para importar {jsonCompanies.length} empresas.</p>
                            <Button onClick={handleImport} disabled={loading} className="w-40">
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Iniciar Importação"}
                                {loading && `${progress}%`}
                            </Button>
                        </div>

                        {summary.success > 0 && (
                            <div className="text-green-600 font-bold">Importado e vinculado com sucesso: {summary.success}</div>
                        )}

                        <div className="bg-primary text-slate-50 p-4 rounded h-96 font-mono text-xs">
                            <ScrollArea className="h-full">
                                {logs.map((l, i) => <div key={i} className="mb-1">{l}</div>)}
                            </ScrollArea>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
