import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Users,
  Truck,
  UserPlus,
  Book,
  Network,
  Wallet,
  Tags,
  Repeat,
  FileText,
  Package,
  Layers,
  ClipboardList,
  TableProperties,
  Percent,
  Receipt,
  Settings,
  Shield,
  MessageCircle,
  CheckSquare,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/contexts/AdminContext";
import { useEntitlements } from "@/hooks/useEntitlements";
import { OWNER_EMAIL } from "@/config/menuConfig";
import type { ModuleId } from "@/config/entitlements";
import { cn } from "@/lib/utils";

interface CadastroCard {
  title: string;
  description: string;
  url: string;
  icon: LucideIcon;
  /** Módulo do pacote que libera o card. Ausente = sempre liberado (core). */
  module?: ModuleId;
  adminOnly?: boolean;
  ownerOnly?: boolean;
  /** Selo discreto no canto do card (ex.: "Importa planilha"). */
  badge?: string;
}

interface CadastroSection {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  cards: CadastroCard[];
}

/**
 * Catálogo da Central de Cadastros. Único lugar onde o usuário "cadastra
 * qualquer coisa" — reúne todas as telas de dados-mestre que hoje estão
 * espalhadas pelo menu (e as que nem apareciam: Categorias, Contas Fixas,
 * Contratos Recorrentes, Produto×Categoria, Cadastros Pendentes).
 */
const SECTIONS: CadastroSection[] = [
  {
    id: "pessoas",
    title: "Pessoas",
    description: "Quem se relaciona com a empresa",
    icon: Users,
    cards: [
      { title: "Empresas", description: "Dados cadastrais, CNPJ, sócios e documentos", url: "/empresas", icon: Building2 },
      { title: "Clientes", description: "Quem compra de você", url: "/clientes", icon: Users, badge: "Importa planilha" },
      { title: "Fornecedores", description: "Quem você paga", url: "/fornecedores", icon: Truck, badge: "Importa planilha" },
      { title: "Funcionários", description: "Equipe com vínculo na folha", url: "/funcionarios", icon: UserPlus, badge: "Importa planilha" },
    ],
  },
  {
    id: "contabil",
    title: "Plano contábil & financeiro",
    description: "A base que organiza todo o financeiro",
    icon: Book,
    cards: [
      { title: "Plano de Contas", description: "Estrutura contábil de receitas, custos e despesas", url: "/plano-contas", icon: Book },
      { title: "Centros de Custo", description: "Rateie despesas por área, loja ou projeto", url: "/centros-custo", icon: Network },
      { title: "Contas Bancárias", description: "Bancos, caixa e cartões de crédito", url: "/contas-bancarias", icon: Wallet },
      { title: "Categorias", description: "Categorias usadas ao classificar lançamentos", url: "/categorias", icon: Tags },
      { title: "Contas Fixas", description: "Despesas recorrentes (aluguel, salários, assinaturas)", url: "/contas-fixas", icon: Repeat },
      { title: "Contratos Recorrentes", description: "Receitas e serviços que se repetem todo mês", url: "/contratos-recorrentes", icon: FileText },
    ],
  },
  {
    id: "produtos",
    title: "Produtos & preços",
    description: "Catálogo, custos e política de preços",
    icon: Package,
    cards: [
      { title: "Produtos & Departamentos", description: "Catálogo de produtos e serviços por departamento", url: "/operacional", icon: Package },
      { title: "Categoria contábil dos produtos", description: "Vincula cada produto à sua conta no plano", url: "/produtos-categoria", icon: Layers },
      { title: "Ficha Técnica", description: "Composição e insumos de cada produto", url: "/ficha-tecnica", icon: ClipboardList, module: "precificacao" },
      { title: "Composição de Custo", description: "Monte o custo de cada item", url: "/composicao-custo", icon: Layers, module: "precificacao" },
      { title: "Margem de Desconto", description: "Limites de desconto por produto", url: "/margens-desconto", icon: Percent, module: "precificacao" },
      { title: "Tabela de Preços", description: "Preços de venda por tabela", url: "/tabela-precos", icon: TableProperties, module: "precificacao" },
    ],
  },
  {
    id: "fiscal",
    title: "Fiscal",
    description: "Configuração para emissão de notas",
    icon: Receipt,
    cards: [
      { title: "Configuração NFSe", description: "Dados de emissão da nota fiscal de serviço", url: "/configuracoes/nfse", icon: Settings, module: "fiscal" },
    ],
  },
  {
    id: "sistema",
    title: "Sistema & acesso",
    description: "Quem usa e o que entra pelo WhatsApp",
    icon: Shield,
    cards: [
      { title: "Equipe", description: "Pessoas com acesso ao sistema", url: "/equipe", icon: UserPlus },
      { title: "Usuários", description: "Cria, convida e gerencia logins", url: "/admin/usuarios", icon: Shield, adminOnly: true },
      { title: "WhatsApp Autorizados", description: "Números liberados a usar o assistente", url: "/admin/whatsapp-autorizados", icon: MessageCircle, adminOnly: true },
      { title: "Cadastros Pendentes", description: "Aprove cadastros criados pelo WhatsApp", url: "/cadastros-pendentes", icon: CheckSquare },
    ],
  },
];

