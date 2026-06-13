import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Props {
    companyId: string;
    employeeId: string;
    employeeNome: string;
}

interface ProdutoComissao {
    id: string;
    description: string;
    comissao_tipo: string | null;
    comissao_valor: number | null;
}

interface LinhaConfig {
    atende: boolean;
    override: boolean;          // usa % próprio?
    tipo: "percentual" | "valor";
    valor: string;             // texto editável
}

const fmtPadrao = (p: ProdutoComissao) =>
    p.comissao_tipo === "valor"
        ? `R$ ${Number(p.comissao_valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/un`
        : `${Number(p.comissao_valor || 0)}%`;

export default function AbaServicosComissao({ companyId, employeeId, employeeNome }: Props) {
    const { activeClient } = useAuth();
    const queryClient = useQueryClient();
    const [config, setConfig] = useState<Record<string, LinhaConfig>>({});
    const [saving, setSaving] = useState(false);

    // Acesso do profissional
    const [showAcesso, setShowAcesso] = useState(false);
    const [acessoEmail, setAcessoEmail] = useState("");
    const [acessoSenha, setAcessoSenha] = useState("");
    const [criandoAcesso, setCriandoAcesso] = useState(false);

    // Produtos/serviços que comissionam
    const { data: produtos = [], isLoading: loadingProds } = useQuery({
        queryKey: ["produtos_comissionaveis", companyId],
        queryFn: async (): Promise<ProdutoComissao[]> => {
            const { data, error } = await (activeClient as any)
                .from("products")
                .select("id, description, comissao_tipo, comissao_valor")
                .eq("company_id", companyId)
                .eq("is_active", true)
                .eq("comissiona", true)
                .order("description");
            if (error) return [];
            return data || [];
        },
        enabled: !!companyId,
    });

    // Vínculos atuais do funcionário
    const { data: vinculos = [] } = useQuery({
        queryKey: ["funcionario_servicos", employeeId],
        queryFn: async () => {
            const { data, error } = await (activeClient as any)
                .from("funcionario_servicos")
                .select("product_id, comissao_tipo, comissao_valor, ativo")
                .eq("employee_id", employeeId);
            if (error) return [];
            return data || [];
        },
        enabled: !!employeeId,
    });

    // Status de acesso (employees.user_id + email)
    const { data: acesso } = useQuery({
        queryKey: ["employee_acesso", employeeId],
        queryFn: async () => {
            const { data } = await (activeClient as any)
                .from("employees")
                .select("user_id, email")
                .eq("id", employeeId)
                .maybeSingle();
            return data || null;
        },
        enabled: !!employeeId,
    });

    useEffect(() => {
        if (acesso?.email) setAcessoEmail(acesso.email);
    }, [acesso?.email]);

    // Monta o estado a partir de produtos + vínculos
    useEffect(() => {
        const byProduct: Record<string, any> = {};
        (vinculos as any[]).forEach((v) => { byProduct[v.product_id] = v; });
        const next: Record<string, LinhaConfig> = {};
        produtos.forEach((p) => {
            const v = byProduct[p.id];
            const hasOverride = !!v && v.comissao_valor != null;
            next[p.id] = {
                atende: !!v && v.ativo !== false,
                override: hasOverride,
                tipo: (hasOverride ? v.comissao_tipo : p.comissao_tipo) === "valor" ? "valor" : "percentual",
                valor: hasOverride
                    ? (v.comissao_tipo === "valor"
                        ? Number(v.comissao_valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })
                        : String(Number(v.comissao_valor)).replace(".", ","))
                    : "",
            };
        });
        setConfig(next);
    }, [produtos, vinculos]);

    const totalAtende = useMemo(() => Object.values(config).filter((c) => c.atende).length, [config]);

    const upd = (pid: string, patch: Partial<LinhaConfig>) =>
        setConfig((prev) => ({ ...prev, [pid]: { ...prev[pid], ...patch } }));

    const parseValor = (tipo: string, v: string) =>
        tipo === "valor"
            ? Number(v.replace(/[^\d,]/g, "").replace(",", ".")) || 0
            : parseFloat(v.replace(",", ".")) || 0;

    const salvar = async () => {
        setSaving(true);
        try {
            // Apaga tudo do funcionário e regrava o que está marcado (idempotente).
            await (activeClient as any).from("funcionario_servicos").delete().eq("employee_id", employeeId);
            const rows = produtos
                .filter((p) => config[p.id]?.atende)
                .map((p) => {
                    const c = config[p.id];
                    const temOverride = c.override && c.valor.trim() !== "";
                    return {
                        company_id: companyId,
                        employee_id: employeeId,
                        product_id: p.id,
                        ativo: true,
                        comissao_tipo: temOverride ? c.tipo : null,
                        comissao_valor: temOverride ? parseValor(c.tipo, c.valor) : null,
                    };
                });
            if (rows.length > 0) {
                const { error } = await (activeClient as any).from("funcionario_servicos").insert(rows);
                if (error) throw error;
            }
            queryClient.invalidateQueries({ queryKey: ["funcionario_servicos", employeeId] });
            toast.success("Serviços salvos!");
        } catch (e: any) {
            console.error(e);
            toast.error("Erro ao salvar: " + (e.message || ""));
        } finally {
            setSaving(false);
        }
    };

    const criarAcesso = async () => {
        if (!acessoEmail.trim() || acessoSenha.length < 6) {
            toast.error("Informe email e senha (mín. 6 caracteres).");
            return;
        }
        setCriandoAcesso(true);
        try {
            const { data, error } = await (activeClient as any).functions.invoke("criar-acesso-profissional", {
                body: { employee_id: employeeId, email: acessoEmail.trim().toLowerCase(), password: acessoSenha },
            });
            if (error) throw error;
            if (data && data.ok === false) throw new Error(data.erro || "Falha");
            toast.success("Acesso criado! O profissional já pode entrar com esse email e senha.");
            setShowAcesso(false);
            setAcessoSenha("");
            queryClient.invalidateQueries({ queryKey: ["employee_acesso", employeeId] });
        } catch (e: any) {
            console.error(e);
            toast.error("Erro ao criar acesso: " + (e.message || ""));
        } finally {
            setCriandoAcesso(false);
        }
    };

    return (
        <div className="space-y-5">
            {/* Acesso do profissional */}
            <div className="border border-[#ccc] rounded-lg overflow-hidden">
                <div className="bg-[#064E3B] px-3 py-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white">Acesso do profissional</span>
                </div>
                <div className="p-3">
                    {acesso?.user_id ? (
                        <p className="text-[12px] text-[#1D2939]">
                            ✓ Este funcionário já tem acesso próprio (<b>{acesso.email}</b>) e enxerga apenas as comissões dele em
                            <span className="font-mono"> /minhas-comissoes</span>.
                        </p>
                    ) : !showAcesso ? (
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-[12px] text-[#555]">
                                Crie um login para <b>{employeeNome}</b> ver só os atendimentos e a comissão dele(a), sem acesso ao resto do sistema.
                            </p>
                            <button onClick={() => setShowAcesso(true)}
                                className="shrink-0 text-[12px] font-bold text-white bg-[#059669] rounded px-3 py-1.5">
                                Criar acesso
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="flex flex-col gap-1">
                                <label className="text-[11px] font-bold uppercase text-[#555]">Email de acesso</label>
                                <input value={acessoEmail} onChange={(e) => setAcessoEmail(e.target.value)}
                                    placeholder="email@exemplo.com"
                                    className="border border-[#ccc] rounded-md px-3 py-2 text-sm w-[260px]" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[11px] font-bold uppercase text-[#555]">Senha provisória</label>
                                <input type="text" value={acessoSenha} onChange={(e) => setAcessoSenha(e.target.value)}
                                    placeholder="mín. 6 caracteres"
                                    className="border border-[#ccc] rounded-md px-3 py-2 text-sm w-[180px]" />
                            </div>
                            <button onClick={criarAcesso} disabled={criandoAcesso}
                                className="text-[12px] font-bold text-white bg-[#059669] rounded px-3 py-2 disabled:opacity-40">
                                {criandoAcesso ? "Criando…" : "Confirmar"}
                            </button>
                            <button onClick={() => setShowAcesso(false)}
                                className="text-[12px] font-bold text-[#555] border border-[#ccc] rounded px-3 py-2">
                                Cancelar
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Serviços que atende */}
            <div className="border border-[#ccc] rounded-lg overflow-hidden">
                <div className="bg-[#059669] px-3 py-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white">Serviços que atende e comissiona</span>
                    <span className="text-[10px] font-bold text-white/90">{totalAtende} selecionado(s)</span>
                </div>
                {loadingProds ? (
                    <div className="p-6 text-center text-[#555] text-xs">Carregando…</div>
                ) : produtos.length === 0 ? (
                    <div className="p-6 text-center text-[#555] text-xs">
                        Nenhum produto/serviço marcado como comissionável ainda.
                        <div className="mt-1 text-[11px]">Marque "Comissiona" no cadastro do produto (Operacional / Estoque) para ele aparecer aqui.</div>
                    </div>
                ) : (
                    <div className="divide-y divide-[#eee]">
                        {produtos.map((p) => {
                            const c = config[p.id];
                            if (!c) return null;
                            return (
                                <div key={p.id} className="px-3 py-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <label className="flex items-center gap-2 cursor-pointer text-[13px] min-w-0">
                                            <input type="checkbox" checked={c.atende}
                                                onChange={(e) => upd(p.id, { atende: e.target.checked })}
                                                className="accent-[#059669]" />
                                            <span className="truncate text-[#1D2939]">{p.description}</span>
                                        </label>
                                        <span className="shrink-0 text-[11px] text-[#777]">Padrão: <b>{fmtPadrao(p)}</b></span>
                                    </div>
                                    {c.atende && (
                                        <div className="mt-2 pl-6 flex flex-wrap items-center gap-3">
                                            <label className="flex items-center gap-1.5 cursor-pointer text-[12px] text-[#555]">
                                                <input type="checkbox" checked={c.override}
                                                    onChange={(e) => upd(p.id, { override: e.target.checked })}
                                                    className="accent-[#059669]" />
                                                Comissão própria
                                            </label>
                                            {c.override && (
                                                <>
                                                    <select value={c.tipo} onChange={(e) => upd(p.id, { tipo: e.target.value as any, valor: "" })}
                                                        className="border border-[#ccc] rounded px-2 py-1 text-[12px]">
                                                        <option value="percentual">%</option>
                                                        <option value="valor">R$/un</option>
                                                    </select>
                                                    <input value={c.valor}
                                                        onChange={(e) => upd(p.id, { valor: e.target.value })}
                                                        placeholder={c.tipo === "valor" ? "0,00" : "Ex: 15"}
                                                        className="border border-[#ccc] rounded px-2 py-1 text-[12px] w-[110px]" />
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <button onClick={salvar} disabled={saving}
                className="bg-[#059669] text-white text-sm font-bold px-6 py-2 rounded-md disabled:opacity-40">
                {saving ? "Salvando…" : "Salvar serviços"}
            </button>
        </div>
    );
}
