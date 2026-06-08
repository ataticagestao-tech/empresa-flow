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

const WHATSAPP_NUMERO = "5535999647089";
const WHATSAPP_MSG = encodeURIComponent(
  "Olá! Quero um diagnóstico financeiro gratuito da minha clínica."
);
const whatsappUrl = `https://wa.me/${WHATSAPP_NUMERO}?text=${WHATSAPP_MSG}`;

const checkoutUrl = (plano: string) => `/checkout?plano=${encodeURIComponent(plano)}`;

const heroBullets = [
  "Especialista em clínicas de estética e saúde — capilar, dermato e harmonização",
  "Sistema próprio que mostra o lucro real de cada procedimento",
  "A taxa do cartão para de comer sua margem no parcelado",
  "Precificação, regime tributário e repasse de profissionais sob controle",
  "De 1% a 5% do faturamento de volta no seu caixa, todo mês",
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
  { n: "Até 5%", l: "do faturamento de volta no seu caixa" },
  { n: "100%", l: "focado em clínicas de estética e saúde" },
  { n: "Sócio médico", l: "DNA clínico na gestão financeira", small: true },
  { n: "Sistema próprio", l: "tecnologia exclusiva Tática", small: true },
];

const sistemaCards = [
  { icon: Sparkles, t: "IA que lê seus boletos", d: "Mande a foto ou o PDF do boleto e a IA preenche o lançamento sozinha. Zero digitação, zero erro de conta." },
  { icon: Zap, t: "Conciliação automática", d: "Importa o extrato (OFX, PDF ou foto) e o sistema bate banco × clínica e aponta as diferenças. Em minutos, não em dias." },
  { icon: BarChart3, t: "DRE em tempo real", d: "Veja se a clínica lucra ou perde todo mês, com margem e resultado por conta — sem esperar o contador." },
  { icon: LineChart, t: "Indicadores de controller", d: "Ponto de equilíbrio, margem, ciclo de caixa e liquidez calculados sozinhos — na tela do seu celular." },
  { icon: Bell, t: "Cobrança automática", d: "Régua de cobrança que avisa o cliente inadimplente sozinha. O sistema cobra enquanto você atende." },
  { icon: Building2, t: "Multi-unidade num login", d: "Mais de uma sala ou CNPJ? Veja tudo consolidado num painel só, trocando de empresa num clique." },
];

const servicos = [
  { t: "Diagnóstico Financeiro", d: "Mapeamos onde sua clínica perde dinheiro hoje — maquininha, imposto, precificação e repasses — com dados reais do seu negócio." },
  { t: "Custo de cartão sob controle", d: "A maioria das clínicas paga taxa e antecipação acima do necessário — e nem percebe no meio do parcelado. Acho o vazamento e renegocio com a força de quem fecha isso para várias clínicas, protegendo a sua margem." },
  { t: "Precificação de Procedimentos", d: "Definimos o preço certo de cada procedimento com base em custo real, repasse e margem — fim do preço no chute." },
  { t: "Enquadramento Tributário", d: "Revisão de CNAE e regime para a clínica não pagar imposto a mais — economia que aparece já no mês seguinte." },
  { t: "Repasse de Profissionais", d: "Cálculo e controle das comissões de médicos e profissionais, com clareza do que é da clínica e do que é repasse." },
  { t: "Contas a Pagar e a Receber", d: "Pagamentos sem atraso e recebíveis acompanhados — previsão de entradas mesmo com tudo parcelado no cartão." },
  { t: "Conciliação Bancária", d: "Extratos, cartões e antecipações conferidos automaticamente, identificando divergências e taxas escondidas." },
  { t: "Fluxo de Caixa e DRE", d: "Entradas, saídas e resultado da clínica em tempo real — saiba, no dia 1º, quanto você realmente lucrou." },
  { t: "Emissão de Notas Fiscais", d: "Emissão e envio automático direto pelo sistema Tática, com rastreabilidade fiscal completa." },
];

