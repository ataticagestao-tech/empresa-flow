import {
  Building2,
  Users,
  Truck,
  Wallet,
  LayoutDashboard,
  FileText,
  ArrowLeftRight,
  ArrowDownCircle,
  ArrowUpCircle,
  Package,
  Settings,
  LogOut,
  Book,
  Shield,
  TrendingUp,
  Calculator,
  DollarSign,
  GitBranch,
  Network,
  ShoppingCart,
  ClipboardList,
  Layers,
  Percent,
  TableProperties,
  Target,
  Bell,
  Upload,
  Clock,
  GitMerge,
  CheckSquare,
  CreditCard,
  Archive,
  Receipt,
  Briefcase,
  Palmtree,
  UserPlus,
  Banknote,
  MessageCircle,
  LayoutGrid,
  LucideIcon
} from "lucide-react";
import type { ModuleId } from "@/config/entitlements";

export const OWNER_EMAIL = 'izabelvier@outlook.com';

export interface MenuItem {
  titleKey: string;
  icon: LucideIcon;
  url?: string;
  action?: 'logout' | 'none';
  isHardcoded?: boolean;
  hidden?: boolean;
  adminOnly?: boolean;
  ownerOnly?: boolean;
  /** Módulo da modularização por pacote. Ausente = herda do grupo (ou 'core' = sempre liberado). */
  module?: ModuleId;
  /** Sub-itens em cascata. Se preenchido, o item vira um submenu (abre outro menu ao lado). */
  children?: MenuItem[];
}

export interface MenuGroup {
  id: string;
  labelKey?: string;
  icon?: LucideIcon;
  items: MenuItem[];
  isHardcodedLabel?: boolean;
  ownerOnly?: boolean;
  /** Módulo da modularização por pacote que libera este grupo inteiro. Ausente = 'core'. */
  module?: ModuleId;
  /** Título da seção sob a qual o grupo aparece. Grupos sem section ficam soltos no topo. */
  section?: string;
}

