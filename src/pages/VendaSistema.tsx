import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Check,
  Sparkles,
  ShieldCheck,
  Phone,
  Mail,
  Building2,
  MessageSquare,
  Bell,
  BarChart3,
  Users2,
  LineChart,
  Linkedin,
  Instagram,
  Youtube,
  Facebook,
  Menu as MenuIcon,
  Target,
  Lightbulb,
  Compass,
  TrendingUp,
  Briefcase,
  Layers,
  Cpu,
  Lock,
  Smartphone,
  Zap,
  ImageIcon,
  User,
} from "lucide-react";

const WHATSAPP_NUMERO = "5535999905768";
const WHATSAPP_MSG = encodeURIComponent(
  "Olá! Quero contratar a Tática Financeiro."
);
const whatsappUrl = `https://wa.me/${WHATSAPP_NUMERO}?text=${WHATSAPP_MSG}`;

const checkoutUrl = (plano: string) => `/checkout?plano=${encodeURIComponent(plano)}`;

const heroBullets = [
  "Clareza financeira sem burocracia",
  "Sistema próprio integrado ao seu fluxo",
  "Redução de custos e aumento da lucratividade",
  "Decisões estratégicas com dados em tempo real",
  "Mais tempo para você focar no que importa",
];

const heroCards = [
  {
    icon: Cpu,
    titulo: "Sistema Próprio Tática",
    txt: "Plataforma exclusiva desenvolvida pela nossa equipe para gestão financeira em tempo real, integrada ao seu negócio.",
    destaque: true,
  },
  {
    icon: LineChart,
    titulo: "BI e Dashboards em Tempo Real",
    txt: "Visualize a saúde financeira com gráficos e relatórios gerados automaticamente pelo nosso sistema.",
  },
  {
    icon: ShieldCheck,
    titulo: "Segurança e Confiabilidade",
    txt: "Seus dados financeiros protegidos em infraestrutura robusta, com acesso controlado e auditável.",
  },
];

const stats = [
  { n: "+10", l: "Anos de experiência" },
  { n: "+200", l: "Empresas atendidas" },
  { n: "98%", l: "Taxa de satisfação" },
  { n: "Sistema Próprio", l: "Exclusivo Tática", small: true },
];

const sistemaCards = [
  { icon: Layers, t: "Plataforma Exclusiva", d: "Sistema desenvolvido pela nossa equipe técnica, desenhado para as demandas de gestão financeira empresarial." },
  { icon: Zap, t: "Integração Completa", d: "Conecta automaticamente com bancos, emissão de NF, contas a pagar e receber e conciliação em um único lugar." },
  { icon: BarChart3, t: "Relatórios Inteligentes", d: "Geração automática de DRE, fluxo de caixa, análise vertical e horizontal e BI com dados em tempo real." },
  { icon: Bell, t: "Alertas Automatizados", d: "Notificações proativas sobre vencimentos, desvios orçamentários e oportunidades identificadas pelo sistema." },
  { icon: Lock, t: "Segurança de Dados", d: "Infraestrutura com criptografia, backups automáticos e controle de acessos para proteger as informações." },
  { icon: Smartphone, t: "Acesso Multiplataforma", d: "Acesse pelo computador ou celular a qualquer momento. Seus dados disponíveis onde você estiver." },
];

const servicos = [
  { t: "Implantação e Treinamento", d: "Configuração completa do sistema Tática e capacitação da equipe para uso pleno da plataforma." },
  { t: "Gestão de Contas a Pagar", d: "Controle e agendamento de pagamentos, evitando atrasos, juros e desorganização financeira." },
  { t: "Gestão de Contas a Receber", d: "Acompanhamento de recebíveis, cobrança organizada e previsão de entradas para saúde financeira." },
  { t: "Emissão de Notas Fiscais", d: "Emissão e envio automático de notas fiscais diretamente pelo sistema Tática com rastreabilidade fiscal." },
  { t: "Conciliação Bancária", d: "Conciliação precisa de extratos bancários e cartões, identificando divergências automaticamente." },
  { t: "Fluxo de Caixa", d: "Relatórios detalhados de entradas e saídas para acompanhamento da saúde financeira em tempo real." },
  { t: "DRE — Demonstração de Resultado", d: "Geração mensal da demonstração de resultado com análise vertical, horizontal e benchmarks do setor." },
  { t: "Análise de Resultados", d: "Interpretação dos dados financeiros com visão estratégica para identificar oportunidades e riscos." },
  { t: "Planejamento Financeiro", d: "Projeção de cenários, orçamento empresarial e planejamento de longo prazo para crescimento sustentável." },
];