const planos = [
  {
    nome: "Clínica em início",
    desc: "Pra quem está organizando o financeiro pela primeira vez.",
    preco: "2.500",
    bullets: [
      "Diagnóstico financeiro completo",
      "Taxas de cartão e antecipação otimizadas",
      "Enquadramento tributário (CNAE/regime)",
      "BPO: contas a pagar, receber e conciliação",
      "Sistema Tática + DRE e fluxo de caixa",
      "1 reunião mensal de resultados",
    ],
    destaque: false,
  },
  {
    nome: "Clínica em crescimento",
    desc: "O pacote da maioria das clínicas de estética.",
    preco: "3.000",
    bullets: [
      "Tudo do início, e mais:",
      "Precificação de procedimentos",
      "Controle de repasse de profissionais",
      "Emissão de notas fiscais",
      "Previsão de caixa e metas",
      "Acompanhamento quinzenal",
    ],
    destaque: true,
  },
  {
    nome: "Clínica consolidada",
    desc: "Pra clínicas maiores ou com mais de uma unidade.",
    preco: "3.900",
    bullets: [
      "Tudo do crescimento, e mais:",
      "Multi-unidade consolidada (vários CNPJs)",
      "Planejamento financeiro e cenários",
      "CFO as a Service dedicado",
      "Indicadores por unidade",
      "Reuniões semanais",
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
    inicial: "I",
    foto: "/images/fundador-1.jpg",
    nome: "Izabel Vieira",
    cargo: "Co-fundadora · Gestão Financeira & BPO",
    bio: "Especialista em gestão financeira que estrutura caixa, precificação e tributário de clínicas. Lidera o desenvolvimento do Sistema Tática, transformando os números da clínica em decisão e lucro.",
  },
  {
    inicial: "G",
    foto: "/images/fundador-2.jpg",
    nome: "Dr. Gustavo Alex",
    cargo: "Co-fundador · Médico",
    bio: "Médico e sócio da Tática, traz a visão de quem vive a rotina da clínica por dentro. Garante que a gestão financeira fale a língua do consultório — do repasse de profissionais ao custo de cada procedimento.",
  },
];

const navLinks = [
  { href: "#sobre", l: "Sobre nós" },
  { href: "#sistema", l: "Nosso Sistema" },
  { href: "#plataforma", l: "Plataforma" },
  { href: "#servicos", l: "Serviços" },
  { href: "#planos", l: "Planos" },
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

  // Fontes (Fraunces + Nunito Sans) + textura de grão — escopado à landing.
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Nunito+Sans:wght@400;600;700;800&display=swap";
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.textContent =
      ".tatica-lp{font-family:'Nunito Sans',system-ui,sans-serif;background-color:#F5F0E6;background-image:linear-gradient(to right,rgba(2,10,23,.06) 1px,transparent 1px),linear-gradient(to bottom,rgba(2,10,23,.06) 1px,transparent 1px);background-size:78px 78px;background-repeat:repeat}" +
      ".tatica-lp h1,.tatica-lp h2,.tatica-lp h3{font-family:'Fraunces',Georgia,serif;font-weight:600;letter-spacing:-.01em}" +
      ".tatica-lp::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:60;opacity:.55;mix-blend-mode:soft-light;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='gr'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23gr)' opacity='0.5'/%3E%3C/svg%3E\")}";
    document.head.appendChild(style);
    return () => {
      link.remove();
      style.remove();
    };
  }, []);

  return (
    <div className="tatica-lp min-h-screen overflow-x-clip bg-[#F5F0E6] text-[#2B2620] font-sans antialiased">
      <TopBar />
      <Hero />
      <Sobre />
      <Sistema />
      <GaleriaSistema />
      <TudoNumSistema />
      <Servicos />
      <Planos />
      <Consultoria />
      <Fundadores />
      <Seguranca />
      <CTAFinal />
      <Footer />
      <WhatsAppFloat />
    </div>
  );
}

