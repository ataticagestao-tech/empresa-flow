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
  ShoppingCart,
  ClipboardList,
  Layers,
  Percent,
  TableProperties,
  Target,
  LucideIcon
} from "lucide-react";

export interface MenuItem {
  titleKey: string;
  icon: LucideIcon;
  url?: string;
  action?: 'logout' | 'none';
  isHardcoded?: boolean;
  hidden?: boolean;
  adminOnly?: boolean;
}

export interface MenuGroup {
  id: string;
  labelKey?: string;
  items: MenuItem[];
  isHardcodedLabel?: boolean;
}

export const menuGroups: MenuGroup[] = [
  {
    id: 'dashboard',
    items: [
      { titleKey: 'menu.dashboard', icon: LayoutDashboard, url: '/dashboard' }
    ]
  },
  {
    id: 'cadastros',
    labelKey: 'Cadastros',
    isHardcodedLabel: true,
    items: [
      { titleKey: 'menu.companies', icon: Building2, url: '/empresas' },
      { titleKey: 'Funcionários', icon: Users, url: '/funcionarios', isHardcoded: true },
      { titleKey: 'Plano de Contas', icon: Book, url: '/plano-contas', isHardcoded: true },
      { titleKey: 'menu.bank_accounts', icon: Wallet, url: '/contas-bancarias' },
      { titleKey: 'Operacional', icon: Package, url: '/operacional', isHardcoded: true },
    ]
  },
  {
    id: 'financeiro',
    labelKey: 'menu.finance',
    items: [
      { titleKey: 'Vendas', icon: ShoppingCart, url: '/vendas', isHardcoded: true },
      { titleKey: 'menu.receivables', icon: ArrowUpCircle, url: '/contas-receber' },
      { titleKey: 'menu.payables', icon: ArrowDownCircle, url: '/contas-pagar' },
      { titleKey: 'menu.receipts', icon: FileText, url: '/recibos' },
      { titleKey: 'Movimentações', icon: ArrowLeftRight, url: '/movimentacoes', isHardcoded: true },
      { titleKey: 'Relatórios', icon: FileText, url: '/relatorios', isHardcoded: true },
    ]
  },
  {
    id: 'projecao',
    labelKey: 'Projeção Financeira',
    isHardcodedLabel: true,
    items: [
      { titleKey: 'Fluxo de Caixa Projetado', icon: TrendingUp, url: '/fluxo-caixa-projetado', isHardcoded: true },
      { titleKey: 'Orçamento', icon: Calculator, url: '/orcamento', isHardcoded: true },
      { titleKey: 'Previsão de Receitas', icon: DollarSign, url: '/previsao-receitas', isHardcoded: true },
      { titleKey: 'Cenários', icon: GitBranch, url: '/cenarios', isHardcoded: true },
    ]
  },
  {
    id: 'precificacao',
    labelKey: 'Precificação',
    isHardcodedLabel: true,
    items: [
      { titleKey: 'Fornecedores', icon: Truck, url: '/fornecedores', isHardcoded: true },
      { titleKey: 'Ficha Técnica', icon: ClipboardList, url: '/ficha-tecnica', isHardcoded: true },
      { titleKey: 'Composição de Custo', icon: Layers, url: '/composicao-custo', isHardcoded: true },
      { titleKey: 'Margem de Desconto', icon: Percent, url: '/margens-desconto', isHardcoded: true },
      { titleKey: 'Tabela de Preços', icon: TableProperties, url: '/tabela-precos', isHardcoded: true },
      { titleKey: 'Markup', icon: Target, url: '/markup-simulador', isHardcoded: true },
    ]
  },
  {
    id: 'admin',
    labelKey: 'Administração',
    isHardcodedLabel: true,
    items: [
      { titleKey: 'Usuários', icon: Shield, url: '/admin/usuarios', isHardcoded: true, adminOnly: true },
    ]
  },
];

export const footerMenu: MenuItem[] = [
  { titleKey: 'menu.settings', icon: Settings, url: '/configuracoes', adminOnly: true },
  { titleKey: 'menu.help', icon: Book, url: '/ajuda' },
  { titleKey: 'menu.logout', icon: LogOut, action: 'logout' }
];