const planos = [
  {
    nome: "Assistente",
    bullets: [
      "1 Conta bancária conciliada",
      "1 Cartão de crédito conciliado",
      "Até 10 notas fiscais emitidas",
      "Até 100 registros bancários",
      "DRE mensal padrão Tática",
      "Até 20 boletos agendados",
      "1 Reunião trimestral de análise",
      "Análise vertical e horizontal",
      "Acesso ao Sistema Tática + BI",
    ],
    destaque: false,
  },
  {
    nome: "Controller",
    bullets: [
      "2 Contas bancárias conciliadas",
      "2 Cartões de crédito conciliados",
      "Até 50 notas fiscais emitidas",
      "Até 200 registros bancários",
      "DRE padrão Tática completo",
      "Até 30 boletos agendados",
      "1 Reunião bimestral de análise",
      "Análise vertical e horizontal",
      "Acesso ao Sistema Tática + BI",
    ],
    destaque: true,
  },
  {
    nome: "Gestor",
    bullets: [
      "3 Contas bancárias conciliadas",
      "3 Cartões de crédito conciliados",
      "Até 100 notas fiscais emitidas",
      "Até 300 registros bancários",
      "DRE padrão Tática + FP&A",
      "Até 40 boletos agendados",
      "1 Reunião mensal de análise",
      "Análise vertical e horizontal",
      "Acesso ao Sistema Tática + BI",
    ],
    destaque: false,
  },
];

const consultoria = [
  { icon: Compass, t: "Diagnóstico Completo", d: "Analisamos sua operação financeira utilizando nosso sistema para mapear desafios e oportunidades com precisão e dados reais." },
  { icon: Target, t: "Soluções Sob Medida", d: "Criamos estratégias personalizadas, alinhadas aos objetivos do seu negócio e implementadas diretamente na plataforma Tática." },
  { icon: Lightbulb, t: "Apoio em Decisões Críticas", d: "Fornecemos insights financeiros precisos gerados pelo nosso sistema para que você tome decisões assertivas e aumente a lucratividade." },
  { icon: TrendingUp, t: "Planejamento de Longo Prazo", d: "Auxiliamos no planejamento financeiro com projeção de cenários, garantindo crescimento sustentável e estabilidade." },
  { icon: Users2, t: "Parceiro de Crescimento", d: "Somos mais que consultores: somos parceiros dedicados com tecnologia própria para ajudar seu negócio a atingir seu pleno potencial." },
  { icon: Briefcase, t: "CFO as a Service", d: "Tenha um Chief Financial Officer dedicado ao crescimento da sua empresa, com toda a inteligência do Sistema Tática ao seu lado." },
];

const fundadores = [
  {
    inicial: "A",
    foto: "/images/fundador-1.jpg",
    nome: "Nome do Fundador",
    cargo: "Diretor Comercial e Co-fundador",
    bio: "Especialista em finanças estratégicas com vasta experiência em gestão financeira empresarial. Transforma a visão de negócio em estratégias financeiras de alto impacto para nossos clientes.",
  },
  {
    inicial: "B",
    foto: "/images/fundador-2.jpg",
    nome: "Nome do Co-fundador",
    cargo: "Diretora de Operações e Co-fundadora",
    bio: "Especialista em BPO Financeiro e tecnologia, lidera o desenvolvimento e evolução do Sistema Tática. Traz eficiência operacional e clareza nos processos para cada cliente atendido.",
  },
];

const navLinks = [
  { href: "#sobre", l: "Sobre nós" },
  { href: "#sistema", l: "Nosso Sistema" },
  { href: "#servicos", l: "Serviços" },
  { href: "#planos", l: "Planos" },
  { href: "#solucao", l: "Solução" },
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
    <div className="min-h-screen bg-[#F5F0E8] text-[#2c2c2c] font-sans antialiased">
      <TopBar />
      <Hero />
      <Sobre />
      <Sistema />
      <Servicos />
      <Planos />
      <Consultoria />
      <Fundadores />
      <CTAFinal />
      <Footer />
      <WhatsAppFloat />
    </div>
  );
}