function LogoOficial({
  variant = "dark",
  size = "md",
  className = "",
}: {
  variant?: "dark" | "light";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const text = variant === "light" ? "#FFFFFF" : "#171717";
  const brandGreen = "#065F46";
  const dims = {
    sm: { sym: 28, font: 19, sub: 8, gap: 1, subTracking: "0.16em" },
    md: { sym: 38, font: 26, sub: 9, gap: 2, subTracking: "0.18em" },
    lg: { sym: 52, font: 34, sub: 11, gap: 3, subTracking: "0.20em" },
  }[size];

  return (
    <div className={`inline-flex items-center gap-3 ${className}`} aria-label="Tática Financeiro">
      <svg
        width={dims.sym}
        height={dims.sym}
        viewBox="0 0 80 80"
        fill={brandGreen}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="m13.33,0C5.97,0,0,5.97,0,13.33s5.97,13.34,13.33,13.33c7.36,0,13.33-5.97,13.33-13.33,0-7.36-5.97-13.33-13.33-13.33Z" />
        <path d="m66.67,53.33c-5.75,0-10.95-2.33-14.71-6.09l-.5-.5c2.45-4.16,2.45-9.32,0-13.48l.5-.5c3.77-3.76,8.97-6.09,14.71-6.09,7.36,0,13.33-5.97,13.33-13.33S74.03,0,66.67,0s-13.33,5.97-13.33,13.33c0,5.74-2.33,10.95-6.09,14.71l-.5.5c-5.11-3.01-11.78-2.36-16.17,2.02-4.39,4.39-5.03,11.06-2.02,16.17l-.5.5c-3.77,3.76-8.97,6.09-14.71,6.09-7.36,0-13.33,5.97-13.33,13.33s5.97,13.33,13.33,13.33,13.33-5.97,13.33-13.33c0-5.75,2.33-10.95,6.09-14.71l.5-.5c4.16,2.45,9.32,2.45,13.48,0l.5.5c3.76,3.77,6.09,8.97,6.09,14.71,0,7.36,5.97,13.33,13.33,13.33s13.33-5.97,13.33-13.33-5.97-13.33-13.33-13.33Z" />
      </svg>
      <div className="leading-none">
        <p
          className="font-bold tracking-tight"
          style={{
            color: text,
            fontSize: dims.font,
            lineHeight: 1,
          }}
        >
          TÁTICA
        </p>
        <p
          className="font-bold uppercase"
          style={{
            color: brandGreen,
            fontSize: dims.sub,
            letterSpacing: dims.subTracking,
            marginTop: dims.gap,
          }}
        >
          Financeiro
        </p>
      </div>
    </div>
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
    <header className="sticky top-0 z-50 border-b border-black/5 bg-white/95 backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
      <div className="mx-auto flex h-[60px] max-w-6xl items-center justify-between px-4 md:h-[72px] md:px-6">
        <Link to="/" className="flex items-center">
          <LogoOficial size="sm" variant="dark" />
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {navLinks.map((x) => (
            <a key={x.href} href={x.href} className="text-[15px] font-medium text-[#020A17]/75 transition hover:text-[#065F46]">
              {x.l}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild className="hidden rounded-md bg-[#065F46] px-5 text-white hover:bg-[#064E3B] sm:inline-flex">
            <a href={whatsappUrl} target="_blank" rel="noreferrer">
              Diagnóstico gratuito
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </a>
          </Button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-md text-[#020A17]/80 hover:bg-black/5 lg:hidden"
            aria-label="Abrir menu"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-black/5 bg-white lg:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-3">
            {navLinks.map((x) => (
              <a key={x.href} href={x.href} onClick={() => setOpen(false)} className="rounded px-2 py-2 text-[15px] text-[#020A17]/80 hover:bg-black/5 hover:text-[#065F46]">
                {x.l}
              </a>
            ))}
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="mt-2 rounded-md bg-[#065F46] px-4 py-2.5 text-center text-[15px] font-semibold text-white">
              Diagnóstico gratuito
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#020A17] via-[#0B1F33] to-[#020A17] text-white">
      <div className="pointer-events-none absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full bg-[#065F46]/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full bg-[#065F46]/10 blur-3xl" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-14 pt-10 md:gap-14 md:px-6 md:pb-24 md:pt-28 md:grid-cols-[1.1fr_0.9fr]">
        <div>
          <Badge variant="outline" className="rounded-full border-[#065F46]/40 bg-[#065F46]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#34D399]">
            <Sparkles className="mr-1.5 h-3 w-3" />
            BPO Financeiro para clínicas de estética e saúde
          </Badge>

          <h1 className="mt-5 text-[clamp(1.9rem,7vw,3.4rem)] font-black leading-[1.1] tracking-tight md:mt-6">
            Cuide dos seus pacientes.<br />
            <span className="text-[#34D399]">A Tática cuida</span><br />
            do seu financeiro.
          </h1>

          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-[#CFC8BA]">
            Gestão financeira especializada para <strong className="text-white">clínicas de estética e saúde</strong>,
            feita por quem entende maquininha de procedimento parcelado, precificação e repasse de profissionais —
            potencializada pelo nosso <strong className="text-[#065F46]">sistema próprio</strong>.
          </p>

          <ul className="mt-7 space-y-2">
            {heroBullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-[15.5px] text-[#D6CFC1]">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#34D399]" />
                {b}
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center md:mt-8">
            <Button asChild size="lg" className="h-12 w-full rounded-md bg-[#065F46] px-7 text-[17px] font-bold uppercase tracking-[0.5px] text-white transition hover:-translate-y-0.5 hover:bg-[#064E3B] hover:shadow-[0_8px_24px_rgba(44,123,196,0.35)] sm:w-auto">
              <a href={whatsappUrl} target="_blank" rel="noreferrer">
                Diagnóstico gratuito
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 w-full rounded-md border-white/20 bg-transparent px-7 text-[15px] text-[#CFC8BA] hover:border-[#065F46] hover:bg-transparent hover:text-[#065F46] sm:w-auto">
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
                  ? "border-[#065F46] bg-[#065F46]/10"
                  : "border-white/10 bg-white/[0.04]"
              }`}
            >
              <div className={`grid h-11 w-11 place-items-center rounded-lg ${destaque ? "bg-[#065F46]/25 text-[#34D399]" : "bg-[#065F46]/20 text-[#7AB8F0]"}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-[16px] font-bold tracking-tight text-white">{titulo}</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-[#A79E8E]">{txt}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Sobre() {
  return (
    <section id="sobre" className="bg-transparent">
      <div className="mx-auto max-w-6xl px-5 py-14 md:px-6 md:py-24">
        <div className="grid items-center gap-14 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1351B4]">Quem somos</p>
            <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.4rem)] font-black leading-[1.2] tracking-tight text-[#020A17]">
              Parceiro estratégico que <span className="text-[#065F46]">revela oportunidades</span> para decisões baseadas em dados
            </h2>
            <div className="mt-6 space-y-4 text-[16px] leading-relaxed text-[#666]">
              <p>
                Somos especialistas em gestão financeira para empresas que querem crescer com segurança.
                Nossa missão é ser o parceiro que transforma números em decisões estratégicas.
              </p>
              <p>
                Cuidamos da análise, planejamento e execução financeira da sua empresa, potencializados pelo nosso
                {" "}<strong className="text-[#020A17]">sistema próprio</strong>, desenvolvido para as reais necessidades do seu negócio.
              </p>
              <p className="text-[#020A17]">
                Mais que um financeiro terceirizado: <strong>impulsionamos seu crescimento estratégico e sustentável.</strong>
              </p>
            </div>
            <Button asChild className="mt-8 h-11 rounded-md bg-[#065F46] px-6 text-[14.5px] font-bold uppercase tracking-wider text-white hover:bg-[#064E3B]">
              <a href={whatsappUrl} target="_blank" rel="noreferrer">
                Diagnóstico gratuito
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>

          <div className="space-y-4">
            <div className="aspect-[16/10] w-full overflow-hidden rounded-2xl bg-[#020A17]">
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
                <div key={s.l} className="rounded-2xl border border-black/5 border-t-[3px] border-t-[#065F46] bg-white p-6 text-center shadow-[0_2px_16px_rgba(0,0,0,0.05)]">
                  <p className={`font-black tracking-tight text-[#020A17] ${s.small ? "text-[17px] leading-tight" : "text-[32px]"}`}>{s.n}</p>
                  <p className="mt-1 text-[13px] text-[#666]">{s.l}</p>
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
    <section id="sistema" className="relative overflow-hidden bg-[#020A17] text-white">
      <div className="pointer-events-none absolute -right-32 top-1/2 h-[500px] w-[500px] -translate-y-1/2 rounded-full bg-[#065F46]/10 blur-3xl" />
      <div className="relative mx-auto max-w-6xl px-5 py-14 md:px-6 md:py-24">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#34D399]">Nosso grande diferencial</p>
          <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.6rem)] font-black leading-tight tracking-tight">
            Sistema <span className="text-[#34D399]">Próprio</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-relaxed text-[#A79E8E]">
            Enquanto outros dependem de ferramentas genéricas, a Tática opera com plataforma desenvolvida
            internamente para entregar mais agilidade, precisão e controle.
          </p>
        </div>

        <div className="relative mx-auto mt-14 max-w-4xl">
          <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-[#065F46]/25 via-transparent to-[#065F46]/15 blur-2xl" />
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
            <div key={t} className="rounded-2xl border border-white/10 bg-white/[0.04] p-7 transition hover:-translate-y-1 hover:border-[#065F46]/50 hover:bg-white/[0.06]">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#065F46]/15 text-[#34D399]">
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-5 text-[17px] font-bold tracking-tight text-white">{t}</p>
              <p className="mt-2 text-[14.5px] leading-relaxed text-[#A79E8E]">{d}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-[#065F46]/40 bg-[#065F46]/10 p-8 md:p-10">
          <div className="grid items-start gap-7 md:grid-cols-[auto_1fr]">
            <div className="grid h-16 w-16 place-items-center rounded-xl bg-[#065F46]/25 text-[#065F46]">
              <Cpu className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-[20px] font-black tracking-tight text-[#34D399]">
                Por que sistema próprio faz diferença?
              </h3>
              <p className="mt-3 text-[15.5px] leading-relaxed text-[#D6CFC1]">
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
                  <li key={x} className="flex items-start gap-2.5 text-[14.5px] text-[#CFC8BA]">
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1351B4]" />
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

function GaleriaSistema() {
  const grupos = [
    {
      titulo: "Operação Financeira",
      sub: "Tudo que entra e tudo que sai, rastreado por convênio, procedimento e unidade",
      thumbs: [
        { src: "/images/sistema/vendas.png", label: "Vendas", desc: "Lançamento por procedimento, convênio ou particular." },
        { src: "/images/sistema/contas-receber.png", label: "Contas a Receber", desc: "Recebimentos abertos, parciais e quitados em um só lugar." },
        { src: "/images/sistema/contas-pagar.png", label: "Contas a Pagar", desc: "Pagamentos agendados com alertas de vencimento." },
      ],
    },
    {
      titulo: "Análise e Decisão",
      sub: "Saber, dia 1º, exatamente quanto sua clínica lucrou",
      thumbs: [
        { src: "/images/sistema/dre.png", label: "DRE Mensal", desc: "Resultado por unidade, em caixa e competência." },
        { src: "/images/sistema/fluxo-caixa.png", label: "Fluxo de Caixa", desc: "Projeção de 90 dias e alerta de saldo crítico." },
        { src: "/images/sistema/conciliacao.png", label: "Conciliação Bancária", desc: "Extratos conferidos com o sistema em minutos." },
      ],
    },
    {
      titulo: "Gestão da Equipe",
      sub: "Folha, ponto e cobrança automatizados — menos retrabalho administrativo",
      thumbs: [
        { src: "/images/sistema/folha-pagamento.png", label: "Folha de Pagamento", desc: "Cálculo de salários, encargos e benefícios." },
        { src: "/images/sistema/regua-cobranca.png", label: "Régua de Cobrança", desc: "Lembretes automáticos por WhatsApp e e-mail." },
        { src: "/images/sistema/relatorios.png", label: "Relatórios Gerenciais", desc: "DRE, fluxo, inadimplência e contábil em um clique." },
      ],
    },
  ];

  return (
    <section id="plataforma" className="bg-transparent">
      <div className="mx-auto max-w-6xl px-5 py-14 md:px-6 md:py-24">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1351B4]">A plataforma</p>
          <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.6rem)] font-black tracking-tight text-[#020A17]">
            Veja o sistema <span className="text-[#065F46]">em funcionamento</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15.5px] leading-relaxed text-[#666]">
            Telas reais do Tática Gestão. A mesma plataforma usada pela nossa equipe de BPO
            estará disponível para a sua clínica em tempo real.
          </p>
        </div>

        <div className="relative mx-auto mt-10 max-w-5xl md:mt-14">
          <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-[#065F46]/20 via-transparent to-[#065F46]/15 blur-2xl" />
          <div className="overflow-hidden rounded-2xl border border-black/8 bg-[#020A17] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.3)]">
            <img
              src="/images/sistema/dashboard.png"
              alt="Dashboard principal Tática Gestão"
              loading="lazy"
              className="block w-full"
            />
          </div>
          <p className="mt-4 text-center text-[13px] text-[#666]">
            <strong className="text-[#020A17]">Dashboard principal</strong> · indicadores consolidados por unidade
          </p>
        </div>

        <div className="mt-12 space-y-12 md:mt-16 md:space-y-16">
          {grupos.map((g) => (
            <div key={g.titulo}>
              <div className="mb-6 flex flex-col items-start gap-1 border-l-4 border-[#065F46] pl-4 md:mb-8">
                <h3 className="text-[17px] font-black tracking-tight text-[#020A17] md:text-[18px]">{g.titulo}</h3>
                <p className="text-[13px] leading-relaxed text-[#666] md:text-[14.5px]">{g.sub}</p>
              </div>
              <div className="grid gap-5 md:grid-cols-3">
                {g.thumbs.map((t) => (
                  <div
                    key={t.label}
                    className="overflow-hidden rounded-2xl border border-black/8 bg-white shadow-[0_8px_24px_-12px_rgba(0,0,0,0.1)] transition hover:-translate-y-1 hover:shadow-[0_16px_32px_-15px_rgba(0,0,0,0.18)]"
                  >
                    <div className="overflow-hidden bg-[#F5F0E6]">
                      <img src={t.src} alt={t.label} loading="lazy" className="block w-full" />
                    </div>
                    <div className="border-t border-black/5 p-4 md:p-5">
                      <p className="text-[14.5px] font-bold tracking-tight text-[#020A17]">{t.label}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-[#666]">{t.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-12 max-w-2xl text-center text-[13px] italic text-[#666] md:mt-14">
          Telas reais da plataforma — nome da empresa anonimizado.
          Existem mais de 20 módulos integrados, incluindo Multi-empresa, Estoque, NFS-e e Painel Gerencial.
        </p>
      </div>
    </section>
  );
}

function TudoNumSistema() {
  const fluxo = ["Lançamento", "Conciliação", "DRE", "Fluxo de caixa", "Indicadores"];
  const modulos = [
    { icon: BarChart3, t: "Financeiro", d: "Contas, caixa, conciliação e DRE" },
    { icon: ShieldCheck, t: "Fiscal", d: "NFSe e previsão de impostos" },
    { icon: Users2, t: "RH & Folha", d: "Admissão, ponto e pagamento" },
    { icon: Layers, t: "Estoque", d: "Entradas, saídas e compras" },
    { icon: TrendingUp, t: "Vendas", d: "Ticket médio e mais vendidos" },
    { icon: Building2, t: "Multi-empresa", d: "Várias unidades num login" },
  ];
  return (
    <section className="relative overflow-hidden bg-[#020A17] text-white">
      <div className="pointer-events-none absolute -right-32 top-1/3 h-[440px] w-[440px] rounded-full bg-[#065F46]/10 blur-3xl" />
      <div className="relative mx-auto max-w-6xl px-5 py-14 md:px-6 md:py-24">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#34D399]">Por que é diferente</p>
          <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.6rem)] font-black tracking-tight">
            Tudo num sistema só. <span className="text-[#34D399]">Sem planilha, sem retrabalho.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15.5px] leading-relaxed text-[#A79E8E]">
            Do lançamento ao resultado, num fluxo único — o que a maioria das clínicas resolve com quatro ferramentas e um monte de planilha.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-2 md:mt-12">
          {fluxo.map((f, i) => (
            <div key={f} className="flex items-center gap-2">
              <span className="rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-[13px] font-bold text-white md:px-4 md:py-2 md:text-[14px]">{f}</span>
              {i < fluxo.length - 1 && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#34D399] md:h-4 md:w-4" />}
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modulos.map(({ icon: Icon, t, d }) => (
            <div key={t} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:-translate-y-0.5 hover:border-[#065F46]/40">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#065F46]/20 text-[#34D399]">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[15.5px] font-black tracking-tight text-white">{t}</p>
                <p className="text-[13.5px] text-[#A79E8E]">{d}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="flex items-start gap-4 rounded-2xl border border-[#065F46]/30 bg-[#065F46]/[0.12] p-6">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#065F46] text-white"><Sparkles className="h-5 w-5" /></div>
            <div>
              <p className="text-[16px] font-black text-white">Boleto lido por IA</p>
              <p className="mt-1 text-[14.5px] leading-relaxed text-[#CFC8BA]">Manda a foto do boleto e a IA abre o lançamento já preenchido. Zero digitação.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 rounded-2xl border border-[#1351B4]/40 bg-[#1351B4]/[0.14] p-6">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#1351B4] text-white"><LineChart className="h-5 w-5" /></div>
            <div>
              <p className="text-[16px] font-black text-white">Do micro ao macro</p>
              <p className="mt-1 text-[14.5px] leading-relaxed text-[#CFC8BA]">Selic, IPCA, dólar e Bolsa B3 em tempo real, no mesmo painel dos seus indicadores.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Servicos() {
  return (
    <section id="servicos" className="bg-transparent">
      <div className="mx-auto max-w-6xl px-5 py-14 md:px-6 md:py-24">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1351B4]">O que entregamos</p>
          <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.6rem)] font-black tracking-tight text-[#020A17]">
            Conheça nossos <span className="text-[#065F46]">serviços</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15.5px] leading-relaxed text-[#666]">
            Soluções completas de gestão financeira, do operacional ao estratégico,
            integradas ao nosso sistema próprio.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {servicos.map((s, i) => (
            <div
              key={s.t}
              className="group rounded-2xl border border-black/5 border-l-4 border-l-transparent bg-white p-7 shadow-[0_2px_14px_rgba(0,0,0,0.04)] transition hover:-translate-y-1 hover:border-l-[#065F46] hover:shadow-[0_8px_30px_rgba(0,0,0,0.10)]"
            >
              <div className="grid h-9 w-9 place-items-center rounded-md bg-[#065F46]/10 text-[11px] font-black text-[#1351B4]">
                {String(i + 1).padStart(2, "0")}
              </div>
              <p className="mt-4 text-[14.5px] font-black uppercase tracking-wider text-[#020A17]">{s.t}</p>
              <p className="mt-2 text-[14.5px] leading-relaxed text-[#666]">{s.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Button asChild size="lg" className="h-12 rounded-md bg-[#065F46] px-7 text-[17px] font-bold uppercase tracking-[0.5px] text-white hover:bg-[#064E3B]">
            <a href={whatsappUrl} target="_blank" rel="noreferrer">
              Diagnóstico gratuito
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
    <section id="planos" className="bg-transparent">
      <div className="mx-auto max-w-6xl px-5 py-14 md:px-6 md:py-24">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1351B4]">Investimento</p>
          <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.6rem)] font-black tracking-tight text-[#020A17]">
            Pacotes por porte da sua <span className="text-[#065F46]">clínica</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15.5px] leading-relaxed text-[#666]">
            Sistema próprio incluído em todos. O valor final é definido no diagnóstico gratuito, conforme o tamanho da sua clínica.
          </p>
        </div>

        <div className="mt-16 grid gap-7 lg:grid-cols-3">
          {planos.map((p) => (
            <Card
              key={p.nome}
              className={`relative rounded-2xl border-2 transition ${
                p.destaque
                  ? "border-[#065F46] bg-[#020A17] text-white shadow-[0_20px_50px_-20px_rgba(34,165,92,0.45)] lg:-translate-y-3"
                  : "border-black/10 bg-white text-[#020A17] shadow-[0_2px_16px_rgba(0,0,0,0.04)] hover:-translate-y-1 hover:border-[#065F46]/40 hover:shadow-[0_12px_40px_rgba(0,0,0,0.10)]"
              }`}
            >
              {p.destaque && (
                <div className="absolute left-1/2 top-0 -translate-x-1/2 translate-y-[-50%]">
                  <Badge className="rounded-full bg-[#065F46] px-4 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-white hover:bg-[#065F46]">
                    Mais popular
                  </Badge>
                </div>
              )}

              <CardContent className="p-6 md:p-8">
                <h3 className={`text-[24px] font-black tracking-tight ${p.destaque ? "text-white" : "text-[#020A17]"}`}>
                  {p.nome}
                </h3>
                <p className={`mt-1.5 text-[14px] leading-snug ${p.destaque ? "text-[#D6CFC1]" : "text-[#666]"}`}>{p.desc}</p>

                <div className="mt-5">
                  <span className={`text-[13px] ${p.destaque ? "text-[#A79E8E]" : "text-[#8A8174]"}`}>a partir de</span>
                  <div className="flex items-end gap-1.5">
                    <span className={`text-[30px] font-black tracking-tight ${p.destaque ? "text-white" : "text-[#020A17]"}`}>R$ {p.preco}</span>
                    <span className={`mb-1.5 text-[14px] ${p.destaque ? "text-[#D6CFC1]" : "text-[#666]"}`}>/mês</span>
                  </div>
                  <span className={`text-[13px] ${p.destaque ? "text-[#A79E8E]" : "text-[#8A8174]"}`}>+ implantação R$ 4.500 (única)</span>
                </div>

                <ul className="mt-6 space-y-0">
                  {p.bullets.map((b, i) => (
                    <li
                      key={b}
                      className={`flex items-start gap-3 py-2.5 text-[14.5px] ${
                        p.destaque ? "text-[#D6CFC1]" : "text-[#666]"
                      } ${i < p.bullets.length - 1 ? (p.destaque ? "border-b border-white/8" : "border-b border-[#ECE3D3]") : ""}`}
                    >
                      <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${p.destaque ? "text-[#34D399]" : "text-[#1351B4]"}`} />
                      {b}
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  className={`mt-8 w-full rounded-md py-6 text-[14.5px] font-bold uppercase tracking-wider ${
                    p.destaque
                      ? "bg-[#065F46] text-white hover:bg-[#064E3B]"
                      : "bg-[#065F46] text-white hover:bg-[#064E3B]"
                  }`}
                >
                  <a href={whatsappUrl} target="_blank" rel="noreferrer">
                    Agendar diagnóstico
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
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
    <section id="solucao" className="bg-transparent">
      <div className="mx-auto max-w-6xl px-5 py-14 md:px-6 md:py-24">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1351B4]">Solução completa</p>
          <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.6rem)] font-black tracking-tight text-[#020A17]">
            Consultoria Financeira <span className="text-[#065F46]">Personalizada</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15.5px] leading-relaxed text-[#666]">
            A Tática oferece consultoria estratégica integrada ao nosso sistema para otimizar
            seus processos e impulsionar o crescimento.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {consultoria.map(({ icon: Icon, t, d }) => (
            <div
              key={t}
              className="flex gap-5 rounded-2xl border border-black/5 border-l-4 border-l-[#065F46] bg-white p-7 shadow-[0_2px_16px_rgba(0,0,0,0.05)] transition hover:-translate-y-1 hover:shadow-[0_10px_30px_rgba(0,0,0,0.10)]"
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#065F46]/10 text-[#1351B4]">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[16.5px] font-black tracking-tight text-[#020A17]">{t}</p>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-[#666]">{d}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-14 text-center">
          <Button asChild size="lg" className="h-12 rounded-md bg-[#065F46] px-7 text-[17px] font-bold uppercase tracking-[0.5px] text-white hover:bg-[#064E3B]">
            <a href={whatsappUrl} target="_blank" rel="noreferrer">
              Diagnóstico gratuito
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
    <section className="relative overflow-hidden bg-[#020A17] text-white">
      <div className="pointer-events-none absolute -left-32 top-1/2 h-[400px] w-[400px] -translate-y-1/2 rounded-full bg-[#065F46]/15 blur-3xl" />
      <div className="relative mx-auto max-w-5xl px-5 py-14 md:px-6 md:py-24">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#34D399]">Quem está por trás</p>
          <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.6rem)] font-black tracking-tight">
            Conheça nossos <span className="text-[#34D399]">fundadores</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15.5px] leading-relaxed text-[#A79E8E]">
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
                <p className="mt-1 text-[11.5px] font-bold uppercase tracking-[0.14em] text-[#34D399]">{f.cargo}</p>
                <p className="mt-4 text-[15px] leading-relaxed text-[#CFC8BA]">{f.bio}</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}

function Seguranca() {
  const itens = [
    { icon: Briefcase, t: "Sigilo em contrato", d: "Tudo formalizado: contrato de prestação de serviço com cláusula de confidencialidade." },
    { icon: ShieldCheck, t: "Conformidade com a LGPD", d: "Seus dados financeiros tratados conforme a Lei Geral de Proteção de Dados." },
    { icon: Lock, t: "Criptografia e backups", d: "Informações protegidas com criptografia e backups automáticos na nossa infraestrutura." },
    { icon: Users2, t: "Você no controle", d: "Acesso controlado e auditável. Você decide o que compartilha — e o controle continua sendo seu." },
  ];
  return (
    <section className="bg-transparent">
      <div className="mx-auto max-w-6xl px-5 py-14 md:px-6 md:py-24">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1351B4]">Confiança e segurança</p>
          <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.6rem)] font-black tracking-tight text-[#020A17]">
            Seu financeiro em <span className="text-[#065F46]">mãos seguras</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15.5px] leading-relaxed text-[#666]">
            Cuidamos de dado sensível como se fosse o nosso. Tudo formalizado, criptografado e sob sigilo.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {itens.map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-2xl border border-black/5 bg-white p-6 shadow-[0_2px_16px_rgba(0,0,0,0.05)]">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#065F46]/10 text-[#065F46]">
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-5 text-[16px] font-black tracking-tight text-[#020A17]">{t}</p>
              <p className="mt-2 text-[14px] leading-relaxed text-[#666]">{d}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex items-center justify-center gap-3 rounded-2xl border border-[#065F46]/20 bg-[#065F46]/[0.06] px-6 py-5 text-center">
          <ShieldCheck className="h-5 w-5 shrink-0 text-[#065F46]" />
          <p className="text-[15px] font-semibold text-[#020A17]">
            O diagnóstico é <span className="text-[#065F46]">100% gratuito, sem compromisso e sob sigilo.</span>
          </p>
        </div>
      </div>
    </section>
  );
}

function CTAFinal() {
  return (
    <section id="contato" className="bg-[#020A17] text-center text-white">
      <div className="mx-auto max-w-3xl px-5 py-14 md:px-6 md:py-24">
        <h2 className="text-[clamp(2rem,4.5vw,2.8rem)] font-black leading-[1.12] tracking-tight">
          Estamos prontos para ser seu <span className="text-[#34D399]">parceiro estratégico</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-[#A79E8E]">
          Transforme a gestão financeira da sua empresa com especialistas dedicados e tecnologia exclusiva.
          Dê o próximo passo agora.
        </p>

        <Button asChild size="lg" className="mt-9 h-14 rounded-md bg-[#065F46] px-10 text-[16px] font-bold uppercase tracking-wider text-white hover:-translate-y-0.5 hover:bg-[#064E3B] hover:shadow-[0_12px_30px_rgba(44,123,196,0.4)]">
          <a href={whatsappUrl} target="_blank" rel="noreferrer">
            Diagnóstico gratuito
            <ArrowRight className="ml-2 h-4 w-4" />
          </a>
        </Button>
        <p className="mt-4 text-[13px] text-[#A79E8E]">Sem compromisso e sob sigilo · resposta no mesmo dia.</p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#020A17] text-[#8A8174]">
      <div className="mx-auto max-w-6xl px-5 py-12 md:px-6 md:py-16">
        <div className="grid gap-10 md:grid-cols-[2fr_1fr_1fr_1.4fr]">
          <div>
            <LogoOficial size="sm" variant="light" className="!items-start" />
            <p className="mt-4 max-w-xs text-[14px] leading-relaxed">
              Gestão financeira especializada com sistema próprio para empresas que querem crescer
              com clareza, controle e lucratividade real.
            </p>
          </div>

          <div>
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-white">Navegação</p>
            <ul className="mt-4 space-y-2.5 text-[14px]">
              {navLinks.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="hover:text-[#065F46]">{l.l}</a>
                </li>
              ))}
              <li><Link to="/auth" className="hover:text-[#065F46]">Acessar sistema</Link></li>
              <li><Link to="/privacidade" className="hover:text-[#065F46]">Política de Privacidade</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-white">Redes sociais</p>
            <ul className="mt-4 space-y-2.5 text-[14px]">
              <li><a href="#" className="hover:text-[#065F46]">Instagram</a></li>
              <li><a href="#" className="hover:text-[#065F46]">LinkedIn</a></li>
              <li><a href="#" className="hover:text-[#065F46]">Facebook</a></li>
              <li><a href="#" className="hover:text-[#065F46]">YouTube</a></li>
            </ul>
          </div>

          <div>
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-white">Contato</p>
            <ul className="mt-4 space-y-3 text-[14px]">
              <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-[#34D399]" /> (35) 99964-7089</li>
              <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-[#34D399]" /> ataticagestao@gmail.com</li>
              <li>
                <a href={whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[#34D399] hover:text-white">
                  <MessageSquare className="h-4 w-4" /> WhatsApp direto
                </a>
              </li>
              <li className="flex items-center gap-2"><Building2 className="h-4 w-4 text-[#34D399]" /> ataticagestao.com</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-white/5 pt-6 md:flex-row md:items-center">
          <div className="text-[13px]">
            <p>TÁTICA FINANCEIRO © {new Date().getFullYear()} — Todos os direitos reservados.</p>
            <p className="mt-1 text-[11.5px] text-[#8A8174]/80">CNPJ 57.202.144/0001-48 · Av. Aristides Ribeiro, 58 — Jardim Ribeiro, Varginha/MG · CEP 37068-120</p>
          </div>
          <div className="flex gap-2.5">
            <a href="#" aria-label="LinkedIn" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-[#065F46] hover:text-white">
              <Linkedin className="h-4 w-4" />
            </a>
            <a href="#" aria-label="Instagram" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-[#065F46] hover:text-white">
              <Instagram className="h-4 w-4" />
            </a>
            <a href="#" aria-label="Facebook" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-[#065F46] hover:text-white">
              <Facebook className="h-4 w-4" />
            </a>
            <a href="#" aria-label="YouTube" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-[#065F46] hover:text-white">
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
