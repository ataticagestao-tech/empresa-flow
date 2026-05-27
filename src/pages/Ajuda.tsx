import { useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import {
  Book, Rocket, Repeat, CalendarCheck, Settings, Search, ArrowRight,
  Building2, Wallet, ShoppingCart, ArrowDownCircle, ArrowUpCircle, CheckSquare,
  FileText, Users, Briefcase, Upload, Shield, Bell, MessageCircle, Calculator,
  ListChecks,
} from "lucide-react";

type Article = {
  q: string;
  a: React.ReactNode;
  links?: { label: string; to: string }[];
};

type Section = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  articles: Article[];
};

const SECTIONS: Section[] = [
  // ─────────────────────────────────────────────────────────
  {
    id: "primeiros-passos",
    title: "Primeiros passos",
    subtitle: "Do cadastro da empresa até a primeira venda. Faça nesta ordem.",
    icon: Rocket,
    color: "#059669",
    articles: [
      {
        q: "1. Cadastrar a empresa",
        a: (
          <>
            <p>Na tela <b>Empresas</b> clique em <b>Nova Empresa</b>. O sistema busca o CNPJ na Receita e preenche razão social, endereço e data de abertura automaticamente.</p>
            <p>Você precisa preencher: <b>CNPJ</b>, <b>regime tributário</b> (Simples Nacional / Lucro Presumido / Lucro Real / MEI) e <b>responsável</b>.</p>
            <p className="text-muted-foreground">Pode cadastrar quantas empresas precisar — o seletor no topo da barra lateral alterna entre elas.</p>
          </>
        ),
        links: [{ label: "Cadastrar empresa", to: "/empresas?new=true" }],
      },
      {
        q: "2. Configurar plano de contas",
        a: (
          <>
            <p>O <b>plano de contas</b> são as categorias contábeis (Receita de Vendas, Despesas Operacionais, Impostos, etc). Toda receita e despesa lançada cai em uma dessas categorias — é o que alimenta o DRE.</p>
            <p>Ao abrir a tela pela primeira vez, você pode <b>copiar um modelo pronto</b> (recomendado) ou criar do zero.</p>
          </>
        ),
        links: [{ label: "Abrir plano de contas", to: "/plano-contas" }],
      },
      {
        q: "3. Cadastrar conta bancária",
        a: (
          <>
            <p>Em <b>Contas Bancárias</b>, adicione cada banco/conta que você usa. Campos importantes:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><b>ACCTID do OFX</b> — código da conta no extrato. Tem que bater 100% com o número que vem no arquivo OFX (inclusive hífen e zeros à esquerda). Sem isso a conciliação não roda.</li>
              <li><b>Saldo inicial</b> — saldo do dia em que você começou a usar o sistema.</li>
              <li><b>Tipo</b> — corrente, poupança, ou <i>cartão de crédito</i> (cartão de crédito é tratado como conta especial).</li>
            </ul>
          </>
        ),
        links: [{ label: "Adicionar conta", to: "/contas-bancarias" }],
      },
      {
        q: "4. Cadastrar clientes, fornecedores e funcionários",
        a: (
          <>
            <p>Mantenha sua base de contatos atualizada. Isso facilita lançar vendas, despesas e folha — o sistema preenche os dados automaticamente quando você seleciona o nome.</p>
            <p>Dica: ao cadastrar fornecedor ou funcionário, preencha o <b>PIX</b>. O sistema usa esse PIX para casar automaticamente o crédito/débito do extrato com a conta a pagar/receber.</p>
          </>
        ),
        links: [
          { label: "Clientes", to: "/clientes" },
          { label: "Fornecedores", to: "/fornecedores" },
          { label: "Funcionários", to: "/funcionarios" },
        ],
      },
      {
        q: "5. Lançar a primeira venda ou despesa",
        a: (
          <>
            <p><b>Venda</b>: tela <i>Vendas</i> &rarr; <b>Nova Venda</b>. Pode pagar à vista, a prazo (gera contas a receber automaticamente), no cartão ou em múltiplas formas.</p>
            <p><b>Despesa</b>: tela <i>Contas a Pagar</i> &rarr; <b>Novo Título</b>. Informe credor, valor, categoria e vencimento.</p>
          </>
        ),
        links: [
          { label: "Nova venda", to: "/vendas" },
          { label: "Lançar despesa", to: "/contas-pagar" },
        ],
      },
      {
        q: "6. Importar extrato e conciliar",
        a: (
          <>
            <p>Em <b>Conciliação Bancária</b>, suba o arquivo OFX, CSV ou Excel do banco. O sistema:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Identifica automaticamente créditos e débitos.</li>
              <li>Casa transações com contas a pagar/receber já lançadas.</li>
              <li>Sugere categoria para o que sobrou (você pode aceitar ou trocar).</li>
              <li>Bloqueia o upload se o ACCTID do arquivo não bater com o cadastrado na conta selecionada (proteção contra subir extrato na conta errada).</li>
            </ul>
            <p>Você também pode conectar o e-mail do banco em <i>Configurações &gt; Integrações</i> para importar automaticamente.</p>
          </>
        ),
        links: [{ label: "Ir para conciliação", to: "/conciliacao" }],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    id: "rotina-diaria",
    title: "Rotina diária",
    subtitle: "O que fazer todo dia para o sistema ficar atualizado.",
    icon: Repeat,
    color: "#0066FF",
    articles: [
      {
        q: "Lançar vendas do dia",
        a: (
          <>
            <p>Cada venda gera automaticamente: <b>movimentação no caixa</b> (se à vista), <b>conta a receber</b> (se a prazo) e <b>saída de estoque</b> (se for produto cadastrado).</p>
            <p>Em vendas parceladas, o sistema cria uma conta a receber por parcela. Se o cliente fizer pagamento parcial, marca a venda como <i>parcial</i> e o saldo vira CR aberta.</p>
          </>
        ),
        links: [{ label: "Vendas", to: "/vendas" }],
      },
      {
        q: "Lançar contas a pagar / receber",
        a: (
          <>
            <p>Sempre que receber boleto, nota ou pix de cobrança, lance em <i>Contas a Pagar</i>. Quando o pagamento sair do banco, marque como pago — a movimentação cai no fluxo de caixa automaticamente.</p>
            <p>Se já lançou no sistema antes do pagamento, o extrato vai casar sozinho na conciliação.</p>
          </>
        ),
        links: [
          { label: "Contas a Pagar", to: "/contas-pagar" },
          { label: "Contas a Receber", to: "/contas-receber" },
        ],
      },
      {
        q: "Conciliar o extrato (1x por dia ou na sexta)",
        a: (
          <>
            <p>Suba o OFX do banco e o sistema concilia automaticamente o que já está lançado. O que sobrar, você categoriza ali mesmo — vira movimentação ou CR/CP automaticamente.</p>
            <p>Se houver diferença (juros, multa, desconto), use <b>Conciliar Manualmente</b> e escolha a categoria do ajuste.</p>
          </>
        ),
        links: [{ label: "Conciliação", to: "/conciliacao" }],
      },
      {
        q: "Acompanhar caixa e pendências",
        a: (
          <>
            <p>O <b>Dashboard</b> mostra: saldo de caixa atual, faturamento do mês, despesas, contas a vencer nos próximos 7 dias e contas atrasadas.</p>
            <p>Use o filtro <b>Caixa / Competência</b> para alternar entre "o que entrou de fato" e "o que foi vendido".</p>
          </>
        ),
        links: [{ label: "Dashboard", to: "/dashboard" }],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    id: "fechamento-mensal",
    title: "Fechamento mensal",
    subtitle: "Roteiro de 15 minutos no fim do mês.",
    icon: CalendarCheck,
    color: "#8B5CF6",
    articles: [
      {
        q: "1. Conferir se todas as contas estão conciliadas",
        a: (
          <>
            <p>Em <b>Conciliação</b>, garanta que não há lançamentos pendentes no mês. Se sobrou algo, categorize antes de fechar.</p>
          </>
        ),
        links: [{ label: "Conciliação", to: "/conciliacao" }],
      },
      {
        q: "2. Gerar e revisar o DRE",
        a: (
          <>
            <p>Em <b>DRE</b>, escolha o mês e regime (caixa ou competência). Veja receitas, despesas e resultado líquido. Se algum valor estranho aparecer, clique na categoria para abrir o detalhamento.</p>
          </>
        ),
        links: [{ label: "DRE", to: "/dre" }],
      },
      {
        q: "3. Conferir Fluxo de Caixa",
        a: (
          <>
            <p>O <b>Fluxo de Caixa</b> mostra entradas e saídas reais por conta bancária, com saldo dia a dia. Use para auditar se o saldo do sistema bate com o do banco.</p>
          </>
        ),
        links: [{ label: "Fluxo de Caixa", to: "/demonstrativos/dfc" }],
      },
      {
        q: "4. Exportar relatórios para o contador",
        a: (
          <>
            <p>Em <b>Área do Contador</b>, gere os arquivos do mês: extrato consolidado, conciliações com categoria, vendas e despesas em planilha. É só baixar e enviar.</p>
          </>
        ),
        links: [{ label: "Área do Contador", to: "/area-contador" }],
      },
      {
        q: "5. Receber resumo automático (opcional)",
        a: (
          <>
            <p>Em <b>Configurações &gt; Resumo Overnight</b>, configure o horário em que o sistema envia por WhatsApp um PDF diário/semanal/mensal com faturamento e despesas. Ideal para acompanhar sem precisar abrir o sistema.</p>
          </>
        ),
        links: [{ label: "Configurações", to: "/configuracoes" }],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  {
    id: "configuracoes",
    title: "Configurações e equipe",
    subtitle: "Multi-usuário, integrações e personalizações.",
    icon: Settings,
    color: "#667085",
    articles: [
      {
        q: "Adicionar usuários da equipe",
        a: (
          <>
            <p>Em <b>Equipe</b>, convide colaboradores por e-mail. Cada um vê apenas a empresa em que foi convidado (multi-tenant). O criador da empresa é admin por padrão.</p>
          </>
        ),
        links: [{ label: "Equipe", to: "/equipe" }],
      },
      {
        q: "Integração com Gmail (importar extrato do e-mail)",
        a: (
          <>
            <p>Em <b>Configurações &gt; Integrações &gt; Gmail</b>, conecte sua conta Google. O sistema lê automaticamente os extratos que o banco envia por e-mail e cria as transações na conta certa pelo ACCTID.</p>
          </>
        ),
        links: [{ label: "Configurações", to: "/configuracoes" }],
      },
      {
        q: "WhatsApp — cadastros e resumos",
        a: (
          <>
            <p>O sistema pode receber fotos de notas fiscais e documentos via WhatsApp, cadastrar funcionários/fornecedores automaticamente, e enviar resumos diários. Configure os números autorizados em <b>WhatsApp Autorizados</b>.</p>
          </>
        ),
        links: [{ label: "WhatsApp Autorizados", to: "/admin/whatsapp-autorizados" }],
      },
      {
        q: "Régua de Cobrança",
        a: (
          <>
            <p>Em <b>Régua de Cobrança</b>, configure mensagens automáticas para clientes com contas em atraso. Envio por WhatsApp ou e-mail, com intervalos personalizados (3, 7, 15 dias após o vencimento).</p>
          </>
        ),
        links: [{ label: "Régua de Cobrança", to: "/regua-cobranca" }],
      },
      {
        q: "Segurança e auditoria",
        a: (
          <>
            <p>O sistema usa RLS (Row Level Security) — apenas usuários vinculados à empresa veem seus dados. Em <b>Log de Atividades</b> você acompanha quem alterou ou excluiu cada registro.</p>
          </>
        ),
        links: [{ label: "Log de Atividades", to: "/admin/log-atividades" }],
      },
    ],
  },
];

const QUICK_LINKS = [
  { label: "Cadastrar empresa", to: "/empresas?new=true", icon: Building2 },
  { label: "Plano de contas", to: "/plano-contas", icon: Book },
  { label: "Adicionar conta bancária", to: "/contas-bancarias", icon: Wallet },
  { label: "Nova venda", to: "/vendas", icon: ShoppingCart },
  { label: "Lançar despesa", to: "/contas-pagar", icon: ArrowDownCircle },
  { label: "Conciliar extrato", to: "/conciliacao", icon: CheckSquare },
  { label: "Ver DRE", to: "/dre", icon: FileText },
  { label: "Área do Contador", to: "/area-contador", icon: Briefcase },
];

export default function Ajuda() {
  const [query, setQuery] = useState("");

  const filteredSections = SECTIONS.map(section => ({
    ...section,
    articles: section.articles.filter(a => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      const inQ = a.q.toLowerCase().includes(q);
      const inA = typeof a.a === "string" ? a.a.toLowerCase().includes(q) : false;
      return inQ || inA;
    }),
  })).filter(s => s.articles.length > 0);

  return (
    <AppLayout title="Central de Ajuda">
      <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <Book className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Central de Ajuda</h2>
            <p className="text-sm text-muted-foreground">
              Tudo que você precisa para usar o sistema sozinho, do cadastro da empresa ao fechamento mensal.
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar (ex: como conciliar, regime tributário, OFX...)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Quick links */}
        {!query && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-emerald-600" /> Atalhos rápidos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {QUICK_LINKS.map(link => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-sm font-medium"
                  >
                    <link.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{link.label}</span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sections */}
        {filteredSections.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Nenhum resultado para "{query}". Tente outra palavra-chave.
            </CardContent>
          </Card>
        )}

        {filteredSections.map(section => (
          <Card key={section.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${section.color}15` }}
                >
                  <section.icon className="h-5 w-5" style={{ color: section.color }} />
                </div>
                <div>
                  <div className="text-base font-bold">{section.title}</div>
                  <CardDescription className="font-normal mt-0.5">{section.subtitle}</CardDescription>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {section.articles.map((article, idx) => (
                  <AccordionItem key={idx} value={`${section.id}-${idx}`}>
                    <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline">
                      {article.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground space-y-2">
                      <div className="space-y-2 leading-relaxed">{article.a}</div>
                      {article.links && article.links.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {article.links.map(link => (
                            <Link
                              key={link.to}
                              to={link.to}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-md transition-colors"
                            >
                              {link.label}
                              <ArrowRight className="h-3 w-3" />
                            </Link>
                          ))}
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        ))}

        {/* Footer */}
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="py-6 text-center space-y-2">
            <MessageCircle className="h-6 w-6 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">Não encontrou o que procurava?</p>
            <p className="text-xs text-muted-foreground">
              Verifique a página específica (cada uma tem dicas contextuais) ou entre em contato pelo WhatsApp do suporte.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