function LogoSymbol({
  size = 32,
  variant = "dark",
  className = "",
}: {
  size?: number;
  variant?: "dark" | "light";
  className?: string;
}) {
  const fill = variant === "light" ? "white" : "#171717";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="19" height="19" rx="4" fill={fill} />
      <rect x="26" y="3" width="19" height="19" rx="4" fill={fill} opacity="0.2" />
      <rect x="3" y="26" width="19" height="19" rx="4" fill={fill} opacity="0.2" />
      <rect x="26" y="26" width="19" height="19" rx="4" fill={fill} />
    </svg>
  );
}

function PhotoFrame({
  src,
  alt,
  fallback,
  className = "",
  rounded = "rounded-2xl",
  fallbackIcon: Icon = ImageIcon,
  fallbackLabel,
}: {
  src?: string;
  alt: string;
  fallback?: React.ReactNode;
  className?: string;
  rounded?: string;
  fallbackIcon?: typeof ImageIcon;
  fallbackLabel?: string;
}) {
  const [failed, setFailed] = useState(!src);
  if (!src || failed) {
    return (
      <div
        className={`relative grid place-items-center overflow-hidden border border-dashed border-white/20 bg-white/[0.03] text-white/40 ${rounded} ${className}`}
        aria-label={alt}
      >
        {fallback ?? (
          <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
            <Icon className="h-6 w-6" />
            <span className="text-[11px] font-medium uppercase tracking-[0.16em]">
              {fallbackLabel ?? "Foto aqui"}
            </span>
          </div>
        )}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className={`block h-full w-full object-cover ${rounded} ${className}`}
    />
  );
}

function TopBar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-black/5 bg-[#F5F0E8]/95 backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-3">
          <LogoSymbol size={40} variant="dark" />
          <div className="leading-[1.1]">
            <p className="text-[15px] font-black tracking-tight text-[#0D2847]">TÁTICA</p>
            <p className="text-[13px] font-black tracking-tight text-[#22A55C]">FINANCEIRO</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {navLinks.map((x) => (
            <a key={x.href} href={x.href} className="text-[14px] font-medium text-[#0D2847]/75 transition hover:text-[#22A55C]">
              {x.l}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild className="hidden rounded-md bg-[#2C7BC4] px-5 text-white hover:bg-[#1f5d96] sm:inline-flex">
            <a href={whatsappUrl} target="_blank" rel="noreferrer">
              Quero contratar
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </a>
          </Button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-md text-[#0D2847]/80 hover:bg-black/5 lg:hidden"
            aria-label="Abrir menu"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-black/5 bg-[#F5F0E8] lg:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-3">
            {navLinks.map((x) => (
              <a key={x.href} href={x.href} onClick={() => setOpen(false)} className="rounded px-2 py-2 text-[14px] text-[#0D2847]/80 hover:bg-black/5 hover:text-[#22A55C]">
                {x.l}
              </a>
            ))}
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="mt-2 rounded-md bg-[#2C7BC4] px-4 py-2.5 text-center text-[14px] font-semibold text-white">
              Quero contratar
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#0D2847] via-[#13355D] to-[#0D2847] text-white">
      <div className="pointer-events-none absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full bg-[#2C7BC4]/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full bg-[#22A55C]/10 blur-3xl" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 pb-24 pt-20 md:grid-cols-[1.1fr_0.9fr] md:pt-28">
        <div>
          <Badge variant="outline" className="rounded-full border-[#22A55C]/40 bg-[#22A55C]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#7FD8A0]">
            <Sparkles className="mr-1.5 h-3 w-3" />
            Sistema próprio + Gestão especializada
          </Badge>

          <h1 className="mt-6 text-[clamp(2.4rem,5vw,3.4rem)] font-black leading-[1.08] tracking-tight">
            Clareza Financeira,<br />
            <span className="text-[#22A55C]">Controle Total</span> e<br />
            Crescimento Real
          </h1>

          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[#B8C8E0]">
            Com a Tática, sua empresa tem gestão financeira completa executada por especialistas
            e potencializada pelo nosso <strong className="text-[#22A55C]">sistema próprio</strong>,
            desenvolvido para o seu negócio crescer com dados precisos.
          </p>

          <ul className="mt-7 space-y-2">
            {heroBullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-[14.5px] text-[#C8D8EC]">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#22A55C]" />
                {b}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="h-12 rounded-md bg-[#2C7BC4] px-7 text-[14px] font-bold uppercase tracking-wider text-white transition hover:-translate-y-0.5 hover:bg-[#1f5d96] hover:shadow-[0_8px_24px_rgba(44,123,196,0.35)]">
              <a href={whatsappUrl} target="_blank" rel="noreferrer">
                Quero contratar
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 rounded-md border-white/20 bg-transparent px-7 text-[14px] text-[#B8C8E0] hover:border-[#2C7BC4] hover:bg-transparent hover:text-[#22A55C]">
              <a href="#planos">Ver planos</a>
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {heroCards.map(({ icon: Icon, titulo, txt, destaque }) => (
            <div
              key={titulo}
              className={`rounded-2xl border p-6 transition ${
                destaque
                  ? "border-[#22A55C] bg-[#22A55C]/10"
                  : "border-white/10 bg-white/[0.04]"
              }`}
            >
              <div className={`grid h-11 w-11 place-items-center rounded-lg ${destaque ? "bg-[#22A55C]/25 text-[#22A55C]" : "bg-[#2C7BC4]/20 text-[#7AB8F0]"}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-[15px] font-bold tracking-tight text-white">{titulo}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[#9FB3CE]">{txt}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Sobre() {
  return (
    <section id="sobre" className="bg-white">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid items-center gap-14 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#2C7BC4]">Quem somos</p>
            <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.4rem)] font-black leading-[1.2] tracking-tight text-[#0D2847]">
              Parceiro estratégico que <span className="text-[#22A55C]">revela oportunidades</span> para decisões baseadas em dados
            </h2>
            <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-[#666]">
              <p>
                Somos especialistas em gestão financeira para empresas que querem crescer com segurança.
                Nossa missão é ser o parceiro que transforma números em decisões estratégicas.
              </p>
              <p>
                Cuidamos da análise, planejamento e execução financeira da sua empresa, potencializados pelo nosso
                {" "}<strong className="text-[#0D2847]">sistema próprio</strong>, desenvolvido para as reais necessidades do seu negócio.
              </p>
              <p className="text-[#0D2847]">
                Mais que um financeiro terceirizado: <strong>impulsionamos seu crescimento estratégico e sustentável.</strong>
              </p>
            </div>
            <Button asChild className="mt-8 h-11 rounded-md bg-[#2C7BC4] px-6 text-[13.5px] font-bold uppercase tracking-wider text-white hover:bg-[#1f5d96]">
              <a href={whatsappUrl} target="_blank" rel="noreferrer">
                Quero contratar
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>

          <div className="space-y-4">
            <div className="aspect-[16/10] w-full overflow-hidden rounded-2xl bg-[#0D2847]">
              <PhotoFrame
                src="/images/equipe-tatica.jpg"
                alt="Equipe Tática"
                rounded="rounded-2xl"
                fallbackIcon={Users2}
                fallbackLabel="Foto da equipe"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {stats.map((s) => (
                <div key={s.l} className="rounded-2xl border-t-[3px] border-[#22A55C] bg-[#F5F0E8] p-6 text-center shadow-[0_2px_16px_rgba(0,0,0,0.05)]">
                  <p className={`font-black tracking-tight text-[#0D2847] ${s.small ? "text-[16px] leading-tight" : "text-[32px]"}`}>{s.n}</p>
                  <p className="mt-1 text-[12.5px] text-[#666]">{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Sistema() {
  return (
    <section id="sistema" className="relative overflow-hidden bg-[#0D2847] text-white">
      <div className="pointer-events-none absolute -right-32 top-1/2 h-[500px] w-[500px] -translate-y-1/2 rounded-full bg-[#22A55C]/10 blur-3xl" />
      <div className="relative mx-auto max-w-6xl px-6 py-24">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#22A55C]">Nosso grande diferencial</p>
          <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.6rem)] font-black leading-tight tracking-tight">
            Sistema <span className="text-[#22A55C]">Próprio</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-[#9FB3CE]">
            Enquanto outros dependem de ferramentas genéricas, a Tática opera com plataforma desenvolvida
            internamente para entregar mais agilidade, precisão e controle.
          </p>
        </div>

        <div className="relative mx-auto mt-14 max-w-4xl">
          <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-[#22A55C]/25 via-transparent to-[#2C7BC4]/15 blur-2xl" />
          <div className="aspect-[16/9] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.5)]">
            <PhotoFrame
              src="/images/sistema-dashboard.jpg"
              alt="Preview do Sistema Tática"
              rounded="rounded-2xl"
              fallbackIcon={BarChart3}
              fallbackLabel="Screenshot do sistema"
            />
          </div>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {sistemaCards.map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-2xl border border-white/10 bg-white/[0.04] p-7 transition hover:-translate-y-1 hover:border-[#22A55C]/50 hover:bg-white/[0.06]">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#22A55C]/15 text-[#22A55C]">
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-5 text-[16px] font-bold tracking-tight text-white">{t}</p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[#9FB3CE]">{d}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-[#22A55C]/40 bg-[#22A55C]/10 p-8 md:p-10">
          <div className="grid items-start gap-7 md:grid-cols-[auto_1fr]">
            <div className="grid h-16 w-16 place-items-center rounded-xl bg-[#22A55C]/25 text-[#22A55C]">
              <Cpu className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-[20px] font-black tracking-tight text-[#22A55C]">
                Por que sistema próprio faz diferença?
              </h3>
              <p className="mt-3 text-[14.5px] leading-relaxed text-[#C8D8EC]">
                Ferramentas de terceiros limitam a personalização e cobram por cada usuário.
                Com o sistema Tática, você tem uma plataforma evoluindo continuamente, sem custos extras por acesso.
              </p>
              <ul className="mt-4 grid gap-2 md:grid-cols-2">
                {[
                  "Sem licenças adicionais de software",
                  "Customizável conforme o seu negócio cresce",
                  "Suporte técnico direto da equipe desenvolvedora",
                  "Atualizações constantes incluídas no plano",
                ].map((x) => (
                  <li key={x} className="flex items-start gap-2.5 text-[13.5px] text-[#B8C8E0]">
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2C7BC4]" />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Servicos() {
  return (
    <section id="servicos" className="bg-[#F5F0E8]">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#2C7BC4]">O que entregamos</p>
          <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.6rem)] font-black tracking-tight text-[#0D2847]">
            Conheça nossos <span className="text-[#22A55C]">serviços</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[14.5px] leading-relaxed text-[#666]">
            Soluções completas de gestão financeira, do operacional ao estratégico,
            integradas ao nosso sistema próprio.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {servicos.map((s, i) => (
            <div
              key={s.t}
              className="group rounded-2xl border-l-4 border-transparent bg-white p-7 transition hover:-translate-y-1 hover:border-l-[#22A55C] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
            >
              <div className="grid h-9 w-9 place-items-center rounded-md bg-[#2C7BC4]/10 text-[11px] font-black text-[#2C7BC4]">
                {String(i + 1).padStart(2, "0")}
              </div>
              <p className="mt-4 text-[13.5px] font-black uppercase tracking-wider text-[#0D2847]">{s.t}</p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[#666]">{s.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Button asChild size="lg" className="h-12 rounded-md bg-[#2C7BC4] px-7 text-[14px] font-bold uppercase tracking-wider text-white hover:bg-[#1f5d96]">
            <a href={whatsappUrl} target="_blank" rel="noreferrer">
              Quero contratar
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
    <section id="planos" className="bg-[#EDE6D6]">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#2C7BC4]">Planos</p>
          <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.6rem)] font-black tracking-tight text-[#0D2847]">
            Escolha o plano <span className="text-[#22A55C]">ideal</span> para sua empresa
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[14.5px] leading-relaxed text-[#666]">
            Todos os planos incluem acesso ao Sistema Próprio Tática sem custo adicional.
          </p>
        </div>

        <div className="mt-16 grid gap-7 lg:grid-cols-3">
          {planos.map((p) => (
            <Card
              key={p.nome}
              className={`relative overflow-hidden rounded-2xl border-2 transition ${
                p.destaque
                  ? "border-[#22A55C] bg-[#0D2847] text-white shadow-[0_20px_50px_-20px_rgba(34,165,92,0.45)] lg:-translate-y-3"
                  : "border-transparent bg-white text-[#0D2847] hover:-translate-y-1 hover:border-[#22A55C]/40 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]"
              }`}
            >
              {p.destaque && (
                <div className="absolute left-1/2 top-0 -translate-x-1/2 translate-y-[-50%]">
                  <Badge className="rounded-full bg-[#22A55C] px-4 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-white hover:bg-[#22A55C]">
                    Mais popular
                  </Badge>
                </div>
              )}

              <CardContent className="p-8">
                <h3 className={`text-[24px] font-black tracking-tight ${p.destaque ? "text-white" : "text-[#0D2847]"}`}>
                  {p.nome}
                </h3>

                <ul className="mt-6 space-y-0">
                  {p.bullets.map((b, i) => (
                    <li
                      key={b}
                      className={`flex items-start gap-3 py-2.5 text-[13.5px] ${
                        p.destaque ? "text-[#C8D8EC]" : "text-[#666]"
                      } ${i < p.bullets.length - 1 ? (p.destaque ? "border-b border-white/8" : "border-b border-[#EFE7D2]") : ""}`}
                    >
                      <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${p.destaque ? "text-[#22A55C]" : "text-[#2C7BC4]"}`} />
                      {b}
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  className={`mt-8 w-full rounded-md py-6 text-[13.5px] font-bold uppercase tracking-wider ${
                    p.destaque
                      ? "bg-[#22A55C] text-white hover:bg-[#1a8049]"
                      : "bg-[#2C7BC4] text-white hover:bg-[#1f5d96]"
                  }`}
                >
                  <Link to={checkoutUrl(p.nome)}>
                    Contratar
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function Consultoria() {
  return (
    <section id="solucao" className="bg-white">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#2C7BC4]">Solução completa</p>
          <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.6rem)] font-black tracking-tight text-[#0D2847]">
            Consultoria Financeira <span className="text-[#22A55C]">Personalizada</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[14.5px] leading-relaxed text-[#666]">
            A Tática oferece consultoria estratégica integrada ao nosso sistema para otimizar
            seus processos e impulsionar o crescimento.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {consultoria.map(({ icon: Icon, t, d }) => (
            <div
              key={t}
              className="flex gap-5 rounded-2xl border-l-4 border-[#22A55C] bg-[#F5F0E8] p-7 transition hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#2C7BC4]/10 text-[#2C7BC4]">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[15.5px] font-black tracking-tight text-[#0D2847]">{t}</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#666]">{d}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-14 text-center">
          <Button asChild size="lg" className="h-12 rounded-md bg-[#2C7BC4] px-7 text-[14px] font-bold uppercase tracking-wider text-white hover:bg-[#1f5d96]">
            <a href={whatsappUrl} target="_blank" rel="noreferrer">
              Quero contratar
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

function Fundadores() {
  return (
    <section className="relative overflow-hidden bg-[#0D2847] text-white">
      <div className="pointer-events-none absolute -left-32 top-1/2 h-[400px] w-[400px] -translate-y-1/2 rounded-full bg-[#2C7BC4]/15 blur-3xl" />
      <div className="relative mx-auto max-w-5xl px-6 py-24">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#22A55C]">Quem está por trás</p>
          <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.6rem)] font-black tracking-tight">
            Conheça nossos <span className="text-[#22A55C]">fundadores</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[14.5px] leading-relaxed text-[#9FB3CE]">
            A Tática é formada por especialistas com experiência real em gestão financeira e tecnologia.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {fundadores.map((f) => (
            <div key={f.nome} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur">
              <div className="aspect-[4/3] w-full">
                <PhotoFrame
                  src={f.foto}
                  alt={`Foto de ${f.nome}`}
                  rounded="rounded-none"
                  fallbackIcon={User}
                  fallbackLabel={`Foto · ${f.inicial}`}
                />
              </div>
              <div className="p-7">
                <p className="text-[18px] font-black tracking-tight text-white">{f.nome}</p>
                <p className="mt-1 text-[11.5px] font-bold uppercase tracking-[0.14em] text-[#22A55C]">{f.cargo}</p>
                <p className="mt-4 text-[14px] leading-relaxed text-[#B8C8E0]">{f.bio}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-[11.5px] text-white/40">
          Para trocar as fotos, salve os arquivos como{" "}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-white/70">public/images/fundador-1.jpg</code> e{" "}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-white/70">public/images/fundador-2.jpg</code>.
        </p>
      </div>
    </section>
  );
}

function CTAFinal() {
  return (
    <section id="contato" className="bg-[#0D2847] text-center text-white">
      <div className="mx-auto max-w-3xl px-6 py-24">
        <h2 className="text-[clamp(2rem,4.5vw,2.8rem)] font-black leading-[1.12] tracking-tight">
          Estamos prontos para ser seu <span className="text-[#22A55C]">parceiro estratégico</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-[#9FB3CE]">
          Transforme a gestão financeira da sua empresa com especialistas dedicados e tecnologia exclusiva.
          Dê o próximo passo agora.
        </p>

        <Button asChild size="lg" className="mt-9 h-14 rounded-md bg-[#2C7BC4] px-10 text-[15px] font-bold uppercase tracking-wider text-white hover:-translate-y-0.5 hover:bg-[#1f5d96] hover:shadow-[0_12px_30px_rgba(44,123,196,0.4)]">
          <a href={whatsappUrl} target="_blank" rel="noreferrer">
            Quero contratar
            <ArrowRight className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#081A30] text-[#7290B0]">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 md:grid-cols-[2fr_1fr_1fr_1.4fr]">
          <div>
            <div className="flex items-center gap-3">
              <LogoSymbol size={36} variant="light" />
              <div className="leading-[1.15]">
                <p className="text-[16px] font-black tracking-tight text-white">TÁTICA</p>
                <p className="text-[14px] font-black tracking-tight text-[#22A55C]">FINANCEIRO</p>
              </div>
            </div>
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed">
              Gestão financeira especializada com sistema próprio para empresas que querem crescer
              com clareza, controle e lucratividade real.
            </p>
          </div>

          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-white">Navegação</p>
            <ul className="mt-4 space-y-2.5 text-[13px]">
              {navLinks.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="hover:text-[#22A55C]">{l.l}</a>
                </li>
              ))}
              <li><Link to="/auth" className="hover:text-[#22A55C]">Acessar sistema</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-white">Redes sociais</p>
            <ul className="mt-4 space-y-2.5 text-[13px]">
              <li><a href="#" className="hover:text-[#22A55C]">Instagram</a></li>
              <li><a href="#" className="hover:text-[#22A55C]">LinkedIn</a></li>
              <li><a href="#" className="hover:text-[#22A55C]">Facebook</a></li>
              <li><a href="#" className="hover:text-[#22A55C]">YouTube</a></li>
            </ul>
          </div>

          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-white">Contato</p>
            <ul className="mt-4 space-y-3 text-[13px]">
              <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-[#22A55C]" /> (35) 99990-5768</li>
              <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-[#22A55C]" /> ataticagestao@gmail.com</li>
              <li>
                <a href={whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[#22A55C] hover:text-white">
                  <MessageSquare className="h-4 w-4" /> WhatsApp direto
                </a>
              </li>
              <li className="flex items-center gap-2"><Building2 className="h-4 w-4 text-[#22A55C]" /> ataticagestao.com</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-white/5 pt-6 md:flex-row md:items-center">
          <p className="text-[12px]">TÁTICA FINANCEIRO © {new Date().getFullYear()} — Todos os direitos reservados.</p>
          <div className="flex gap-2.5">
            <a href="#" aria-label="LinkedIn" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-[#2C7BC4] hover:text-white">
              <Linkedin className="h-4 w-4" />
            </a>
            <a href="#" aria-label="Instagram" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-[#2C7BC4] hover:text-white">
              <Instagram className="h-4 w-4" />
            </a>
            <a href="#" aria-label="Facebook" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-[#2C7BC4] hover:text-white">
              <Facebook className="h-4 w-4" />
            </a>
            <a href="#" aria-label="YouTube" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-[#2C7BC4] hover:text-white">
              <Youtube className="h-4 w-4" />
            </a>
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
      className="fixed bottom-6 right-6 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-[0_4px_20px_rgba(37,211,102,0.45)] transition hover:scale-110 hover:bg-[#1ebe57]"
    >
      <MessageSquare className="h-6 w-6" />
    </a>
  );
}