export const menuGroups: MenuGroup[] = [
  // Dashboard = guarda-chuva da visão de topo: Visão Geral + Indicadores + Multi-empresa (subcategorias)
  {
    id: 'dashboard',
    labelKey: 'menu.dashboard',
    icon: LayoutDashboard,
    items: [
      { titleKey: 'Visão Geral', icon: LayoutDashboard, url: '/dashboard', isHardcoded: true },
      { titleKey: 'Indicadores', icon: TrendingUp, url: '/indicadores', isHardcoded: true },
      { titleKey: 'Multi-empresa', icon: GitMerge, url: '/multiempresa', isHardcoded: true, module: 'multiempresa' },
    ]
  },
  // ① CADASTRAR — configura uma vez e reutiliza no sistema todo
  {
    id: 'cadastros',
    labelKey: 'Cadastros',
    icon: ClipboardList,
    isHardcodedLabel: true,
    section: 'Cadastrar',
    items: [
      { titleKey: 'Central de Cadastros', icon: LayoutGrid, url: '/cadastros', isHardcoded: true },
      { titleKey: 'menu.companies', icon: Building2, url: '/empresas' },
      { titleKey: 'Pessoas', icon: Users, isHardcoded: true, children: [
        { titleKey: 'Clientes', icon: Users, url: '/clientes', isHardcoded: true },
        { titleKey: 'Fornecedores', icon: Truck, url: '/fornecedores', isHardcoded: true },
        { titleKey: 'Funcionários', icon: Users, url: '/funcionarios', isHardcoded: true },
      ] },
      { titleKey: 'Contábil', icon: Book, isHardcoded: true, children: [
        { titleKey: 'Plano de Contas', icon: Book, url: '/plano-contas', isHardcoded: true },
        { titleKey: 'Centros de Custo', icon: Network, url: '/centros-custo', isHardcoded: true },
        { titleKey: 'menu.bank_accounts', icon: Wallet, url: '/contas-bancarias' },
      ] },
      { titleKey: 'Produtos & Departamentos', icon: Package, url: '/operacional', isHardcoded: true },
    ]
  },
  // Precificação logo depois dos cadastros (configura custos e preços)
  {
    id: 'precificacao',
    labelKey: 'Precificação',
    icon: Target,
    isHardcodedLabel: true,
    module: 'precificacao',
    section: 'Cadastrar',
    items: [
      { titleKey: 'Ficha Técnica', icon: ClipboardList, url: '/ficha-tecnica', isHardcoded: true },
      { titleKey: 'Composição de Custo', icon: Layers, url: '/composicao-custo', isHardcoded: true },
      { titleKey: 'Margem de Desconto', icon: Percent, url: '/margens-desconto', isHardcoded: true },
      { titleKey: 'Tabela de Preços', icon: TableProperties, url: '/tabela-precos', isHardcoded: true },
      { titleKey: 'Markup', icon: Target, url: '/markup-simulador', isHardcoded: true },
    ]
  },
  // ② OPERAR — o dia a dia (lançar, emitir, gerir)
  {
    id: 'financeiro',
    labelKey: 'menu.finance',
    icon: DollarSign,
    section: 'Operar (dia a dia)',
    items: [
      { titleKey: 'Vendas', icon: ShoppingCart, url: '/vendas', isHardcoded: true },
      { titleKey: 'Comissões', icon: Percent, url: '/comissoes', isHardcoded: true },
      { titleKey: 'menu.receivables', icon: ArrowUpCircle, url: '/contas-receber' },
      { titleKey: 'menu.payables', icon: ArrowDownCircle, url: '/contas-pagar' },
      { titleKey: 'menu.receipts', icon: FileText, url: '/recibos' },
      { titleKey: 'Cobrança Asaas', icon: Banknote, url: '/configuracoes/asaas', isHardcoded: true },
      { titleKey: 'Movimentações', icon: ArrowLeftRight, url: '/movimentacoes', isHardcoded: true, ownerOnly: true },
    ]
  },
  {
    id: 'fiscal',
    labelKey: 'Fiscal',
    icon: Receipt,
    isHardcodedLabel: true,
    module: 'fiscal',
    section: 'Operar (dia a dia)',
    items: [
      { titleKey: 'Area do Contador', icon: Briefcase, url: '/area-contador', isHardcoded: true },
      { titleKey: 'NFSe', icon: Receipt, isHardcoded: true, children: [
        { titleKey: 'Emissao NFSe', icon: Receipt, url: '/nfse', isHardcoded: true },
        { titleKey: 'Config NFSe', icon: Settings, url: '/configuracoes/nfse', isHardcoded: true },
      ] },
      { titleKey: 'Previsao de Impostos', icon: Calculator, url: '/previsao-impostos', isHardcoded: true },
      { titleKey: 'Importacao XML', icon: Upload, url: '/importacao-xml', isHardcoded: true },
    ]
  },
  {
    id: 'rh',
    labelKey: 'RH & Folha',
    icon: Briefcase,
    isHardcodedLabel: true,
    module: 'rh',
    section: 'Operar (dia a dia)',
    // Ordem segue o fluxo de lançamento: vínculos → ponto → ausências → folha → encargos
    items: [
      { titleKey: 'Admissoes e Demissoes', icon: UserPlus, url: '/admissoes-demissoes', isHardcoded: true },
      { titleKey: 'Ponto Eletronico', icon: Clock, url: '/ponto-eletronico', isHardcoded: true },
      { titleKey: 'Ferias e Afastamentos', icon: Palmtree, url: '/ferias-afastamentos', isHardcoded: true },
      { titleKey: 'Folha de Pagamento', icon: Briefcase, url: '/folha-pagamento', isHardcoded: true },
      { titleKey: 'Encargos', icon: Calculator, url: '/encargos', isHardcoded: true },
    ]
  },
  {
    id: 'estoque',
    labelKey: 'Estoque',
    icon: Package,
    isHardcodedLabel: true,
    module: 'estoque',
    section: 'Operar (dia a dia)',
    items: [
      { titleKey: 'Estoque', icon: Package, url: '/estoque', isHardcoded: true },
      { titleKey: 'Ordens de Compra', icon: ShoppingCart, url: '/ordens-compra', isHardcoded: true },
      { titleKey: 'Inventário', icon: ClipboardList, url: '/inventario', isHardcoded: true },
    ]
  },
  // ③ CONCILIAR — bater com o banco e cobrar
  {
    id: 'conciliar',
    labelKey: 'Conciliação',
    icon: CheckSquare,
    isHardcodedLabel: true,
    section: 'Conciliar',
    items: [
      { titleKey: 'Conciliação Bancária', icon: CheckSquare, url: '/conciliacao', isHardcoded: true },
      { titleKey: 'Recebíveis de Cartão', icon: CreditCard, url: '/recebiveis-cartao', isHardcoded: true },
      { titleKey: 'Régua de Cobrança', icon: Bell, url: '/regua-cobranca', isHardcoded: true, module: 'cobranca' },
    ]
  },
  // ④ ANALISAR — fechar o mês e entender os números.
  // Projeção é SUBCATEGORIA de Análise: vira um submenu em cascata dentro do grupo.
  {
    id: 'analise',
    labelKey: 'Análise',
    icon: FileText,
    isHardcodedLabel: true,
    section: 'Analisar',
    items: [
      { titleKey: 'DRE', icon: FileText, url: '/dre', isHardcoded: true },
      { titleKey: 'Fluxo de Caixa', icon: Banknote, url: '/demonstrativos/dfc', isHardcoded: true },
      { titleKey: 'Relatórios', icon: FileText, url: '/relatorios', isHardcoded: true, module: 'relatorios' },
      { titleKey: 'Projeção', icon: TrendingUp, isHardcoded: true, module: 'projecao', children: [
        { titleKey: 'Fluxo de Caixa Projetado', icon: TrendingUp, url: '/fluxo-caixa-projetado', isHardcoded: true },
        { titleKey: 'Orçamento', icon: Calculator, url: '/orcamento', isHardcoded: true },
        { titleKey: 'Previsão de Receitas', icon: DollarSign, url: '/previsao-receitas', isHardcoded: true },
        { titleKey: 'Cenários', icon: GitBranch, url: '/cenarios', isHardcoded: true },
      ] },
    ]
  },
  {
    id: 'admin',
    labelKey: 'Administração',
    icon: Shield,
    isHardcodedLabel: true,
    ownerOnly: true,
    section: 'Sistema',
    items: [
      { titleKey: 'Dados da Tática', icon: Building2, url: '/admin/tatica', isHardcoded: true, adminOnly: true },
      { titleKey: 'Planos dos Clientes', icon: Package, url: '/admin/planos', isHardcoded: true, adminOnly: true },
      { titleKey: 'Equipe', icon: UserPlus, url: '/equipe', isHardcoded: true },
      { titleKey: 'Usuários', icon: Shield, url: '/admin/usuarios', isHardcoded: true, adminOnly: true },
      { titleKey: 'WhatsApp Autorizados', icon: Shield, url: '/admin/whatsapp-autorizados', isHardcoded: true, adminOnly: true },
      { titleKey: 'WhatsApp Inbox', icon: MessageCircle, url: '/admin/whatsapp-inbox', isHardcoded: true, adminOnly: true },
      { titleKey: 'Log de Atividades', icon: Shield, url: '/admin/log-atividades', isHardcoded: true, adminOnly: true },
      { titleKey: 'Lançamentos Arquivados', icon: Archive, url: '/lancamentos-arquivados', isHardcoded: true, adminOnly: true },
    ]
  },
];

