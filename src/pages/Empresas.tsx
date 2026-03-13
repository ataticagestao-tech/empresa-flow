import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    Plus, Pencil, Trash2, Building2, ListTree, MapPin, Mail, FileText,
    ChevronRight, Search
} from "lucide-react";
import { useCompanies } from "@/hooks/useCompanies";
import { Company } from "@/types/company";
import { maskCNPJ } from "@/utils/masks";
import { CompanyForm } from "@/modules/companies/presentation/CompanyForm";
import { useNavigate } from "react-router-dom";

/* ── Design tokens ────────────────────────────── */
const T = {
    primary:    "#3b5bdb",
    primaryLt:  "#eef2ff",
    green:      "#2e7d32",
    greenLt:    "#e8f5e9",
    red:        "#c62828",
    redLt:      "#fde8e8",
    amber:      "#f57f17",
    amberLt:    "#fff8e1",
    text1:      "#0f172a",
    text2:      "#475569",
    text3:      "#94a3b8",
    bg:         "#f8f9fb",
    card:       "#ffffff",
    border:     "#e2e8f0",
    hover:      "#f1f5f9",
} as const;

const FONT = "var(--font-base)";

export default function Empresas() {
    const { user, activeClient } = useAuth();
    const navigate = useNavigate();
    const { companies, isLoading, error: companiesError, deleteCompany, refetch: refetchCompanies } = useCompanies(user?.id);

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingCompany, setEditingCompany] = useState<Company | null>(null);
    const [companiesWithCharts, setCompaniesWithCharts] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState("");

    useEffect(() => {
        if (!companies || companies.length === 0) return;
        const checkChartOfAccounts = async () => {
            const companyIds = companies.map(c => c.id);
            const { data } = await activeClient
                .from('chart_of_accounts')
                .select('company_id')
                .in('company_id', companyIds);
            if (data) {
                setCompaniesWithCharts(new Set(data.map(d => d.company_id)));
            }
        };
        checkChartOfAccounts();
    }, [companies, activeClient]);

    const handleEdit = (company: Company) => {
        setEditingCompany(company);
        setIsDialogOpen(true);
    };

    const handleDelete = async (company: Company) => {
        if (!confirm(`Remover empresa ${company.razao_social}?`)) return;
        await deleteCompany(company.id);
    };

    const handleSuccess = () => {
        setIsDialogOpen(false);
        setEditingCompany(null);
        refetchCompanies();
    };

    const filtered = (companies || []).filter((c) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            c.razao_social?.toLowerCase().includes(q) ||
            c.nome_fantasia?.toLowerCase().includes(q) ||
            c.cnpj?.includes(q) ||
            c.endereco_cidade?.toLowerCase().includes(q)
        );
    });

    return (
        <AppLayout title="Empresas">
            <div className="animate-fade-in" style={{ fontFamily: FONT, display: "flex", flexDirection: "column", gap: 24 }}>

                {/* ── Header ──────────────────────── */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div>
                        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#000", letterSpacing: "-0.01em" }}>
                            Empresas
                        </h2>
                        <p style={{ fontSize: 13, color: T.text2, marginTop: 4 }}>
                            Gerencie suas unidades de negocio
                        </p>
                    </div>
                    <button
                        onClick={() => { setEditingCompany(null); setIsDialogOpen(true); }}
                        style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "10px 20px", borderRadius: 10, border: "none",
                            background: T.primary, color: "#fff", cursor: "pointer",
                            fontFamily: FONT, fontSize: 13, fontWeight: 600,
                            transition: "opacity 0.15s ease",
                        }}
                    >
                        <Plus size={16} strokeWidth={2} />
                        Nova Empresa
                    </button>
                </div>

                {/* ── Search + Stats ──────────────── */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{
                        display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 220,
                        padding: "8px 14px", borderRadius: 10, border: `1px solid ${T.border}`,
                        background: T.card,
                    }}>
                        <Search size={16} strokeWidth={1.5} color={T.text3} />
                        <input
                            type="text"
                            placeholder="Buscar empresa..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{
                                border: "none", outline: "none", background: "transparent",
                                fontSize: 13, fontFamily: FONT, color: T.text1, width: "100%",
                            }}
                        />
                    </div>
                    <div style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
                        borderRadius: 10, background: T.primaryLt,
                    }}>
                        <Building2 size={14} strokeWidth={1.5} color={T.primary} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: T.primary }}>{companies?.length || 0}</span>
                        <span style={{ fontSize: 12, color: T.text2 }}>empresas</span>
                    </div>
                    <div style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
                        borderRadius: 10, background: T.greenLt,
                    }}>
                        <ListTree size={14} strokeWidth={1.5} color={T.green} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: T.green }}>{companiesWithCharts.size}</span>
                        <span style={{ fontSize: 12, color: T.text2 }}>configuradas</span>
                    </div>
                </div>

                {/* ── Dialog ──────────────────────── */}
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="max-w-7xl p-0 border-none shadow-2xl overflow-hidden flex flex-col h-[92vh] max-h-[950px] w-[98vw] md:w-full">
                        <DialogTitle className="sr-only">Formulario de Empresa</DialogTitle>
                        <DialogDescription className="sr-only">
                            Preencha os dados para cadastrar ou editar uma unidade de negocio.
                        </DialogDescription>
                        <CompanyForm
                            key={editingCompany?.id || 'new'}
                            companyId={editingCompany?.id}
                            onSuccess={handleSuccess}
                            onCancel={() => setIsDialogOpen(false)}
                        />
                    </DialogContent>
                </Dialog>

                {/* ── Content ─────────────────────── */}
                {isLoading ? (
                    <div style={{ textAlign: "center", padding: "60px 0" }}>
                        <div style={{
                            width: 40, height: 40, border: `3px solid ${T.border}`,
                            borderTopColor: T.primary, borderRadius: 99,
                            margin: "0 auto 16px", animation: "spin 0.8s linear infinite",
                        }} />
                        <p style={{ fontSize: 14, fontWeight: 500, color: T.text3 }}>Carregando empresas...</p>
                        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                    </div>
                ) : companiesError ? (
                    <div style={{
                        ...cardBase, textAlign: "center", padding: 48,
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
                    }}>
                        <Building2 size={48} strokeWidth={1} color={T.border} />
                        <p style={{ fontSize: 15, fontWeight: 600, color: T.text1 }}>Nao foi possivel carregar as empresas.</p>
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                padding: "8px 20px", borderRadius: 8, border: `1px solid ${T.primary}`,
                                background: "transparent", color: T.primary, fontFamily: FONT,
                                fontSize: 13, fontWeight: 600, cursor: "pointer",
                            }}
                        >
                            Tentar novamente
                        </button>
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{
                        ...cardBase, textAlign: "center", padding: 48,
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
                    }}>
                        <Building2 size={48} strokeWidth={1} color={T.border} />
                        <p style={{ fontSize: 15, fontWeight: 600, color: T.text1 }}>
                            {search ? "Nenhuma empresa encontrada" : "Nenhuma empresa cadastrada"}
                        </p>
                        {!search && (
                            <button
                                onClick={() => setIsDialogOpen(true)}
                                style={{
                                    padding: "8px 20px", borderRadius: 8, border: "none",
                                    background: T.primary, color: "#fff", fontFamily: FONT,
                                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                                }}
                            >
                                Cadastrar Primeira Empresa
                            </button>
                        )}
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {filtered.map((company) => {
                            const hasChart = companiesWithCharts.has(company.id);
                            return (
                                <div
                                    key={company.id}
                                    style={{
                                        ...cardBase,
                                        borderLeft: `4px solid ${hasChart ? T.green : T.amber}`,
                                        cursor: "pointer",
                                        transition: "background 0.15s ease, box-shadow 0.15s ease",
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = T.hover; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = T.card; }}
                                    onClick={() => navigate(`/empresas/${company.id}`)}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                        {/* Icon */}
                                        <div style={{
                                            width: 48, height: 48, borderRadius: 12,
                                            background: hasChart ? T.greenLt : T.amberLt,
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            flexShrink: 0,
                                        }}>
                                            <Building2 size={22} strokeWidth={1.5} color={hasChart ? T.green : T.amber} />
                                        </div>

                                        {/* Info */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                                                <h3 style={{
                                                    fontSize: 18, fontWeight: 400, color: "#000",
                                                    fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.02em",
                                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                                                }}>
                                                    {company.razao_social.toUpperCase()}
                                                </h3>
                                                {/* Status badge */}
                                                {hasChart ? (
                                                    <span style={{
                                                        display: "inline-flex", alignItems: "center", gap: 4,
                                                        padding: "2px 10px", borderRadius: 9999,
                                                        background: T.greenLt, fontSize: 11, fontWeight: 500, color: T.green,
                                                    }}>
                                                        <div style={{ width: 6, height: 6, borderRadius: 99, background: T.green }} />
                                                        Configurado
                                                    </span>
                                                ) : (
                                                    <span style={{
                                                        display: "inline-flex", alignItems: "center", gap: 4,
                                                        padding: "2px 10px", borderRadius: 9999,
                                                        background: T.amberLt, fontSize: 11, fontWeight: 500, color: T.amber,
                                                    }}>
                                                        <div style={{ width: 6, height: 6, borderRadius: 99, background: T.amber }} />
                                                        Pendente
                                                    </span>
                                                )}
                                            </div>
                                            {company.nome_fantasia && company.nome_fantasia !== company.razao_social && (
                                                <p style={{ fontSize: 12, color: T.text3, marginBottom: 6 }}>
                                                    {company.nome_fantasia}
                                                </p>
                                            )}
                                            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                                                {company.cnpj && (
                                                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                        <FileText size={12} strokeWidth={1.3} color={T.text3} />
                                                        <span style={{ fontSize: 12, color: T.text2, fontVariantNumeric: "tabular-nums" }}>
                                                            {maskCNPJ(company.cnpj)}
                                                        </span>
                                                    </div>
                                                )}
                                                {company.email && (
                                                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                        <Mail size={12} strokeWidth={1.3} color={T.text3} />
                                                        <span style={{ fontSize: 12, color: T.text2 }}>{company.email}</span>
                                                    </div>
                                                )}
                                                {company.endereco_cidade && (
                                                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                        <MapPin size={12} strokeWidth={1.3} color={T.text3} />
                                                        <span style={{ fontSize: 12, color: T.text2 }}>
                                                            {company.endereco_cidade}
                                                            {company.endereco_estado ? ` ${company.endereco_estado}` : ""}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleEdit(company); }}
                                                style={{
                                                    width: 36, height: 36, borderRadius: 8, border: "none",
                                                    background: "transparent", cursor: "pointer",
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    transition: "background 0.15s ease",
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.background = T.primaryLt; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                                                title="Editar"
                                            >
                                                <Pencil size={16} strokeWidth={1.5} color={T.primary} />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDelete(company); }}
                                                style={{
                                                    width: 36, height: 36, borderRadius: 8, border: "none",
                                                    background: "transparent", cursor: "pointer",
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    transition: "background 0.15s ease",
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.background = T.redLt; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                                                title="Remover"
                                            >
                                                <Trash2 size={16} strokeWidth={1.5} color={T.red} />
                                            </button>
                                            <ChevronRight size={18} strokeWidth={1.5} color={T.text3} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}

/* ── Shared card base ────────────────────────── */
const cardBase = {
    background: "#ffffff",
    borderRadius: 14,
    padding: 20,
    border: `1px solid #e2e8f0`,
} as const;
