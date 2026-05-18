import { Link } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Banknote,
  FileText,
  Calculator,
  Calendar,
  Upload,
  TrendingUp,
  Scale,
  ArrowLeftRight,
  Briefcase,
  Receipt,
  type LucideIcon,
} from "lucide-react";

type ReportCard = {
  title: string;
  description: string;
  url: string;
  icon: LucideIcon;
};

const monthlyReports: ReportCard[] = [
  {
    title: "Extrato Reconciliado",
    description:
      "Movimentação bancária do mês com vínculos a CR/CP. Exporta em Excel (CSV) já filtrado por conciliadas.",
    url: "/extrato-reconciliado",
    icon: Banknote,
  },
  {
    title: "DRE Gerencial",
    description: "Resultado do mês por categoria (receitas, custos e despesas).",
    url: "/dre",
    icon: TrendingUp,
  },
  {
    title: "DRE Contábil",
    description: "Demonstrativo de resultado em formato contábil.",
    url: "/demonstrativos/dre",
    icon: TrendingUp,
  },
  {
    title: "Balanço Patrimonial",
    description: "Ativo, passivo e patrimônio líquido na data de corte.",
    url: "/demonstrativos/bp",
    icon: Scale,
  },
  {
    title: "Fluxo de Caixa",
    description: "Entradas e saídas por regime de caixa.",
    url: "/demonstrativos/dfc",
    icon: ArrowLeftRight,
  },
  {
    title: "Apuração de Impostos",
    description: "Bases e valores apurados de impostos do período.",
    url: "/apuracao-impostos",
    icon: Calculator,
  },
  {
    title: "Notas Fiscais",
    description: "Notas emitidas e recebidas — base para a contabilidade fiscal.",
    url: "/notas-fiscais",
    icon: FileText,
  },
  {
    title: "Folha de Pagamento",
    description: "Folha mensal, encargos e provisões.",
    url: "/folha-pagamento",
    icon: Briefcase,
  },
  {
    title: "Calendário Fiscal",
    description: "Próximas obrigações e vencimentos do período.",
    url: "/calendario-fiscal",
    icon: Calendar,
  },
  {
    title: "Importação XML",
    description: "Subir XMLs de NF-e/NFS-e que o contador enviou para registro.",
    url: "/importacao-xml",
    icon: Upload,
  },
];

export default function AreaContador() {
  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-[#1D2939]">
            <Receipt size={20} />
            <h1 className="text-xl font-semibold">Área do Contador</h1>
          </div>
          <p className="text-sm text-gray-500 max-w-2xl">
            Atalho para os relatórios mais pedidos pela contabilidade. Cada item
            abre a tela correspondente, onde você seleciona o período e exporta
            o arquivo.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {monthlyReports.map((r) => {
            const Icon = r.icon;
            return (
              <Link key={r.url} to={r.url} className="block group">
                <Card className="h-full border-[#E5E7EB] hover:border-[#059669] transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2 text-[#1D2939] group-hover:text-[#059669] transition-colors">
                      <Icon size={18} />
                      <CardTitle className="text-base font-semibold">
                        {r.title}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {r.description}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
