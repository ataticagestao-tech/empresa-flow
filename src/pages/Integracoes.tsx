import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { Badge } from "@/components/ui/badge";
import {
    Plug, CheckCircle2, XCircle, Clock, Shield, Lock, ArrowRight, Loader2,
} from "lucide-react";

// ═════════════════════════════════════════════════════════════
// Catálogo de integrações
// Tiers:
//  - configuravel: tem tela de config real; clicar navega para `route`. `statusSource` = tabela lida.
//  - gerenciado: funciona via secret global (não por empresa); sem formulário, só informativo.
//  - em_breve: sem backend que consuma a credencial; exibido de-enfatizado, não clicável.
// ═════════════════════════════════════════════════════════════
type IntegracaoTier = "configuravel" | "gerenciado" | "em_breve";
interface IntegracaoCatalogItem {
    label: string;
    desc: string;
    tier: IntegracaoTier;
    route?: string;
    statusSource?: "asaas" | "nfse";
}
const INTEGRACOES_CATALOG: Record<string, IntegracaoCatalogItem> = {
    // Disponíveis — telas reais já existentes
    asaas: { label: "Asaas", desc: "Cobranças por Pix e boleto", tier: "configuravel", route: "/configuracoes/asaas", statusSource: "asaas" },
    focus_nfe: { label: "NFS-e (Focus)", desc: "Emissão de notas de serviço", tier: "configuravel", route: "/configuracoes/nfse", statusSource: "nfse" },
    // Gerenciadas globalmente
    resend: { label: "Resend", desc: "Envio de e-mails transacionais", tier: "gerenciado" },
    evolution_api: { label: "WhatsApp", desc: "Mensagens e avisos automáticos", tier: "gerenciado" },
    // Em breve — ainda sem backend
    sefaz: { label: "SEFAZ", desc: "Notas fiscais eletrônicas", tier: "em_breve" },
    prefeitura_nfse: { label: "Prefeitura NFS-e", desc: "Notas de serviço", tier: "em_breve" },
    enotas: { label: "eNotas", desc: "Gateway de notas fiscais", tier: "em_breve" },
    nuvem_fiscal: { label: "Nuvem Fiscal", desc: "Plataforma fiscal", tier: "em_breve" },
    pluggy: { label: "Pluggy", desc: "Open finance — extrato automático", tier: "em_breve" },
    belvo: { label: "Belvo", desc: "Open finance", tier: "em_breve" },
    stripe: { label: "Stripe", desc: "Pagamentos internacionais", tier: "em_breve" },
    d4sign: { label: "D4Sign", desc: "Assinatura digital", tier: "em_breve" },
    clicksign: { label: "Clicksign", desc: "Assinatura eletrônica", tier: "em_breve" },
};

const ambienteLabel = (a?: string | null) =>
    a === "producao" ? "Produção" : a === "sandbox" ? "Teste" : a === "homologacao" ? "Homologação" : "";

type IntegStatus = { state: "ativo" | "configurando" | "none"; ambiente?: string | null };

function deriveIntegStatus(
    source: IntegracaoCatalogItem["statusSource"],
    data: { asaas: any; nfse: any } | null | undefined,
): IntegStatus {
    if (source === "asaas") {
        const c = data?.asaas;
        if (!c) return { state: "none" };
        const temChave = !!c.api_key_producao || !!c.api_key_sandbox;
        if (temChave && c.ativo) return { state: "ativo", ambiente: c.ambiente };
        return { state: "configurando", ambiente: c.ambiente };
    }
    if (source === "nfse") {
        const c = data?.nfse;
        if (!c) return { state: "none" };
        const temToken = !!c.token_producao || !!c.token_homologacao;
        if (temToken && c.ativo) return { state: "ativo", ambiente: c.ambiente };
        return { state: "configurando", ambiente: c.ambiente };
    }
    return { state: "none" };
}

