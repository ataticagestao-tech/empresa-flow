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
  FolderOpen,
  Upload,
  Clock,
  GitMerge,
  CheckSquare,
  Calendar,
  Receipt,
  Briefcase,
  Palmtree,
  UserPlus,
  BarChart3,
  Scale,
  Banknote,
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
      { titleKey: 'Clientes', icon: Users, url: '/clientes', isHardcoded: true },
      { titleKey: 'menu.bank_accounts', icon: Wallet, url: '/contas-bancarias' },
      { titleKey: 'Centros de Custo', icon: Network, url: '/centros-custo', isHardcoded: true },
      { titleKey: 'Operacional', icon: Package, url: '/operacional', isHardcoded: true },
    ]
  },
  {
    id: 'financeiro',
    labelKey: 'menu.finance',
    items: [
      { titleKey: 'Painel Gerencial', icon: BarChart3, url: '/painel-gerencial', isHardcoded: true },
      { titleKey: 'Vendas', icon: ShoppingCart, url: '/vendas', isHardcoded: true },
      { titleKey: 'menu.receivables', icon: ArrowUpCircle, url: '/contas-receber' },
      { titleKey: 'menu.payables', icon: ArrowDownCircle, url: '/contas-pagar' },
      { titleKey: 'menu.receipts', icon: FileText, url: '/recibos' },
      { titleKey: 'Movimentações', icon: ArrowLeftRight, url: '/movimentacoes', isHardcoded: true },
      { titleKey: 'Extrato Reconciliado', icon: CheckSquare, url: '/extrato-reconciliado', isHardcoded: true },
      { titleKey: 'DRE', icon: FileText, url: '/dre', isHardcoded: true },
      { titleKey: 'DRE Contábil', icon: BarChart3, url: '/demonstrativos/dre', isHardcoded: true },
      { titleKey: 'Balanço Patrimonial', icon: Scale, url: '/demonstrativos/bp', isHardcoded: true },
      { titleKey: 'Fluxo de Caixa', icon: Banknote, url: '/demonstrativos/dfc', isHardcoded: true },
      { titleKey: 'Relatórios', icon: FileText, url: '/relatorios', isHardcoded: true },
      { titleKey: 'Régua de Cobrança', icon: Bell, url: '/regua-cobranca', isHardcoded: true },
      { titleKey: 'Conciliação Bancária', icon: CheckSquare, url: '/conciliacao', isHardcoded: true },
    ]
  },
  {
    id: 'fiscal',
    labelKey: 'Fiscal',
    isHardcodedLabel: true,
    items: [
      { titleKey: 'Emissao NFSe', icon: Receipt, url: '/nfse', isHardcoded: true },
      { titleKey: 'Notas Fiscais', icon: FileText, url: '/notas-fiscais', isHardcoded: true },
      { titleKey: 'Apuracao de Impostos', icon: Calculator, url: '/apuracao-impostos', isHardcoded: true },
      { titleKey: 'Calendario Fiscal', icon: Calendar, url: '/calendario-fiscal', isHardcoded: true },
      { titleKey: 'Importacao XML', icon: Upload, url: '/importacao-xml', isHardcoded: true },
      { titleKey: 'Config NFSe', icon: Settings, url: '/configuracoes/nfse', isHardcoded: true },
    ]
  },
  {
    id: 'rh',
    labelKey: 'RH & Folha',
    isHardcodedLabel: true,
    items: [
      { titleKey: 'Folha de Pagamento', icon: Briefcase, url: '/folha-pagamento', isHardcoded: true },
      { titleKey: 'Ponto Eletronico', icon: Clock, url: '/ponto-eletronico', isHardcoded: true },
      { titleKey: 'Ferias e Afastamentos', icon: Palmtree, url: '/ferias-afastamentos', isHardcoded: true },
      { titleKey: 'Encargos', icon: Calculator, url: '/encargos', isHardcoded: true },
      { titleKey: 'Admissoes e Demissoes', icon: UserPlus, url: '/admissoes-demissoes', isHardcoded: true },
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
    id: 'estoque',
    labelKey: 'Estoque & Compras',
    isHardcodedLabel: true,
    items: [
      { titleKey: 'Estoque', icon: Package, url: '/estoque', isHardcoded: true },
      { titleKey: 'Ordens de Compra', icon: ShoppingCart, url: '/ordens-compra', isHardcoded: true },
      { titleKey: 'Inventário', icon: ClipboardList, url: '/inventario', isHardcoded: true },
    ]
  },
  {
    id: 'documentos',
    labelKey: 'Documentos',
    isHardcodedLabel: true,
    items: [
      { titleKey: 'Explorador', icon: FolderOpen, url: '/documentos', isHardcoded: true },
      { titleKey: 'Upload', icon: Upload, url: '/documentos/upload', isHardcoded: true },
      { titleKey: 'Vencimentos', icon: Clock, url: '/documentos/vencimentos', isHardcoded: true },
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
    id: 'multiempresa',
    labelKey: 'Multi-empresa',
    isHardcodedLabel: true,
    items: [
      { titleKey: 'Consolidado', icon: GitMerge, url: '/multiempresa', isHardcoded: true },
      { titleKey: 'Transferências', icon: ArrowLeftRight, url: '/multiempresa/transferencias', isHardcoded: true },
      { titleKey: 'Relatórios', icon: FileText, url: '/multiempresa/relatorios', isHardcoded: true },
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