export default function Cadastros() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isSuperAdmin } = useAdmin();
  const { hasModule } = useEntitlements();

  const isOwner = user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();

  // Mesma regra de visibilidade do menu lateral (AppSidebar): módulo do pacote
  // + adminOnly + ownerOnly. Cards sem permissão simplesmente não aparecem.
  const visibleSections = useMemo(() => {
    const canSee = (c: CadastroCard) =>
      (!c.adminOnly || isSuperAdmin) && (!c.ownerOnly || isOwner) && hasModule(c.module);
    return SECTIONS.map((s) => ({ ...s, cards: s.cards.filter(canSee) })).filter(
      (s) => s.cards.length > 0,
    );
  }, [isSuperAdmin, isOwner, hasModule]);

  return (
    <AppLayout title="Cadastros">
      <div className="animate-fade-in">
        <PagePanel
          title="Central de Cadastros"
          subtitle="Tudo o que você registra uma vez e reutiliza no sistema, num lugar só"
        >
          <div className="space-y-8 pt-2">
            {visibleSections.map((section) => {
              const SectionIcon = section.icon;
              return (
                <section key={section.id} className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#071D41]/5 text-[#071D41]">
                      <SectionIcon className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-[13px] font-bold uppercase tracking-wider text-[#1D2939]">
                        {section.title}
                      </h2>
                      <p className="text-[11px] text-muted-foreground">{section.description}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {section.cards.map((card) => {
                      const CardIcon = card.icon;
                      return (
                        <button
                          key={card.url}
                          type="button"
                          onClick={() => navigate(card.url)}
                          className={cn(
                            "group flex flex-col items-start gap-2 rounded-lg border border-[#EAECF0] bg-white p-4 text-left",
                            "transition-all hover:border-[#071D41]/30 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#071D41]/20",
                          )}
                        >
                          <div className="flex w-full items-start justify-between gap-2">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F2F4F7] text-[#071D41] transition-colors group-hover:bg-[#071D41] group-hover:text-white">
                              <CardIcon className="h-[18px] w-[18px]" />
                            </div>
                            <ArrowRight className="h-4 w-4 shrink-0 text-transparent transition-colors group-hover:text-[#071D41]" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-[#1D2939]">{card.title}</h3>
                            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                              {card.description}
                            </p>
                          </div>
                          {card.badge && (
                            <span className="mt-1 rounded-full bg-[#ECFDF4] px-2 py-0.5 text-[10px] font-semibold text-[#039855]">
                              {card.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </PagePanel>
      </div>
    </AppLayout>
  );
}