// ═════════════════════════════════════════════════════════════
// Página
// ═════════════════════════════════════════════════════════════
export default function Integracoes() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const navigate = useNavigate();

    // Lê o status REAL das integrações que já têm tela/backend (Asaas, NFS-e).
    const { data: status, isLoading } = useQuery({
        queryKey: ["integracoes-status", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return { asaas: null, nfse: null };
            const db = activeClient as any;
            const [asaasRes, nfseRes] = await Promise.all([
                db.from("asaas_configuracoes")
                    .select("ativo, ambiente, api_key_producao, api_key_sandbox")
                    .eq("company_id", selectedCompany.id).maybeSingle(),
                db.from("nfse_configuracoes")
                    .select("ativo, ambiente, token_producao, token_homologacao")
                    .eq("company_id", selectedCompany.id).maybeSingle(),
            ]);
            return { asaas: asaasRes.data || null, nfse: nfseRes.data || null };
        },
        enabled: !!selectedCompany?.id,
    });

    const grupos = useMemo(() => {
        const items = Object.entries(INTEGRACOES_CATALOG).map(([key, info]) => ({ key, ...info }));
        return {
            configuravel: items.filter((i) => i.tier === "configuravel"),
            gerenciado: items.filter((i) => i.tier === "gerenciado"),
            em_breve: items.filter((i) => i.tier === "em_breve"),
        };
    }, []);

    const renderCard = (integ: { key: string } & IntegracaoCatalogItem) => {
        if (integ.tier === "configuravel") {
            const st = deriveIntegStatus(integ.statusSource, status);
            const amb = ambienteLabel(st.ambiente);
            return (
                <button
                    key={integ.key}
                    onClick={() => integ.route && navigate(integ.route)}
                    className="group text-left rounded-lg border p-4 bg-white transition-all hover:border-gray-300 hover:shadow-sm"
                >
                    <div className="flex items-start justify-between">
                        <div>
                            <h4 className="text-[13px] font-semibold">{integ.label}</h4>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{integ.desc}</p>
                        </div>
                        {st.state === "ativo"
                            ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            : st.state === "configurando"
                                ? <Clock className="h-4 w-4 text-amber-500" />
                                : <XCircle className="h-4 w-4 text-gray-300" />}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                            {st.state === "ativo" && (
                                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[11px]">Ativo</Badge>
                            )}
                            {st.state === "configurando" && (
                                <Badge variant="secondary" className="text-[11px]">Configurando</Badge>
                            )}
                            {st.state === "none" && (
                                <span className="text-[11px] text-muted-foreground">Não configurado</span>
                            )}
                            {amb && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{amb}</span>
                            )}
                        </div>
                        <span className="text-[11px] font-medium text-blue-600 inline-flex items-center gap-0.5 transition-all group-hover:gap-1.5">
                            {st.state === "none" ? "Configurar" : "Gerenciar"}
                            <ArrowRight className="h-3 w-3" />
                        </span>
                    </div>
                </button>
            );
        }

        if (integ.tier === "gerenciado") {
            return (
                <div
                    key={integ.key}
                    title="Gerenciado pelo sistema — fale com o suporte para ajustar."
                    className="rounded-lg border p-4 bg-white"
                >
                    <div className="flex items-start justify-between">
                        <div>
                            <h4 className="text-[13px] font-semibold">{integ.label}</h4>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{integ.desc}</p>
                        </div>
                        <Shield className="h-4 w-4 text-gray-400" />
                    </div>
                    <div className="mt-3">
                        <Badge variant="outline" className="text-[11px]">Gerenciado pelo sistema</Badge>
                    </div>
                </div>
            );
        }

        // em_breve
        return (
            <div key={integ.key} className="rounded-lg border p-4 bg-muted/30 opacity-60">
                <div className="flex items-start justify-between">
                    <div>
                        <h4 className="text-[13px] font-semibold">{integ.label}</h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{integ.desc}</p>
                    </div>
                    <Lock className="h-4 w-4 text-gray-300" />
                </div>
                <div className="mt-3">
                    <Badge variant="outline" className="text-[11px] text-muted-foreground">Em breve</Badge>
                </div>
            </div>
        );
    };

    const secoes = [
        { titulo: "Disponíveis", subtitulo: "Prontas para uso — clique para configurar.", items: grupos.configuravel },
        { titulo: "Gerenciadas pelo sistema", subtitulo: "Já ativas globalmente; ajustes pelo suporte.", items: grupos.gerenciado },
        { titulo: "Em breve", subtitulo: "Ainda não disponíveis para configuração.", items: grupos.em_breve },
    ];

    return (
        <AppLayout title="Integrações">
            <div className="animate-fade-in">
                <PagePanel
                    title="Integrações"
                    subtitle="Conecte serviços externos a esta empresa. Clique numa integração disponível para configurar."
                >
                    <div className="space-y-6 pt-2">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                            </div>
                        ) : (
                            secoes.map((sec) => sec.items.length === 0 ? null : (
                                <div key={sec.titulo} className="space-y-2">
                                    <div className="flex items-center gap-2.5">
                                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#071D41]/5 text-[#071D41]">
                                            <Plug className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <h3 className="text-[12px] font-semibold text-gray-700">{sec.titulo}</h3>
                                            <p className="text-[11px] text-muted-foreground">{sec.subtitulo}</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {sec.items.map(renderCard)}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </PagePanel>
            </div>
        </AppLayout>
    );
}
