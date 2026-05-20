import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  ArrowRight,
  Check,
  X,
  Sparkles,
  ShieldCheck,
  Wallet,
  Banknote,
  Receipt,
  FileBarChart,
  PiggyBank,
  Phone,
  Mail,
  Building2,
  MessageSquare,
  Send,
  TrendingDown,
  BarChart3,
  Bell,
  FolderOpen,
  Users2,
  Star,
  Linkedin,
  Instagram,
  Youtube,
  Menu as MenuIcon,
  Search,
  Rocket,
  HeartHandshake,
  ClipboardList,
} from "lucide-react";

const WHATSAPP_NUMERO = "5535999905768";
const WHATSAPP_MSG = encodeURIComponent(
  "Olá! Quero agendar um diagnóstico gratuito com a Tática."
);
const whatsappUrl = `https://wa.me/${WHATSAPP_NUMERO}?text=${WHATSAPP_MSG}`;

const dores = [
  "Planilhas desatualizadas que ninguém confia",
  "Não sabe quanto vai sobrar no final do mês",
  "Clientes inadimplentes sem controle de cobrança",
  "Notas fiscais emitidas com erro ou fora do prazo",
  "Reunião com contador que não entende o negócio",
  'Tomada de decisão no "feeling" por falta de dados',
  "Tempo gasto em financeiro que deveria ir para o negócio",
];

const servicos = [
  { icon: Send, t: "Contas a Pagar", d: "Controle e agendamento de todos os pagamentos, com alertas de vencimento e priorização automática. Sem atraso, sem multa." },
  { icon: Banknote, t: "Contas a Receber", d: "Acompanhamento de cobranças, emissão de boletos e controle de inadimplência. Você recebe mais e no prazo certo." },
  { icon: Wallet, t: "Conciliação Bancária", d: "Seus extratos bancários conferidos automaticamente com os lançamentos do sistema. Zero divergência." },
  { icon: PiggyBank, t: "Fluxo de Caixa", d: "Projeção financeira atualizada diariamente. Saiba hoje o que vai acontecer com seu caixa semana que vem." },
  { icon: Receipt, t: "Emissão de Notas Fiscais", d: "Emissão automática de NF-e e NFS-e integrada aos principais sistemas. Menos erro, mais agilidade." },
  { icon: BarChart3, t: "DRE e Relatórios Gerenciais", d: "Demonstrativo de Resultado completo e relatórios personalizados para saber exatamente se está lucrando." },
  { icon: FolderOpen, t: "Envio à Contabilidade", d: "Toda a documentação organizada e enviada automaticamente para seu escritório contábil. Sem retrabalho." },
  { icon: Bell, t: "Gestão de Inadimplência", d: "Régua de cobrança automatizada: lembretes por WhatsApp, e-mail e boleto. Receba o que é seu." },
  { icon: Users2, t: "Reunião de Análise Mensal", d: "Todo mês uma reunião com nosso time para entender os números e decidir com segurança." },
];

const planos = [
  {
    nome: "Essencial",
    para: "Para MEI e microempresas",
    preco: "R$ 990",
    periodo: "/mês",
    cta: "Quero esse plano",
    destaque: false,
    bullets: [
      "Contas a pagar e receber",
      "Conciliação bancária (1 conta)",
      "Fluxo de caixa",
      "Relatório mensal",
      "Suporte por WhatsApp",
    ],
  },
  {
    nome: "Profissional",
    para: "Para pequenas e médias empresas",
    preco: "R$ 1.990",
    periodo: "/mês",
    cta: "Quero esse plano",
    destaque: true,
    bullets: [
      "Tudo do Essencial +",
      "Emissão de NF-e e NFS-e",
      "DRE mensal",
      "Gestão de inadimplência",
      "Conciliação (até 3 contas)",
      "Reunião mensal de análise",
      "Gestor financeiro dedicado",
    ],
  },
  {
    nome: "Enterprise",
    para: "Para médias e grandes empresas",
    preco: "Sob consulta",
    periodo: "personalizado",
    cta: "Falar com especialista",
    destaque: false,
    bullets: [
      "Tudo do Profissional +",
      "Folha de pagamento integrada",
      "Relatórios customizados",
      "Múltiplas unidades / filiais",
      "Reuniões quinzenais",
      "Integração com ERP / Omie / Conta Azul",
    ],
  },
];

