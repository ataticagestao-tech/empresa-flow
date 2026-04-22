import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Plus,
    FileSpreadsheet,
    List,
    Zap,
    ArrowRightLeft,
    FileText,
    FileInput,
    FileOutput,
    History,
    LayoutDashboard,
    PieChart
} from "lucide-react";
import { Link } from "react-router-dom";

export default function Financeiro() {
    const cardGroups = [
        {
            title: "Resumo",
            type: "menu",
            items: [
                { label: "Resumo", icon: LayoutDashboard, href: "/dashboard" },
                { label: "Previsto x Realizado", icon: PieChart, href: "/relatorios/previsto-realizado" },
                { label: "Painel de Tarefas", icon: List, href: "/tarefas" },
            ]
        },
        {
            title: "Clientes e Fornecedores",
            type: "action",
            items: [
                { label: "Incluir Cliente", icon: Plus, href: "/clientes?new=true", action: true },
                { label: "Importar Planilha", icon: FileSpreadsheet, href: "/clientes/importar" },
                { label: "Exibir Clientes", icon: List, href: "/clientes" },
                { label: "Incluir Fornecedor", icon: Plus, href: "/fornecedores?new=true", action: true },
                { label: "Exibir Fornecedores", icon: List, href: "/fornecedores" },
            ]
        },
        {
            title: "Contas a Pagar",
            type: "action",
            items: [
                { label: "Incluir", icon: Plus, href: "/contas-pagar/nova", action: true },
                { label: "Importar Planilha", icon: FileSpreadsheet, href: "/contas-pagar/importar" },
                { label: "Exibir todas", icon: List, href: "/contas-pagar" },
                { label: "Registrar Pagamentos", icon: Zap, href: "/contas-pagar/pagamentos", highlight: true },
            ]
        },
        {
            title: "Contas a Receber",
            type: "action",
            items: [
                { label: "Incluir", icon: Plus, href: "/contas-receber/nova", action: true },
                { label: "Importar Planilha", icon: FileSpreadsheet, href: "/contas-receber/importar" },
                { label: "Exibir todas", icon: List, href: "/contas-receber" },
                { label: "Registrar Recebimentos", icon: Zap, href: "/contas-receber/recebimentos", highlight: true },
                { label: "Gerar Boleto", icon: Zap, href: "/contas-receber/boletos", highlight: true },
                { label: "Gerar Pix", icon: Zap, href: "/contas-receber/pix", highlight: true },
            ]
        },
        {
            title: "Contas Correntes",
            type: "action",
            items: [
                { label: "Incluir", icon: Plus, href: "/contas-bancarias/nova", action: true },
                { label: "Exibir todas", icon: List, href: "/contas-bancarias" },
            ]
        },
        {
            title: "Movimentação de Contas Correntes",
            type: "action",
            items: [
                { label: "Incluir Lançamento", icon: Plus, href: "/movimentacoes/nova", action: true },
                { label: "Incluir Transferência", icon: Plus, href: "/movimentacoes/transferencia", action: true },
                { label: "Importar Extrato", icon: FileSpreadsheet, href: "/movimentacoes/importar" },
                { label: "Exibir o Extrato das Contas", icon: List, href: "/movimentacoes/extrato" },
            ]
        },
        {
            title: "Integração com o Banco",
            type: "action",
            items: [
                { label: "Gerar Remessa da Cobrança", icon: FileOutput, href: "/integracao/remessa-cobranca", highlight: true },
                { label: "Importar Retorno da Cobrança", icon: FileInput, href: "/integracao/retorno-cobranca" },
                { label: "Gerar Remessa de Pagamentos", icon: FileOutput, href: "/integracao/remessa-pagamento", highlight: true },
                { label: "Importar Retorno de Pagamentos", icon: FileInput, href: "/integracao/retorno-pagamento" },
                { label: "Histórico de Integrações", icon: History, href: "/integracao/historico" },
            ]
        },
        {
            title: "Relatórios",
            type: "report",
            items: [
                { label: "Contas a Pagar em Aberto", href: "/relatorios/contas-pagar-aberto" },
                { label: "Pagamentos Realizados", href: "/relatorios/pagamentos-realizados" },
                { label: "Contas a Receber em Aberto", href: "/relatorios/contas-receber-aberto" },
                { label: "Recebimentos Realizados", href: "/relatorios/recebimentos-realizados" },
                { label: "Fluxo de Caixa", href: "/relatorios/fluxo-caixa" },
                { label: "DRE (Demonstrativo de Resultados)", href: "/relatorios/dre" },
                { label: "Resumo Executivo de Finanças", href: "/relatorios/resumo-executivo" },
            ]
        }
    ];

    return (
        <AppLayout title="Finanças">
            <div className="space-y-6 animate-fade-in p-4 bg-[#F6F2EB] min-h-screen">

                <h2 className="text-xl font-semibold text-green-700 mb-6">Finanças</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start">
                    {cardGroups.map((group, index) => (
                        <Card key={index} className="border-none shadow-sm hover:shadow-md transition-shadow h-full">
                            <CardHeader className="pb-2 pt-4 px-4">
                                <CardTitle className={`text-base font-bold ${group.type === 'menu' ? 'text-gray-700' : 'text-green-700'}`}>
                                    {group.title}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="px-4 pb-4">
                                <div className="flex flex-col gap-2">
                                    {group.items.map((item, idx) => (
                                        <Link
                                            key={idx}
                                            to={item.href}
                                            className={`
                        flex items-center gap-2 text-sm px-2 py-1.5 rounded-md transition-colors
                        ${item.highlight ? 'text-gray-600 hover:text-green-700' : 'text-gray-500 hover:text-green-600 hover:bg-[#F6F2EB]'}
                        ${(item as any).action ? 'font-medium text-gray-700' : ''}
                      `}
                                        >
                                            {item.icon && <item.icon className={`h-4 w-4 ${(item as any).highlight ? 'text-amber-500' : 'text-gray-400'}`} />}
                                            <span>{item.label}</span>
                                        </Link>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    ))}

                    {/* Card Especial Omie.CASH placeholder - adaptado para Conta Digital ou similar */}
                    <Card className="border-dashed border-2 border-green-200 bg-green-50/30 shadow-none hover:shadow-sm transition-shadow">
                        <CardHeader className="pb-2 pt-4 px-4">
                            <CardTitle className="text-base font-bold text-green-700">
                                Conta Digital
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="bg-green-600 text-white text-xs px-2 py-0.5 rounded">Crie agora</div>
                                <span className="text-sm text-gray-600">Sua conta integrada</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </AppLayout>
    );
}
