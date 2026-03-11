import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Book, Shield, DollarSign, Users, Building2, FileText, Settings } from "lucide-react";

export default function Ajuda() {
    return (
        <AppLayout title="Ajuda e Manual">
            <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
                <div className="flex items-center gap-2 mb-8">
                    <Book className="h-8 w-8 text-muted-foreground" />
                    <div>
                        <h2 className="text-lg font-bold tracking-tight text-foreground">Central de Ajuda</h2>
                        <p className="text-muted-foreground">Guia rápido para utilizar o Sistema Tática Flow.</p>
                    </div>
                </div>

                <div className="grid gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Building2 className="h-5 w-5 text-blue-600" />
                                Gestão de Empresas
                            </CardTitle>
                            <CardDescription>Como gerenciar suas empresas e filiais.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Accordion type="single" collapsible>
                                <AccordionItem value="item-1">
                                    <AccordionTrigger>Como adicionar uma nova empresa?</AccordionTrigger>
                                    <AccordionContent>
                                        Vá até a página "Empresas", clique no botão "Nova Empresa" no canto superior direito.
                                        Preencha os dados obrigatórios (Razão Social, CNPJ) e clique em "Salvar".
                                    </AccordionContent>
                                </AccordionItem>
                                <AccordionItem value="item-2">
                                    <AccordionTrigger>Como trocar de empresa ativa?</AccordionTrigger>
                                    <AccordionContent>
                                        No topo da barra lateral esquerda (ou no topo da página em dispositivos móveis),
                                        há um seletor de empresas. Clique nele e selecione a empresa que deseja gerenciar no momento.
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <DollarSign className="h-5 w-5 text-green-600" />
                                Financeiro
                            </CardTitle>
                            <CardDescription>Contas a pagar, receber e fluxo de caixa.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Accordion type="single" collapsible>
                                <AccordionItem value="item-1">
                                    <AccordionTrigger>Lançar uma conta a pagar/receber</AccordionTrigger>
                                    <AccordionContent>
                                        Acesse o menu Financeiro e escolha "Contas a Pagar" ou "Contas a Receber".
                                        Clique em "Novo Título", preencha o valor, vencimento e categoria.
                                    </AccordionContent>
                                </AccordionItem>
                                <AccordionItem value="item-2">
                                    <AccordionTrigger>Como dar baixa em um título?</AccordionTrigger>
                                    <AccordionContent>
                                        Na listagem de contas, clique no ícone de "Check" (Confirmar) ou edite o título
                                        e altere o status para "Pago" ou "Recebido".
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Users className="h-5 w-5 text-orange-600" />
                                Cadastros Básicos
                            </CardTitle>
                            <CardDescription>Clientes, Fornecedores e Categorias.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Accordion type="single" collapsible>
                                <AccordionItem value="item-1">
                                    <AccordionTrigger>Gerenciar Parceiros</AccordionTrigger>
                                    <AccordionContent>
                                        Use os menus "Clientes" e "Fornecedores" para manter sua base de contatos atualizada.
                                        Isso facilita o lançamento financeiro, permitindo selecionar o parceiro rapidamente.
                                    </AccordionContent>
                                </AccordionItem>
                                <AccordionItem value="item-2">
                                    <AccordionTrigger>Categorias Financeiras</AccordionTrigger>
                                    <AccordionContent>
                                        Em "Categorias", você pode criar sua árvore de categorias (ex: Despesas Fixas, Variáveis)
                                        para organizar melhor seus relatórios.
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Shield className="h-5 w-5 text-purple-600" />
                                Segurança e Auditoria
                            </CardTitle>
                            <CardDescription>Controle de acesso e histórico.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Accordion type="single" collapsible>
                                <AccordionItem value="item-1">
                                    <AccordionTrigger>Quem pode acessar meus dados?</AccordionTrigger>
                                    <AccordionContent>
                                        O sistema utiliza RLS (Row Level Security). Apenas usuários vinculados à sua empresa
                                        podem ver os dados. Se você é o criador da empresa, tem acesso total.
                                    </AccordionContent>
                                </AccordionItem>
                                <AccordionItem value="item-2">
                                    <AccordionTrigger>Histórico de Exclusões</AccordionTrigger>
                                    <AccordionContent>
                                        Vá em "Configurações" &gt; "Auditoria" para ver quem excluiu ou modificou registros importantes
                                        recentemente.
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </AppLayout>
    );
}