/**
 * Placas orientativas por grupo — frase curta exibida sob o rótulo na sidebar,
 * dizendo o que o usuário faz naquela etapa. Chave = id do grupo.
 */
export const GROUP_HINTS: Record<string, string> = {
  cadastros: 'configure uma vez e reutilize',
  financeiro: 'lance vendas, contas e recibos',
  fiscal: 'emita notas e cuide dos impostos',
  rh: 'admita, registre ponto e pague a folha',
  estoque: 'produtos, compras e inventário',
  precificacao: 'monte custos e preços',
  conciliar: 'bata o sistema com o banco',
  analise: 'feche o mês e leia os números',
  projecao: 'projete o caixa e planeje',
  multiempresa: 'consolide o grupo',
  admin: 'usuários, planos e configurações',
};

export const footerMenu: MenuItem[] = [
  { titleKey: 'menu.settings', icon: Settings, url: '/configuracoes', adminOnly: true },
  { titleKey: 'menu.help', icon: Book, url: '/ajuda' },
  { titleKey: 'menu.logout', icon: LogOut, action: 'logout' }
];

/**
 * Descobre o módulo da rota atual percorrendo o menuConfig, casando o caminho
 * mais específico (maior URL prefixo). Item sem `module` herda do pai/grupo.
 * Retorna undefined quando a rota não está no menu (ex.: /checkout) → não gateada.
 */
export function findModuleForPath(pathname: string): ModuleId | undefined {
  let best: { len: number; module?: ModuleId } | null = null;

  const consider = (url: string | undefined, mod: ModuleId | undefined) => {
    if (!url) return;
    if (pathname === url || pathname.startsWith(url + '/')) {
      if (!best || url.length > best.len) best = { len: url.length, module: mod };
    }
  };

  for (const group of menuGroups) {
    for (const item of group.items) {
      const itemMod = item.module ?? group.module;
      consider(item.url, itemMod);
      for (const child of item.children ?? []) {
        consider(child.url, child.module ?? itemMod);
      }
    }
  }

  return best?.module;
}