const depoimentos = [
  {
    foto: "D",
    cor: "bg-emerald-500/15 text-emerald-300",
    nome: "Dionelly",
    cargo: "Sócia-fundadora",
    empresa: "HAIR OF BRASIL",
    depo:
      "Antes da Tática eu não sabia se estava lucrando ou perdendo dinheiro. Hoje tenho relatório todo mês e tomei decisões que dobraram minha margem.",
  },
  {
    foto: "R",
    cor: "bg-amber-300/15 text-amber-300",
    nome: "Rafael M.",
    cargo: "Diretor",
    empresa: "Studio M Arquitetura",
    depo:
      "Em 7 dias a equipe deles já tinha assumido tudo. Nunca mais me preocupei com contas a pagar ou receber. Simplesmente funciona.",
  },
  {
    foto: "C",
    cor: "bg-sky-400/15 text-sky-300",
    nome: "Camila S.",
    cargo: "CEO",
    empresa: "Conceito 360",
    depo:
      "Tentei manter equipe interna por 2 anos. Custava o dobro e era sempre uma bagunça. O BPO da Tática resolveu tudo por metade do preço.",
  },
];

const comparativo = [
  { item: "Custo mensal real", interno: "R$ 4.500–8.000+", tatica: "A partir de R$ 990" },
  { item: "Tempo para contratar", interno: "30–90 dias", tatica: "Ativo em 7 dias" },
  { item: "Encargos trabalhistas", interno: "Você paga", tatica: "Inclusos" },
  { item: "Férias / licenças", interno: "Seu problema", tatica: "Nunca para" },
  { item: "Treinamento contínuo", interno: "Seu custo", tatica: "Incluso" },
  { item: "Tecnologia e sistemas", interno: "Você compra", tatica: "Inclusos" },
  { item: "Especialização", interno: "Varia", tatica: "Equipe dedicada" },
  { item: "Relatórios estratégicos", interno: "Raramente", tatica: "Todo mês" },
];

const faqs = [
  {
    q: "O BPO Financeiro substitui minha contabilidade?",
    a: "Não. A Tática cuida da gestão financeira operacional (fluxo de caixa, contas, NF, relatórios). Sua contabilidade fiscal/tributária continua com seu contador. Trabalhamos juntos e enviamos tudo organizado para ele.",
  },
  {
    q: "Quanto tempo leva para começar?",
    a: "Após o diagnóstico, em até 7 dias úteis sua operação já está ativa e nossa equipe já assumiu o financeiro.",
  },
  {
    q: "Preciso trocar meu sistema atual?",
    a: "Não necessariamente. Operamos dentro do nosso sistema próprio (Tatica Gestão) e integramos com Omie, Conta Azul, QuickBooks e outros. Se precisar de migração, cuidamos disso também.",
  },
  {
    q: "E se eu quiser cancelar?",
    a: "Sem fidelidade mínima nos planos Essencial e Profissional. Você pode cancelar com 30 dias de aviso. Sem multa, sem burocracia.",
  },
  {
    q: "Meus dados financeiros ficam seguros?",
    a: "Sim. Criptografia de dados em repouso e em trânsito, acesso restrito por perfil, log de auditoria de todas as alterações e conformidade com a LGPD.",
  },
  {
    q: "Vocês atendem qualquer segmento?",
    a: "Atendemos empresas de serviços, comércio e indústria. Temos especialistas com experiência em tecnologia, saúde, educação, varejo, construção e mais.",
  },
];

export default function VendaSistema() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById("root");
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlHeight: html.style.height,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
      rootOverflow: root?.style.overflow ?? "",
      rootHeight: root?.style.height ?? "",
    };
    html.style.overflow = "auto";
    html.style.height = "auto";
    body.style.overflow = "auto";
    body.style.height = "auto";
    if (root) {
      root.style.overflow = "visible";
      root.style.height = "auto";
    }
    return () => {
      html.style.overflow = prev.htmlOverflow;
      html.style.height = prev.htmlHeight;
      body.style.overflow = prev.bodyOverflow;
      body.style.height = prev.bodyHeight;
      if (root) {
        root.style.overflow = prev.rootOverflow;
        root.style.height = prev.rootHeight;
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A2E] font-sans antialiased">
      <TopBar />
      <Hero />
      <Dor />
      <Solucao />
      <Servicos />
      <ComoFunciona />
      <Planos />
      <Depoimentos />
      <Comparativo />
      <FAQ />
      <CTAFinal />
      <Footer />
      <WhatsAppFloat />
    </div>
  );
}

