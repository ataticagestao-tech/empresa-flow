import {
  Building2,
  Users,
  Truck,
  Tags,
  Wallet,
  LayoutDashboard,
  FileText,
  CreditCard,
  ArrowLeftRight,
  ArrowDownCircle,
  ArrowUpCircle,
  Package,
  Settings,
  LogOut,
  Book,
  Shield,
  LucideIcon
} from "lucide-react";

export interface MenuItem {
  titleKey: string;
  icon: LucideIcon;
  url?: string;
  action?: 'logout' | 'none';
  isHardcoded?: boolean; // Para títulos sem tradução ainda
  hidden?: boolean; // Oculta do menu (ex.: CRM desabilitado temporariamente)
  adminOnly?: boolean; // Apenas visível para super admin
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
      {
        titleKey: 'menu.dashboard',
        icon: LayoutDashboard,
        url: '/dashboard'
      }
    ]
  },
  {
    id: 'cadastros',
    labelKey: 'Cadastros', // Hardcoded pois no original era string direta "Cadastros"
    isHardcodedLabel: true,
    items: [
      { titleKey: 'menu.companies', icon: Building2, url: '/empresas' },
      { titleKey: 'menu.clients', icon: Users, url: '/clientes' },
      { titleKey: 'Funcionários', icon: Users, url: '/funcionarios', isHardcoded: true },
      { titleKey: 'WhatsApp', icon: Users, url: '/whatsapp', isHardcoded: true, hidden: true },
      { titleKey: 'CRM', icon: Building2, url: '/crm', isHardcoded: true, hidden: true },
      { titleKey: 'menu.suppliers', icon: Truck, url: '/fornecedores' },
      { titleKey: 'menu.categories', icon: Tags, url: '/categorias' },
      { titleKey: 'menu.bank_accounts', icon: Wallet, url: '/contas-bancarias' }
    ]
  },
  {
    id: 'financeiro',
    labelKey: 'menu.finance',
    items: [
      { titleKey: 'Visão Geral', icon: LayoutDashboard, url: '/financeiro', isHardcoded: true },
      { titleKey: 'menu.payables', icon: ArrowDownCircle, url: '/contas-pagar' },
      { titleKey: 'menu.receivables', icon: ArrowUpCircle, url: '/contas-receber' },
      { titleKey: 'Movimentações', icon: ArrowLeftRight, url: '/movimentacoes', isHardcoded: true },
      { titleKey: 'menu.receipts', icon: FileText, url: '/recibos' },
      { titleKey: 'menu.reconciliation', icon: CreditCard, url: '/conciliacao' }
    ]
  },
  {
    id: 'operacional',
    labelKey: 'menu.operational',
    items: [
      { titleKey: 'menu.operational', icon: Package, url: '/operacional', adminOnly: true },
      { titleKey: 'Usuários', icon: Shield, url: '/admin/usuarios', isHardcoded: true, adminOnly: true }
    ]
  },
  {
    id: 'relatorios',
    labelKey: 'menu.reports',
    items: [
      { titleKey: 'menu.reports', icon: FileText, url: '/relatorios' }
    ]
  }
];

export const footerMenu: MenuItem[] = [
  { titleKey: 'menu.settings', icon: Settings, url: '/configuracoes', adminOnly: true },
  { titleKey: 'menu.help', icon: Book, url: '/ajuda' },
  { titleKey: 'menu.logout', icon: LogOut, action: 'logout' }
];