function TopBar() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: "#inicio", l: "Início" },
    { href: "#servicos", l: "Serviços" },
    { href: "#como-funciona", l: "Como funciona" },
    { href: "#planos", l: "Planos" },
    { href: "#faq", l: "FAQ" },
  ];
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0D1B2A]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-[#00C07F] text-[#0D1B2A] text-[14px] font-bold tracking-tight">T</div>
          <span className="text-[15px] font-semibold tracking-tight text-white">Tática</span>
          <span className="hidden text-[11px] font-medium uppercase tracking-[0.18em] text-white/40 md:inline-block">BPO Financeiro</span>
        </Link>
        <nav className="hidden items-center gap-7 lg:flex">
          {links.map((x) => (
            <a key={x.href} href={x.href} className="text-[13px] text-white/70 transition hover:text-white">{x.l}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-md text-white/80 hover:bg-white/10 lg:hidden"
            aria-label="Abrir menu"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <Button asChild className="hidden rounded-full bg-[#00C07F] px-5 text-[#0D1B2A] hover:bg-[#00C07F]/90 sm:inline-flex">
            <a href={whatsappUrl} target="_blank" rel="noreferrer">
              Fale com um especialista
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
      {open && (
        <div className="border-t border-white/10 bg-[#0D1B2A] lg:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-3">
            {links.map((x) => (
              <a key={x.href} href={x.href} onClick={() => setOpen(false)} className="rounded px-2 py-2 text-[14px] text-white/80 hover:bg-white/5 hover:text-white">
                {x.l}
              </a>
            ))}
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="mt-2 rounded-md bg-[#00C07F] px-4 py-2.5 text-center text-[14px] font-semibold text-[#0D1B2A]">
              Fale com um especialista
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section id="inicio" className="relative overflow-hidden bg-[#0D1B2A] text-white">
      <div className="pointer-events-none absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full bg-[#00C07F]/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full bg-sky-500/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-20 md:pt-28">
        <div className="grid items-center gap-12 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <Badge variant="outline" className="rounded-full border-[#00C07F]/40 bg-[#00C07F]/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-[#7FFFB7]">
              <Sparkles className="mr-1.5 h-3 w-3" />
              Empresas com finanças sob controle
            </Badge>

            <h1 className="mt-5 text-[clamp(2.4rem,5vw,3.5rem)] font-bold leading-[1.04] tracking-tight">
              Sua empresa merece um financeiro de alto nível
              <span className="block text-[#00C07F]"> — sem precisar contratar um.</span>
            </h1>

            <p className="mt-5 max-w-xl text-[15.5px] leading-relaxed text-white/70">
              Terceirize a gestão financeira com a <strong className="text-white">Tática</strong> e tenha controle total do seu caixa,
              relatórios em dia e decisões baseadas em dados reais — tudo isso <strong className="text-white">a partir de R$ 990/mês</strong>.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-12 rounded-full bg-[#00C07F] px-7 text-[14px] font-semibold text-[#0D1B2A] hover:bg-[#00C07F]/90">
                <a href={whatsappUrl} target="_blank" rel="noreferrer">
                  Quero organizar meu financeiro agora
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 rounded-full border-white/25 bg-transparent px-7 text-[14px] text-white hover:bg-white/10">
                <a href="#planos">Conhecer os planos</a>
              </Button>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-white/55">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-[#FFC107] text-[#FFC107]" />
                ))}
                <span className="ml-1.5">Nota 5.0</span>
              </div>
              <span>· Empresas atendidas em 8 estados</span>
              <span>· No mercado desde 2023</span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-[#00C07F]/25 via-transparent to-sky-500/10 blur-2xl" />
            <Card className="overflow-hidden rounded-2xl border-white/10 bg-white shadow-[0_30px_60px_-30px_rgba(0,0,0,0.5)]">
              <div className="flex items-center gap-1.5 border-b border-black/5 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
                <span className="ml-3 text-[11px] text-black/40">tatica · painel mensal</span>
              </div>
              <CardContent className="space-y-5 p-6">
                <div className="grid grid-cols-2 gap-3">
                  <KPI label="Saldo total" value="R$ 184.320" trend="+12,4%" tone="ok" />
                  <KPI label="A receber 30d" value="R$ 96.110" trend="+4,1%" tone="ok" />
                  <KPI label="A pagar 30d" value="R$ 58.420" trend="-3,2%" tone="warn" />
                  <KPI label="Resultado do mês" value="R$ 41.690" trend="+18,7%" tone="ok" />
                </div>

                <div className="rounded-xl border border-black/5 bg-[#F8F9FA] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-black/60">Fluxo projetado · 90 dias</span>
                    <span className="text-[11px] font-medium text-emerald-700">+R$ 28.420</span>
                  </div>
                  <Sparkline />
                </div>

                <div className="flex items-center justify-between rounded-xl bg-[#0D1B2A] px-4 py-3 text-white">
                  <div className="flex items-center gap-3">
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-[#00C07F]/25 text-[#00C07F]">
                      <MessageSquare className="h-4 w-4" />
                    </div>
                    <div className="leading-tight">
                      <p className="text-[12px] font-medium">Relatório de hoje</p>
                      <p className="text-[11px] text-white/60">Enviado às 07:00 · WhatsApp</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-white/60" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}

function KPI({ label, value, trend, tone = "neutral" }: { label: string; value: string; trend: string; tone?: "ok" | "warn" | "neutral" }) {
  const trendColor = tone === "warn" ? "text-amber-700" : tone === "ok" ? "text-emerald-700" : "text-black/55";
  return (
    <div className="rounded-xl border border-black/5 bg-white p-3.5">
      <p className="text-[11px] uppercase tracking-wider text-black/45">{label}</p>
      <p className="mt-1.5 text-[18px] font-semibold tracking-tight">{value}</p>
      <p className={`mt-0.5 text-[11px] font-medium ${trendColor}`}>{trend}</p>
    </div>
  );
}

function Sparkline() {
  return (
    <svg viewBox="0 0 240 60" className="mt-3 h-14 w-full">
      <defs>
        <linearGradient id="grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#00C07F" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#00C07F" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0,40 L20,38 L40,30 L60,34 L80,22 L100,28 L120,18 L140,24 L160,14 L180,20 L200,10 L220,16 L240,8 L240,60 L0,60 Z" fill="url(#grad)" />
      <path d="M0,40 L20,38 L40,30 L60,34 L80,22 L100,28 L120,18 L140,24 L160,14 L180,20 L200,10 L220,16 L240,8" fill="none" stroke="#00C07F" strokeWidth="1.8" />
    </svg>
  );
}

function Dor() {
  return (
    <section className="bg-[#F8F9FA]">
      <div className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h2 className="text-[clamp(1.9rem,4vw,2.7rem)] font-bold tracking-tight">
          Você ainda está gerindo o financeiro <span className="text-[#FF6B35]">no improviso</span>?
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-[#6B7280]">
          Milhares de empresários acordam sem saber se o caixa vai fechar o mês. Pagam contas em atraso sem perceber,
          perdem clientes por erro no faturamento e não conseguem dizer — com certeza — se o negócio está dando lucro de verdade.
        </p>
        <p className="mt-4 text-[14.5px] font-semibold text-[#1A1A2E]">
          Se você se reconhece em alguma situação abaixo, a Tática foi feita para você:
        </p>

        <ul className="mx-auto mt-10 grid max-w-3xl gap-3 text-left sm:grid-cols-2">
          {dores.map((d) => (
            <li key={d} className="flex items-start gap-3 rounded-xl border border-red-100 bg-white px-5 py-4">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-red-100 text-red-600">
                <X className="h-3 w-3" />
              </span>
              <span className="text-[13.5px] leading-relaxed text-[#1A1A2E]">{d}</span>
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-12 max-w-2xl rounded-2xl bg-[#0D1B2A] px-8 py-7 text-white">
          <p className="text-[clamp(1.1rem,2vw,1.4rem)] font-semibold leading-snug tracking-tight">
            "Cada dia sem gestão financeira profissional é um dia tomando decisões no escuro."
          </p>
        </div>
      </div>
    </section>
  );
}

function Solucao() {
  return (
    <section className="relative overflow-hidden bg-[#0D1B2A] text-white">
      <div className="pointer-events-none absolute -right-40 top-1/2 h-[500px] w-[500px] -translate-y-1/2 rounded-full bg-[#00C07F]/12 blur-3xl" />
      <div className="relative mx-auto max-w-6xl px-6 py-24">
        <div className="grid items-center gap-14 md:grid-cols-[1.05fr_0.95fr]">
          <div>
            <Badge variant="outline" className="rounded-full border-white/15 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/70">
              Conheça a solução
            </Badge>
            <h2 className="mt-5 text-[clamp(2rem,4vw,2.8rem)] font-bold leading-[1.08] tracking-tight">
              Tática BPO Financeiro:
              <span className="block text-[#00C07F]">o departamento financeiro da sua empresa, sem o custo de contratar um.</span>
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-white/70">
              A Tática assume o financeiro do seu negócio de ponta a ponta. Nossa equipe especializada cuida de tudo —
              do lançamento das contas ao relatório de resultados — usando tecnologia própria e processos validados
              para você ter clareza, controle e previsibilidade.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-white/70">
              Não é uma planilha. Não é um software genérico. É um <strong className="text-white">time dedicado ao crescimento da sua empresa</strong>.
            </p>

            <p className="mt-8 text-[12.5px] uppercase tracking-[0.18em] text-[#00C07F]/80">A promessa</p>
            <p className="mt-2 text-[16px] font-semibold tracking-tight">
              Você cuida do que gera receita. A Tática cuida do que protege.
            </p>
          </div>

          <div className="grid gap-4">
            <ImpactoCard icon={Building2} n="+200" l="empresas atendidas" />
            <ImpactoCard icon={TrendingDown} n="Até −80%" l="de tempo em tarefas financeiras" />
            <ImpactoCard icon={ShieldCheck} n="2× mais barato" l="que uma equipe interna" />
          </div>
        </div>
      </div>
    </section>
  );
}

function ImpactoCard({ icon: Icon, n, l }: { icon: typeof Building2; n: string; l: string }) {
  return (
    <div className="flex items-center gap-5 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#00C07F]/15 text-[#00C07F]">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-[22px] font-bold tracking-tight text-white">{n}</p>
        <p className="text-[13px] text-white/65">{l}</p>
      </div>
    </div>
  );
}

function Servicos() {
  return (
    <section id="servicos" className="bg-white">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="text-center">
          <h2 className="text-[clamp(1.9rem,4vw,2.6rem)] font-bold tracking-tight">
            O que está incluso no seu BPO Financeiro
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-[14.5px] leading-relaxed text-[#6B7280]">
            Tudo que você precisa para ter um financeiro completo, organizado e estratégico:
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {servicos.map(({ icon: Icon, t, d }) => (
            <div key={t} className="group relative overflow-hidden rounded-2xl border border-black/8 bg-[#F8F9FA] p-6 transition hover:border-[#00C07F]/40 hover:bg-white hover:shadow-[0_20px_40px_-25px_rgba(0,0,0,0.15)]">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#00C07F] to-sky-400 opacity-0 transition group-hover:opacity-100" />
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#00C07F]/10 text-[#00C07F]">
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-5 text-[15.5px] font-semibold tracking-tight">{t}</p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[#6B7280]">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ComoFunciona() {
  const steps = [
    { n: "01", icon: Search, t: "Diagnóstico gratuito", d: "Você conversa 30 minutos com nosso especialista. Analisamos sua operação e mapeamos o que precisa ser organizado." },
    { n: "02", icon: Rocket, t: "Onboarding em até 7 dias", d: "Configuramos tudo: conexão bancária, cadastro de clientes e fornecedores, histórico de lançamentos." },
    { n: "03", icon: HeartHandshake, t: "Operação assumida", d: "A Tática cuida do dia a dia financeiro. Você acompanha em tempo real pelo dashboard ou recebe os relatórios no WhatsApp." },
    { n: "04", icon: ClipboardList, t: "Relatório + reunião estratégica", d: "Todo mês você recebe o DRE, o fluxo de caixa e tem uma reunião de análise com seu gestor dedicado." },
  ];
  return (
    <section id="como-funciona" className="bg-[#F8F9FA]">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="text-center">
          <h2 className="text-[clamp(1.9rem,4vw,2.6rem)] font-bold tracking-tight">
            Começar é mais simples do que você imagina
          </h2>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ n, icon: Icon, t, d }, i) => (
            <div key={n} className="relative rounded-2xl border border-black/8 bg-white p-7 transition hover:shadow-[0_20px_40px_-25px_rgba(0,0,0,0.15)]">
              {i < steps.length - 1 && (
                <div className="absolute -right-3 top-12 hidden h-px w-6 bg-black/15 lg:block" />
              )}
              <div className="flex items-center gap-3">
                <span className="text-[12px] font-bold tracking-[0.12em] text-[#00C07F]">{n}</span>
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#00C07F]/10 text-[#00C07F]">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-5 text-[15.5px] font-semibold tracking-tight">{t}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-[#6B7280]">{d}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Button asChild size="lg" className="h-12 rounded-full bg-[#0D1B2A] px-7 text-[14px] font-semibold text-white hover:bg-[#0D1B2A]/90">
            <a href={whatsappUrl} target="_blank" rel="noreferrer">
              Quero começar meu diagnóstico gratuito
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

function Planos() {
  return (
    <section id="planos" className="bg-white">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="text-center">
          <h2 className="text-[clamp(1.9rem,4vw,2.6rem)] font-bold tracking-tight">
            Planos que cabem no orçamento da sua empresa
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[14.5px] leading-relaxed text-[#6B7280]">
            Sem taxa de setup. Sem fidelidade obrigatória. Sem letra miúda.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {planos.map((p) => (
            <Card
              key={p.nome}
              className={`relative overflow-hidden rounded-2xl border bg-white transition ${
                p.destaque
                  ? "border-[#00C07F] shadow-[0_25px_60px_-25px_rgba(0,192,127,0.45)] md:-translate-y-2"
                  : "border-black/8 hover:border-black/15"
              }`}
            >
              {p.destaque && (
                <div className="absolute right-4 top-4">
                  <Badge className="rounded-full bg-[#00C07F] px-2.5 py-0.5 text-[10.5px] uppercase tracking-[0.14em] text-[#0D1B2A] hover:bg-[#00C07F]">
                    Mais escolhido
                  </Badge>
                </div>
              )}
              <CardContent className="space-y-6 p-7">
                <div>
                  <p className="text-[16px] font-bold tracking-tight">{p.nome}</p>
                  <p className="mt-1 text-[12.5px] italic text-[#6B7280]">{p.para}</p>
                </div>
                <div className="border-y border-black/5 py-5">
                  <p className="text-[12px] uppercase tracking-wider text-[#6B7280]">A partir de</p>
                  <p className="mt-1 text-[30px] font-bold tracking-tight text-[#0D1B2A]">{p.preco}</p>
                  <p className="text-[12px] text-[#6B7280]">{p.periodo}</p>
                </div>
                <ul className="space-y-2.5">
                  {p.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2.5 text-[13.5px] text-[#1A1A2E]">
                      <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[#00C07F]" />
                      {b}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  className={`w-full rounded-full ${
                    p.destaque
                      ? "bg-[#00C07F] text-[#0D1B2A] hover:bg-[#00C07F]/90"
                      : "border border-black/15 bg-transparent text-[#0D1B2A] hover:bg-black/5"
                  }`}
                >
                  <a href={whatsappUrl} target="_blank" rel="noreferrer">
                    {p.cta}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-xl text-center text-[13px] italic text-[#6B7280]">
          Não tem certeza qual plano é o certo? Nosso diagnóstico gratuito de 30 minutos define isso por você. Sem compromisso.
        </p>
      </div>
    </section>
  );
}

function Depoimentos() {
  return (
    <section className="relative overflow-hidden bg-[#0D1B2A] text-white">
      <div className="pointer-events-none absolute -left-32 top-1/2 h-[400px] w-[400px] -translate-y-1/2 rounded-full bg-sky-500/10 blur-3xl" />
      <div className="relative mx-auto max-w-6xl px-6 py-24">
        <div className="text-center">
          <h2 className="text-[clamp(1.9rem,4vw,2.6rem)] font-bold tracking-tight">
            Empresas que pararam de improvisar no financeiro
          </h2>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {depoimentos.map((d) => (
            <Card key={d.nome} className="overflow-hidden rounded-2xl border-white/10 bg-white/[0.04] backdrop-blur">
              <CardContent className="space-y-5 p-7">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="h-4 w-4 fill-[#FFC107] text-[#FFC107]" />
                  ))}
                </div>
                <p className="text-[14.5px] leading-relaxed text-white/85">"{d.depo}"</p>
                <div className="flex items-center gap-3 border-t border-white/10 pt-5">
                  <div className={`grid h-10 w-10 place-items-center rounded-full font-bold ${d.cor}`}>{d.foto}</div>
                  <div className="leading-tight">
                    <p className="text-[13.5px] font-semibold tracking-tight text-white">{d.nome}</p>
                    <p className="text-[12px] text-white/55">{d.cargo} · {d.empresa}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-14 border-t border-white/10 pt-10">
          <p className="text-center text-[11px] uppercase tracking-[0.22em] text-white/45">
            Empresas que confiam na Tática
          </p>
          <div className="mt-6 grid grid-cols-2 items-center gap-6 opacity-60 md:grid-cols-6">
            {["HAIR OF BRASIL", "Atatica Tech", "Studio M", "Conceito 360", "Norte+", "Dionelly"].map((n) => (
              <div key={n} className="text-center text-[12.5px] font-medium tracking-tight text-white/70">{n}</div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Comparativo() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-3xl">
          <h2 className="text-[clamp(1.9rem,4vw,2.6rem)] font-bold tracking-tight">
            Por que terceirizar com a Tática é mais inteligente do que contratar internamente?
          </h2>
        </div>

        <div className="mt-12 overflow-hidden rounded-2xl border border-black/8">
          <div className="grid grid-cols-[1.4fr_1fr_1fr] border-b border-black/8 bg-[#F8F9FA] px-6 py-4 text-[12px] uppercase tracking-[0.14em] text-[#6B7280]">
            <span>Item</span>
            <span className="text-center">❌ Equipe Interna</span>
            <span className="rounded-md bg-[#00C07F] px-2 py-1 text-center text-[#0D1B2A]">✅ Tática BPO</span>
          </div>
          {comparativo.map((r, i) => (
            <div
              key={r.item}
              className={`grid grid-cols-[1.4fr_1fr_1fr] items-center px-6 py-4 text-[13.5px] ${i % 2 ? "bg-white" : "bg-[#F8F9FA]/50"}`}
            >
              <span className="font-medium text-[#1A1A2E]">{r.item}</span>
              <span className="text-center text-[#6B7280]">{r.interno}</span>
              <span className="text-center font-semibold text-[#00A06A]">{r.tatica}</span>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-12 max-w-2xl rounded-2xl bg-[#0D1B2A] px-8 py-7 text-center text-white">
          <p className="text-[clamp(1.1rem,2vw,1.4rem)] font-semibold leading-snug tracking-tight">
            "Equipe interna custa em média <span className="text-[#00C07F]">3× mais</span>. E ainda é você quem gerencia."
          </p>
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  return (
    <section id="faq" className="bg-[#F8F9FA]">
      <div className="mx-auto max-w-3xl px-6 py-24">
        <h2 className="text-center text-[clamp(1.8rem,3.5vw,2.4rem)] font-bold tracking-tight">
          Perguntas frequentes
        </h2>

        <Accordion type="single" collapsible className="mt-10 divide-y divide-black/8 rounded-2xl border border-black/8 bg-white">
          {faqs.map((f, i) => (
            <AccordionItem key={f.q} value={`item-${i}`} className="border-0 px-6">
              <AccordionTrigger className="py-5 text-left text-[14.5px] font-semibold tracking-tight hover:no-underline">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-[13.5px] leading-relaxed text-[#6B7280]">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

function CTAFinal() {
  return (
    <section className="relative overflow-hidden bg-[#0D1B2A] text-white">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-[#00C07F]/15 blur-3xl" />
      <div className="relative mx-auto max-w-4xl px-6 py-24 text-center">
        <h2 className="text-[clamp(2rem,4.5vw,3rem)] font-bold leading-[1.06] tracking-tight">
          Pronto para ter um financeiro
          <span className="block text-[#00C07F]">que realmente funciona?</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-white/70">
          Agende agora um diagnóstico gratuito de 30 minutos com um especialista da Tática.
          Sem compromisso. Sem discurso de vendas. Só uma conversa honesta sobre o que sua empresa precisa.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="h-12 rounded-full bg-[#00C07F] px-7 text-[14px] font-semibold text-[#0D1B2A] hover:bg-[#00C07F]/90">
            <a href={whatsappUrl} target="_blank" rel="noreferrer">
              Agendar meu diagnóstico gratuito
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12.5px] text-white/55">
          <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-[#00C07F]" /> 100% gratuito</span>
          <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-[#00C07F]" /> Sem compromisso</span>
          <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-[#00C07F]" /> Resposta em menos de 1 hora</span>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const col = (titulo: string, items: { l: string; href: string; external?: boolean }[]) => (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/45">{titulo}</p>
      <ul className="mt-4 space-y-2.5">
        {items.map((i) => (
          <li key={i.l}>
            {i.external ? (
              <a href={i.href} target="_blank" rel="noreferrer" className="text-[13px] text-white/75 hover:text-white">{i.l}</a>
            ) : i.href.startsWith("#") || i.href.startsWith("http") ? (
              <a href={i.href} className="text-[13px] text-white/75 hover:text-white">{i.l}</a>
            ) : (
              <Link to={i.href} className="text-[13px] text-white/75 hover:text-white">{i.l}</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <footer className="bg-[#0A1422] text-white">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 md:grid-cols-[1.2fr_1fr_1fr_1.2fr]">
          <div>
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-md bg-[#00C07F] text-[#0D1B2A] text-[14px] font-bold">T</div>
              <span className="text-[15px] font-semibold tracking-tight">Tática</span>
            </div>
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-white/60">
              BPO Financeiro especializado para empresas que querem clareza, controle e previsibilidade.
            </p>
            <div className="mt-6 flex gap-3">
              <a href="https://linkedin.com" target="_blank" rel="noreferrer" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/70 hover:bg-white/10 hover:text-white">
                <Linkedin className="h-4 w-4" />
              </a>
              <a href="https://instagram.com" target="_blank" rel="noreferrer" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/70 hover:bg-white/10 hover:text-white">
                <Instagram className="h-4 w-4" />
              </a>
              <a href="https://youtube.com" target="_blank" rel="noreferrer" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/70 hover:bg-white/10 hover:text-white">
                <Youtube className="h-4 w-4" />
              </a>
              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="grid h-9 w-9 place-items-center rounded-full bg-[#00C07F]/15 text-[#00C07F] hover:bg-[#00C07F]/25">
                <MessageSquare className="h-4 w-4" />
              </a>
            </div>
          </div>

          {col("Serviços", [
            { l: "Contas a Pagar", href: "#servicos" },
            { l: "Contas a Receber", href: "#servicos" },
            { l: "Conciliação Bancária", href: "#servicos" },
            { l: "DRE e Relatórios", href: "#servicos" },
            { l: "Emissão de NF", href: "#servicos" },
            { l: "Gestão Financeira", href: "#servicos" },
          ])}

          {col("Empresa", [
            { l: "Como funciona", href: "#como-funciona" },
            { l: "Planos", href: "#planos" },
            { l: "FAQ", href: "#faq" },
            { l: "Acessar sistema", href: "/auth" },
          ])}

          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/45">Contato</p>
            <ul className="mt-4 space-y-3">
              <li className="flex items-center gap-2 text-[13px] text-white/75">
                <Phone className="h-4 w-4 text-[#00C07F]" /> (35) 99990-5768
              </li>
              <li className="flex items-center gap-2 text-[13px] text-white/75">
                <Mail className="h-4 w-4 text-[#00C07F]" /> ataticagestao@gmail.com
              </li>
              <li>
                <a href={whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[13px] text-[#00C07F] hover:text-white">
                  <MessageSquare className="h-4 w-4" /> WhatsApp direto
                </a>
              </li>
              <li className="flex items-center gap-2 text-[13px] text-white/75">
                <Building2 className="h-4 w-4 text-[#00C07F]" /> ataticagestao.com
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-6 text-[12px] text-white/45 md:flex-row md:items-center">
          <span>© {new Date().getFullYear()} Tática BPO Financeiro — Todos os direitos reservados.</span>
          <div className="flex flex-wrap gap-5">
            <a href="#" className="hover:text-white">LGPD</a>
            <a href="#" className="hover:text-white">Termos de Uso</a>
            <a href="#" className="hover:text-white">Política de Privacidade</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function WhatsAppFloat() {
  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noreferrer"
      aria-label="Falar no WhatsApp"
      className="fixed bottom-5 right-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-[0_15px_35px_-10px_rgba(37,211,102,0.6)] transition hover:scale-105 hover:bg-[#1ebe57]"
    >
      <MessageSquare className="h-6 w-6" />
    </a>
  );
}
