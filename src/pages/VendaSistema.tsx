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
  X,
} from "lucide-react";

const WHATSAPP_NUMERO = "5535999647089";
const WHATSAPP_MSG = encodeURIComponent(
  "Olá! Quero um diagnóstico financeiro gratuito da minha clínica."
);
const whatsappUrl = `https://wa.me/${WHATSAPP_NUMERO}?text=${WHATSAPP_MSG}`;

const checkoutUrl = (plano: string) => `/checkout?plano=${encodeURIComponent(plano)}`;

const heroBullets = [
  "Especialista em finanças para a área médica — clínicas, consultórios e procedimentos",
  "Sistema próprio que mostra o lucro real de cada procedimento",
  "A taxa do cartão para de comer sua margem no parcelado",
  "Precificação, regime tributário e repasse de profissionais sob controle",
  "De 1% a 5% do faturamento de volta no seu caixa, todo mês",
];

const heroCards = [
  {
    icon: Briefcase,
    titulo: "Consultoria financeira especialista",
    txt: "Um time dedicado ao financeiro da sua clínica: precificação, tributário, maquininha e fluxo de caixa sob controle.",
    destaque: true,
  },
  {
    icon: Users2,
    titulo: "BPO financeiro completo",
    txt: "Terceirize a operação — contas, conciliação e relatórios. Você cuida do paciente; a gente cuida dos números.",
  },
  {
    icon: Cpu,
    titulo: "Sistema próprio incluído",
    txt: "Toda essa gestão na nossa plataforma exclusiva, em tempo real, sem custo de software à parte.",
  },
];

const entregas = [
  { icon: TrendingUp, txt: <>Negociação que devolve <strong className="text-[#34D399]">3 a 8% do faturamento</strong> ao seu caixa</> },
  { icon: BarChart3, txt: <>Acompanhamento <strong className="text-[#34D399]">contábil</strong> completo</> },
  { icon: Users2, txt: <><strong className="text-[#34D399]">Contratação</strong> de parceiros e funcionários regularizada</> },
  { icon: Target, txt: <><strong className="text-[#34D399]">Precificação</strong> que melhora sua margem</> },
  { icon: Layers, txt: <>Ecossistema: <strong className="text-[#34D399]">contadores, advogados</strong> e mais</> },
  { icon: Cpu, txt: <><strong className="text-[#34D399]">Sistema próprio</strong> pra controlar a clínica e falar com o paciente</> },
];

const sistemaCards = [
  { icon: Sparkles, t: "IA que lê seus boletos", d: "Mande a foto ou o PDF do boleto e a IA preenche o lançamento sozinha. Zero digitação, zero erro de conta.", img: "/images/sistema/contas-pagar.png" },
  { icon: Zap, t: "Conciliação automática", d: "Importa o extrato (OFX, PDF ou foto) e o sistema bate banco × clínica e aponta as diferenças. Em minutos, não em dias.", img: "/images/sistema/conciliacao.png" },
  { icon: BarChart3, t: "DRE em tempo real", d: "Veja se a clínica lucra ou perde todo mês, com margem e resultado por conta — sem esperar o contador.", img: "/images/sistema/dre.png" },
  { icon: LineChart, t: "Indicadores de controller", d: "Ponto de equilíbrio, margem, ciclo de caixa e liquidez calculados sozinhos — na tela do seu celular.", img: "/images/sistema/dashboard.png" },
  { icon: Bell, t: "Cobrança automática", d: "Régua de cobrança que avisa o cliente inadimplente sozinha. O sistema cobra enquanto você atende.", img: "/images/sistema/regua-cobranca.png" },
  { icon: Building2, t: "Multi-unidade num login", d: "Mais de uma sala ou CNPJ? Veja tudo consolidado num painel só, trocando de empresa num clique.", img: "/images/sistema/empresas.png" },
];

const telasSistema = [
  { src: "/images/sistema/dashboard.png", label: "Dashboard" },
  { src: "/images/sistema/vendas.png", label: "Vendas" },
  { src: "/images/sistema/contas-receber.png", label: "Contas a Receber" },
  { src: "/images/sistema/contas-pagar.png", label: "Contas a Pagar" },
  { src: "/images/sistema/movimentacoes.png", label: "Movimentações" },
  { src: "/images/sistema/conciliacao.png", label: "Conciliação Bancária" },
  { src: "/images/sistema/recebiveis-cartao.png", label: "Recebíveis de Cartão" },
  { src: "/images/sistema/recibos.png", label: "Recibos" },
  { src: "/images/sistema/dre.png", label: "DRE Mensal" },
  { src: "/images/sistema/fluxo-caixa.png", label: "Fluxo de Caixa" },
  { src: "/images/sistema/ponto-equilibrio.png", label: "Ponto de Equilíbrio" },
  { src: "/images/sistema/ciclo-caixa-indicadores.png", label: "Ciclo de Caixa e Indicadores" },
  { src: "/images/sistema/metas-orcamento.png", label: "Metas e Orçamento" },
  { src: "/images/sistema/relatorios.png", label: "Relatórios Gerenciais" },
  { src: "/images/sistema/emissao-nf.png", label: "Emissão de NF" },
  { src: "/images/sistema/provisao-impostos.png", label: "Provisão de Impostos" },
  { src: "/images/sistema/xml.png", label: "Importação XML" },
  { src: "/images/sistema/area-contador.png", label: "Área do Contador" },
  { src: "/images/sistema/funcionarios.png", label: "Funcionários" },
  { src: "/images/sistema/salarios.png", label: "Salários" },
  { src: "/images/sistema/folha-pagamento.png", label: "Folha de Pagamento" },
  { src: "/images/sistema/folha-ponto.png", label: "Folha de Ponto" },
  { src: "/images/sistema/regua-cobranca.png", label: "Régua de Cobrança" },
  { src: "/images/sistema/markup-precificacao.png", label: "Markup e Precificação" },
  { src: "/images/sistema/composicao-custo.png", label: "Composição de Custo" },
  { src: "/images/sistema/pacientes.png", label: "Pacientes" },
  { src: "/images/sistema/whatsapp.png", label: "WhatsApp" },
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
    desc: "O pacote da maioria das clínicas e consultórios médicos.",
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
      "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700;800;900&family=Nunito+Sans:wght@400;600;700;800&display=swap";
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.textContent =
      ".tatica-lp{font-family:'Nunito Sans',system-ui,sans-serif;background-color:#FFFFFF;background-image:linear-gradient(to right,rgba(12,42,82,.08) 1px,transparent 1px),linear-gradient(to bottom,rgba(12,42,82,.08) 1px,transparent 1px);background-size:64px 64px;background-repeat:repeat}" +
      ".tatica-navy{background-color:#060E1C;background-image:linear-gradient(to right,rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,.06) 1px,transparent 1px);background-size:64px 64px}" +
      ".tatica-lp h1,.tatica-lp h2,.tatica-lp h3{font-family:'Playfair Display',Georgia,serif;font-weight:700;letter-spacing:-.01em}" +
      ".tatica-marquee{animation:tatica-mq 90s linear infinite}.tatica-marquee:hover{animation-play-state:paused}@keyframes tatica-mq{from{transform:translateX(0)}to{transform:translateX(-50%)}}.tatica-marquee-mask{-webkit-mask-image:linear-gradient(to right,transparent,#000 7%,#000 93%,transparent);mask-image:linear-gradient(to right,transparent,#000 7%,#000 93%,transparent)}.tatica-vscroll{animation:tatica-vs 15s ease-in-out infinite}.tatica-vscroll:hover{animation-play-state:paused}@keyframes tatica-vs{0%,16%{transform:translateY(0)}50%,66%{transform:translateY(-464px)}100%{transform:translateY(0)}}" +
      ".tatica-lp::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:60;opacity:.55;mix-blend-mode:soft-light;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='gr'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23gr)' opacity='0.5'/%3E%3C/svg%3E\")}";
    document.head.appendChild(style);
    return () => {
      link.remove();
      style.remove();
    };
  }, []);

  return (
    <div className="tatica-lp min-h-screen overflow-x-clip bg-white text-[#0C2340] font-sans antialiased">
      <TopBar />
      <div className="h-[72px] md:h-[92px]" aria-hidden="true" />
      <Hero />
      <Sobre />
      <Servicos />
      <Sistema />
      <GaleriaSistema />
      <TudoNumSistema />
      <Overnight />
      <FAQ />
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
  const brandGreen = "#10B981";
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
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#060E1C]/95 backdrop-blur-md shadow-[0_2px_16px_rgba(0,0,0,0.2)]">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-4 md:h-[92px] md:px-6">
        <Link to="/" className="flex items-center">
          <LogoOficial size="md" variant="light" />
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {navLinks.map((x) => (
            <a key={x.href} href={x.href} className="text-[16.5px] font-semibold text-white transition hover:text-[#34D399]">
              {x.l}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild className="hidden rounded-md bg-[#10B981] px-5 text-white hover:bg-[#059669] sm:inline-flex">
            <a href={whatsappUrl} target="_blank" rel="noreferrer">
              Falar no WhatsApp
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </a>
          </Button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-md text-white/80 hover:bg-white/10 lg:hidden"
            aria-label="Abrir menu"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-[#060E1C] lg:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-3">
            {navLinks.map((x) => (
              <a key={x.href} href={x.href} onClick={() => setOpen(false)} className="rounded px-2 py-2 text-[16.5px] text-white hover:bg-white/10 hover:text-[#34D399]">
                {x.l}
              </a>
            ))}
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="mt-2 rounded-md bg-[#10B981] px-4 py-2.5 text-center text-[15px] font-semibold text-white">
              Falar no WhatsApp
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-transparent text-[#020A17]">
      <div className="relative mx-auto grid max-w-6xl items-stretch gap-10 px-5 pb-16 pt-8 md:gap-14 md:px-6 md:pb-24 md:pt-16 lg:grid-cols-[0.92fr_1.08fr]">
        <div>
          <Badge className="max-w-full whitespace-normal rounded-2xl bg-[#1351B4] px-3.5 py-1.5 text-[10px] font-bold uppercase leading-snug tracking-[0.04em] text-white shadow-[0_8px_22px_-8px_rgba(19,81,180,0.65)] hover:bg-[#1351B4] lg:whitespace-nowrap lg:rounded-full">
            <Sparkles className="mr-1.5 h-3 w-3" />
            Consultoria & BPO financeiro · especialista na área médica
          </Badge>

          <h1 className="mt-5 text-[clamp(1.9rem,7vw,3.4rem)] font-black leading-[1.1] tracking-tight md:mt-6">
            Cuide dos seus pacientes.<br />
            <span className="text-[#1351B4]">A Tática cuida</span><br />
            do seu financeiro.
          </h1>

          <div className="mt-5 max-w-xl space-y-3.5 text-[15.5px] leading-relaxed text-[#1A1A1A]">
            <p>
              <strong className="text-[#1351B4]">BPO Financeiro e Administrativo</strong> especializado em clínicas: gestão de <strong className="text-[#1351B4]">repasses, precificação e contratos</strong>.
            </p>
            <p>
              Controle total da sua operação através de uma <strong className="text-[#1351B4]">equipe especialista</strong> e <strong className="text-[#1351B4]">sistema próprio</strong>, desenhado para <strong className="text-[#1351B4]">clínicas e hospitais</strong>.
            </p>
          </div>


          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center md:mt-8">
            <Button asChild size="lg" className="h-12 w-full rounded-md bg-[#10B981] px-7 text-[17px] font-bold uppercase tracking-[0.5px] text-white transition hover:-translate-y-0.5 hover:bg-[#059669] hover:shadow-[0_8px_24px_rgba(44,123,196,0.35)] sm:w-auto">
              <a href={whatsappUrl} target="_blank" rel="noreferrer">
                Falar no WhatsApp
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 w-full rounded-md border-[#020A17]/20 bg-transparent px-7 text-[15px] text-[#020A17] hover:border-[#065F46] hover:bg-transparent hover:text-[#059669] sm:w-auto">
              <a href="#planos">Ver planos</a>
            </Button>
          </div>
        </div>

        <div className="relative h-full min-h-[380px] w-full overflow-hidden rounded-2xl border border-black/8 bg-[#060E1C] shadow-[0_36px_80px_-32px_rgba(12,42,82,0.5)]">
          <img src="/images/equipe/medica.png" alt="Médica usando o sistema da Tática" className="h-full w-full object-cover object-center" />
          <div className="absolute inset-x-4 bottom-4 rounded-xl bg-white/95 px-5 py-4 shadow-[0_10px_30px_rgba(0,0,0,0.3)] backdrop-blur md:inset-x-5 md:bottom-5">
            <p className="text-[13.5px] font-medium leading-snug text-[#1A1A1A]">
              Cuidamos do seu <strong className="text-[#1351B4]">contas a pagar, receber</strong>, conciliação de <strong className="text-[#1351B4]">procedimentos parcelados</strong> e administração de <strong className="text-[#1351B4]">contratos cirúrgicos</strong> para garantir completa fluidez e unicidade das informações da sua empresa.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const heroSlides = [
  { src: "/images/sistema/dashboard.png", label: "Dashboard financeiro em tempo real" },
  { src: "/images/sistema/dre.png", label: "DRE gerencial automática" },
  { src: "/images/sistema/fluxo-caixa.png", label: "Fluxo de caixa projetado" },
];

function HeroCarousel() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((p) => (p + 1) % heroSlides.length), 4000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-black/8 bg-[#060E1C] shadow-[0_36px_80px_-32px_rgba(12,42,82,0.5)]">
      {heroSlides.map((s, idx) => (
        <img
          key={idx}
          src={s.src}
          alt={s.label}
          loading="lazy"
          className={`absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-700 ${idx === i ? "opacity-100" : "opacity-0"}`}
        />
      ))}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-[#06183A]/95 via-[#06183A]/40 to-transparent p-4 pt-14">
        <p className="text-[13px] font-semibold text-white">{heroSlides[i].label}</p>
        <div className="flex gap-2 pb-0.5">
          {heroSlides.map((s, idx) => (
            <button
              key={idx}
              type="button"
              aria-label={`Ir para slide ${idx + 1}`}
              onClick={() => setI(idx)}
              className={`h-2 rounded-full transition-all ${idx === i ? "w-6 bg-[#059669]" : "w-2 bg-white/30 hover:bg-white/50"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Sobre() {
  return (
    <section id="sobre" className="bg-transparent">
      <div className="mx-auto max-w-7xl px-5 pt-8 pb-14 md:px-6 md:pt-10 md:pb-24">
        <div className="rounded-3xl border border-white/10 bg-[#060E1C] p-10 shadow-[0_30px_70px_-28px_rgba(6,14,28,0.75)] md:p-16">
          <p className="text-center text-[12px] font-extrabold uppercase tracking-[0.18em] text-[#34D399]">Nossas entregas</p>
          <h3 className="mb-14 mt-2 text-center text-[clamp(1.6rem,3.2vw,2.2rem)] font-black tracking-tight text-white">
            O que a gente <span className="text-[#34D399]">faz por você</span>
          </h3>
          <div className="hidden md:block">
            <div className="relative">
              <div className="absolute left-[7%] right-[7%] top-8 h-1 rounded-full bg-gradient-to-r from-[#3B82F6] via-[#34D399] to-[#3B82F6]" />
              <div className="relative grid grid-cols-6 gap-3">
                {entregas.map(({ icon: Icon, txt }, i) => (
                  <div key={i} className="flex flex-col items-center px-1 text-center">
                    <span className="grid h-16 w-16 place-items-center rounded-full border-[3px] border-[#34D399] bg-white text-[#0C2A52] shadow-[0_8px_22px_-6px_rgba(52,211,153,0.5)]">
                      <Icon className="h-7 w-7" />
                    </span>
                    <span className="mt-4 text-[18px] font-semibold leading-snug text-white/90">{txt}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="relative space-y-5 pl-9 md:hidden">
            <span className="pointer-events-none absolute left-[15px] top-1 bottom-3 w-0.5 bg-gradient-to-b from-[#10B981] to-[#10B981]/15" />
            {entregas.map(({ icon: Icon, txt }, i) => (
              <div key={i} className="relative flex items-center">
                <span className="absolute -left-9 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border-2 border-[#34D399] bg-white text-[#0C2A52]">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-[18px] font-semibold leading-snug text-white/90">{txt}</span>
              </div>
            ))}
          </div>

          <p className="mt-14 text-center text-[15.5px] text-white/65">
            <span className="font-black text-white">+R$ 14 milhões</span> sob gestão · <span className="font-black text-white">100%</span> foco em área médica
          </p>
        </div>
      </div>
    </section>
  );
}

const b3 = [
  { t: "IBOV", v: "168.619 pts", c: "0,70%", up: false },
  { t: "Petrobras PN", v: "R$ 41,65", c: "1,17%", up: true },
  { t: "Petrobras ON", v: "R$ 46,81", c: "1,50%", up: true },
  { t: "Vale ON", v: "R$ 77,70", c: "1,02%", up: false },
  { t: "Itaú PN", v: "R$ 39,36", c: "0,36%", up: true },
  { t: "Dólar", v: "R$ 5,17", c: "0,22%", up: false },
  { t: "Bradesco PN", v: "R$ 13,84", c: "0,58%", up: true },
];

const moedas = {
  dolar: { nome: "Dólar", valor: "R$ 5,1763", varc: "4,15%", compra: "5,1757", venda: "5,1763", line: "0,52 20,50 40,46 60,30 80,34 100,28 120,40 140,38 160,30 180,34 200,26 220,24 240,16 260,18 280,8 300,6" },
  euro: { nome: "Euro", valor: "R$ 5,9791", varc: "2,80%", compra: "5,9774", venda: "5,9791", line: "0,42 20,46 40,38 60,44 80,34 100,40 120,30 140,36 160,28 180,32 200,24 220,30 240,22 260,18 280,20 300,12" },
};

function Sistema() {
  const [zoom, setZoom] = useState<{ src: string; label: string } | null>(null);
  const [moeda, setMoeda] = useState<"dolar" | "euro">("dolar");
  const sel = moedas[moeda];
  return (
    <>
    <section id="sistema" className="relative overflow-hidden bg-transparent text-[#020A17]">
      <div className="relative mx-auto max-w-6xl px-5 py-14 md:px-6 md:py-24">
        <div className="overflow-hidden rounded-full border border-black/8 bg-white shadow-[0_10px_30px_-12px_rgba(0,0,0,0.18)]">
          <div className="flex items-stretch">
            <div className="flex shrink-0 items-center rounded-l-full bg-[#060E1C] px-4 md:px-5">
              <span className="text-[12px] font-black uppercase tracking-wide text-white">Bolsa B3</span>
            </div>
            <div className="overflow-hidden py-2.5">
              <div className="tatica-marquee flex w-max items-center gap-7 px-4">
                {[...b3, ...b3].map((q, i) => (
                  <span key={i} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px]">
                    <strong className="text-[#1A1A1A]">{q.t}</strong>
                    <span className="text-[#6B7280]">{q.v}</span>
                    <span className={`font-semibold ${q.up ? "text-[#059669]" : "text-[#EF4444]"}`}>{q.up ? "▲" : "▼"} {q.c}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 grid items-stretch gap-10 md:mt-14 md:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col">
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[#1351B4]">Nosso grande diferencial</p>
            <h2 className="mt-3 text-[clamp(2.2rem,5vw,3.4rem)] font-black leading-[1.05] tracking-tight text-[#020A17]">
              Sistema <span className="text-[#059669]">Próprio</span>
            </h2>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-[#3F3F46]">
              Enquanto outras empresas te empurram sistemas <strong className="text-[#020A17]">engessados, antiquados e genéricos</strong> só pra embolsar comissão, a Tática vai na contramão e trabalha com <strong className="text-[#1351B4]">transparência</strong>: pensamos minuciosamente na necessidade do <strong className="text-[#020A17]">segmento médico</strong> pra te entregar o que há de mais moderno em gestão.
            </p>
            <div className="my-auto pt-8">
              <p className="text-[14px] font-bold uppercase tracking-wide text-[#020A17]">Um sistema que une:</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {["Economia", "Informativos da sua área", "RH", "Fiscal", "Financeiro", "Estoque", "Vendas", "Indicadores", "e muito mais"].map((m) => (
                  <span key={m} className="rounded-full border border-[#1351B4]/20 bg-[#1351B4]/[0.06] px-3 py-1 text-[12px] font-semibold text-[#1351B4]">{m}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-black/8 bg-white p-6 shadow-[0_16px_40px_-18px_rgba(0,0,0,0.22)]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[15px] font-black tracking-tight text-[#020A17]">{sel.nome} <span className="text-[11px] font-medium text-[#9AA0A6]">· 45 dias</span></p>
                <p className="mt-0.5 text-[26px] font-black tracking-tight text-[#020A17]">{sel.valor}</p>
              </div>
              <span className="mt-1 whitespace-nowrap text-[14px] font-bold text-[#059669]">▲ {sel.varc}</span>
            </div>
            <div className="mt-3">
              <svg viewBox="0 0 300 64" preserveAspectRatio="none" className="h-16 w-full">
                <defs>
                  <linearGradient id="dolarFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polygon fill="url(#dolarFill)" points={`${sel.line} 300,64 0,64`} />
                <polyline fill="none" stroke="#059669" strokeWidth="2" strokeLinejoin="round" points={sel.line} />
              </svg>
              <div className="mt-1 flex justify-between text-[10px] text-[#9AA0A6]">
                <span>27/04</span><span>12/05</span><span>22/05</span><span>10/06</span>
              </div>
            </div>

            <div className="mt-5 border-t border-black/5 pt-4">
              <div className="flex items-baseline justify-between">
                <p className="text-[15px] font-black tracking-tight text-[#020A17]">Moedas</p>
                <span className="text-[10px] font-semibold text-[#9AA0A6]">clique pra trocar o gráfico</span>
              </div>
              <div className="mt-2 grid grid-cols-[1fr_64px_64px] gap-x-3 px-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-[#9AA0A6]">
                <span />
                <span className="text-right">Compra</span>
                <span className="text-right">Venda</span>
              </div>
              {(["dolar", "euro"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMoeda(k)}
                  className={`grid w-full grid-cols-[1fr_64px_64px] items-center gap-x-3 rounded-md px-2 py-1.5 text-[13px] transition ${moeda === k ? "bg-[#1351B4]/[0.08] ring-1 ring-[#1351B4]/20" : "hover:bg-black/[0.04]"}`}
                >
                  <span className={`text-left font-semibold ${moeda === k ? "text-[#1351B4]" : "text-[#020A17]"}`}>{moedas[k].nome}</span>
                  <span className="text-right text-[#3F3F46]">{moedas[k].compra}</span>
                  <span className="text-right text-[#3F3F46]">{moedas[k].venda}</span>
                </button>
              ))}
            </div>

            <div className="mt-5 border-t border-black/5 pt-4">
              <p className="text-[15px] font-black tracking-tight text-[#020A17]">Índices</p>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
                {[
                  ["Selic (a.a.)", "14,50%"],
                  ["CDI (a.d.)", "0,0534%"],
                  ["IPCA 12m", "4,39%"],
                  ["IPCA mês", "0,67%"],
                  ["IGP-M", "0,84%"],
                  ["INPC", "0,81%"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between border-b border-black/5 pb-1.5">
                    <span className="text-[#3F3F46]">{k}</span>
                    <span className="font-semibold text-[#020A17]">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="relative mt-12 ml-[calc(50%-50vw)] w-screen bg-[#060E1C] py-7 md:mt-14 md:py-10">
          <div className="mx-auto mb-8 h-px max-w-6xl bg-gradient-to-r from-transparent via-white/25 to-transparent" />
          <div className="mx-auto max-w-6xl overflow-hidden px-5 md:px-6">
            <div className="tatica-marquee flex w-max gap-5 py-2">
            {[...telasSistema, ...telasSistema].map((t, i) => (
              <figure key={i} className="w-[280px] shrink-0 md:w-[360px]">
                <button
                  type="button"
                  onClick={() => setZoom(t)}
                  className="block w-full cursor-zoom-in rounded-xl border border-black/8 bg-white p-2.5 text-left shadow-[0_12px_30px_-18px_rgba(0,0,0,0.35)] transition hover:border-[#059669]/40"
                >
                  <img src={t.src} alt={t.label} loading="lazy" className="block w-full rounded-md ring-1 ring-black/5" />
                </button>
                <figcaption className="mt-2 text-center text-[12.5px] font-semibold text-white/90">{t.label}</figcaption>
              </figure>
            ))}
            </div>
          </div>

          <div className="mx-auto mt-8 h-px max-w-6xl bg-gradient-to-r from-transparent via-white/25 to-transparent" />
          <div className="mx-auto mt-8 max-w-2xl rounded-xl bg-white px-6 py-5 text-center shadow-[0_14px_34px_-10px_rgba(0,0,0,0.4)]">
            <p className="text-[16px] leading-relaxed text-[#1A1A1A]">
              São <strong className="text-[#1351B4]">telas reais do sistema</strong>, incluído no seu plano — a mesma plataforma que a nossa equipe usa pra cuidar do financeiro da sua clínica, <strong className="text-[#1351B4]">do lançamento ao resultado</strong>.
            </p>
            <p className="mt-3 text-center leading-relaxed">
              <span className="box-decoration-clone rounded-[2px] bg-[#FDE047] px-1.5 py-0.5 text-[12px] font-bold uppercase tracking-[0.12em] text-[#1A1A1A]">Passe o mouse pra pausar · clique pra ampliar</span>
            </p>
          </div>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {sistemaCards.map(({ icon: Icon, t, d, img }) => (
            <button
              key={t}
              type="button"
              onClick={() => setZoom({ src: img, label: t })}
              className="group cursor-zoom-in rounded-2xl border border-black/8 bg-white p-7 text-left shadow-[0_2px_14px_rgba(0,0,0,0.04)] transition hover:-translate-y-1 hover:border-[#059669]/40 hover:shadow-[0_12px_30px_rgba(0,0,0,0.1)]"
            >
              <div className="flex items-start justify-between">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#10B981]/10 text-[#059669]">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="mt-1 text-[11px] font-semibold text-[#059669] opacity-0 transition group-hover:opacity-100">ver tela →</span>
              </div>
              <p className="mt-5 text-[17px] font-bold tracking-tight text-[#020A17]">{t}</p>
              <p className="mt-2 text-[14.5px] leading-relaxed text-[#3F3F46]">{d}</p>
            </button>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-[#059669]/25 bg-[#10B981]/[0.07] p-8 md:p-10">
          <div className="grid items-start gap-7 md:grid-cols-[auto_1fr]">
            <div className="grid h-16 w-16 place-items-center rounded-xl bg-[#10B981]/15 text-[#059669]">
              <Cpu className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-[20px] font-black tracking-tight text-[#059669]">
                Por que sistema próprio faz diferença?
              </h3>
              <p className="mt-3 text-[15.5px] leading-relaxed text-[#3F3F46]">
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
                  <li key={x} className="flex items-start gap-2.5 text-[14.5px] text-[#3F3F46]">
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
    {zoom && (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        onClick={() => setZoom(null)}
      >
        <div className="relative max-h-[90vh] w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
          <img
            src={zoom.src}
            alt={zoom.label}
            className="mx-auto max-h-[90vh] w-auto max-w-full rounded-lg object-contain shadow-2xl ring-1 ring-white/15"
          />
          <button
            type="button"
            onClick={() => setZoom(null)}
            aria-label="Fechar"
            className="absolute -right-3 -top-3 grid h-9 w-9 place-items-center rounded-full bg-white text-[#020A17] shadow-lg transition hover:scale-105"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    )}
    </>
  );
}

function GaleriaSistema() {
  return (
    <section id="plataforma" className="bg-transparent">
      <div className="mx-auto max-w-6xl px-5 py-14 md:px-6 md:py-24">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1351B4]">A plataforma</p>
          <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.6rem)] font-black tracking-tight text-[#020A17]">
            Veja o sistema <span className="text-[#059669]">em funcionamento</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15.5px] leading-relaxed text-[#3F3F46]">
            Telas reais do Tática Gestão. A mesma plataforma usada pela nossa equipe de BPO
            estará disponível para a sua clínica em tempo real.
          </p>
        </div>

        <div className="relative mx-auto mt-10 max-w-5xl md:mt-14">
          <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-[#065F46]/20 via-transparent to-[#065F46]/15 blur-2xl" />
          <div className="overflow-hidden rounded-2xl border border-black/8 bg-[#060E1C] p-3 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.3)] md:p-4">
            <img
              src="/images/sistema/dashboard.png"
              alt="Dashboard principal Tática Gestão"
              loading="lazy"
              className="block w-full rounded-lg ring-1 ring-white/10"
            />
          </div>
        </div>
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
    <section className="relative overflow-hidden tatica-navy text-white">
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
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#10B981]/20 text-[#34D399]">
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
          <div className="flex items-start gap-4 rounded-2xl border border-[#065F46]/30 bg-[#10B981]/[0.12] p-6">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#10B981] text-white"><Sparkles className="h-5 w-5" /></div>
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

function Overnight() {
  const bullets = [
    "Resumo do mês: faturamento, despesas e resultado",
    "Vendas do dia, contas a pagar e a receber",
    "Consolidado do dia e do mês, num PDF",
    "Chega sozinho, no horário que você escolher",
  ];
  const vendas: [string, string, string][] = [
    ["Procedimento capilar", "PIX", "R$ 1.200"],
    ["Consulta + sessão", "Cartão", "R$ 680"],
    ["Sessão de laser", "Cartão", "R$ 520"],
    ["Aplicação", "PIX", "R$ 340"],
  ];
  const aPagar: [string, string, string][] = [
    ["Fornecedor de insumos", "08/06", "R$ 1.890"],
  ];
  const aReceber: [string, string, string][] = [
    ["Repasse de cartão", "08/06", "R$ 920"],
    ["Recebível particular", "08/06", "R$ 1.200"],
    ["Recebível particular", "08/06", "R$ 680"],
    ["Convênio", "08/06", "R$ 320"],
  ];
  const pagina = (
    <div className="h-[456px] overflow-hidden bg-white text-[#222] shadow-sm">
      <div className="bg-[#16365c] px-2.5 py-1.5 text-white">
        <p className="text-[10px] font-black leading-none tracking-wide">OVERNIGHT</p>
        <p className="mt-0.5 text-[5.5px] text-white/70">Atualização Financeira Diária · Clínica Exemplo · 08/06/2026</p>
      </div>
      <div className="space-y-1.5 p-2">
        <div>
          <p className="text-[6px] font-bold text-[#16365c]">1. RESUMO EXECUTIVO — MÊS</p>
          <div className="mt-1 grid grid-cols-3 gap-1">
            <div className="rounded bg-[#f4f1ea] p-1 text-center"><p className="text-[5px] text-[#888]">Faturamento</p><p className="text-[7px] font-black text-[#0a7a52]">R$ 82,4k</p></div>
            <div className="rounded bg-[#f4f1ea] p-1 text-center"><p className="text-[5px] text-[#888]">Despesas</p><p className="text-[7px] font-black text-[#b4292b]">R$ 49,1k</p></div>
            <div className="rounded bg-[#f4f1ea] p-1 text-center"><p className="text-[5px] text-[#888]">Resultado</p><p className="text-[7px] font-black text-[#0a7a52]">+33,3k</p></div>
          </div>
        </div>
        <div>
          <p className="text-[6px] font-bold text-[#16365c]">2. VENDAS DO DIA</p>
          <div className="mt-0.5 overflow-hidden rounded border border-black/10">
            {vendas.map(([p, f, v], i) => (
              <div key={i} className="flex items-center gap-1 border-b border-black/5 px-1.5 py-[3px] text-[5.5px] last:border-0">
                <span className="flex-1 truncate text-[#333]">{p}</span>
                <span className="text-[#999]">{f}</span>
                <span className="w-10 text-right font-semibold">{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[6px] font-bold text-[#16365c]">3. CONTAS A PAGAR</p>
          <div className="mt-0.5 overflow-hidden rounded border border-black/10">
            {aPagar.map(([d, dt, v], i) => (
              <div key={i} className="flex items-center gap-1 px-1.5 py-[3px] text-[5.5px]">
                <span className="flex-1 truncate text-[#333]">{d}</span>
                <span className="text-[#999]">{dt}</span>
                <span className="w-10 text-right font-semibold">{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[6px] font-bold text-[#16365c]">4. CONTAS A RECEBER</p>
          <div className="mt-0.5 overflow-hidden rounded border border-black/10">
            {aReceber.map(([d, dt, v], i) => (
              <div key={i} className="flex items-center gap-1 border-b border-black/5 px-1.5 py-[3px] text-[5.5px] last:border-0">
                <span className="flex-1 truncate text-[#333]">{d}</span>
                <span className="text-[#999]">{dt}</span>
                <span className="w-10 text-right font-semibold">{v}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="pt-0.5 text-center text-[5px] text-[#999]">Tática Gestão · documento confidencial · pág. 1 de 2</p>
      </div>
    </div>
  );
  const consolidado: [string, string, string][] = [
    ["(+) Entradas", "R$ 2.580", "R$ 71.200"],
    ["(-) Saídas", "R$ 1.890", "R$ 49.100"],
    ["(=) Resultado", "+R$ 690", "+R$ 22.100"],
  ];
  const pagina2 = (
    <div className="h-[456px] overflow-hidden bg-white text-[#222] shadow-sm">
      <div className="space-y-2 p-2">
        <div>
          <p className="text-[6px] font-bold text-[#16365c]">5. CONSOLIDADO — DIA E MÊS</p>
          <div className="mt-0.5 overflow-hidden rounded border border-black/10">
            <div className="flex items-center gap-1 bg-[#16365c] px-1.5 py-[3px] text-[5px] font-bold text-white">
              <span className="flex-1">Demonstrativo</span>
              <span className="w-10 text-right">Dia</span>
              <span className="w-10 text-right">Mês</span>
            </div>
            {consolidado.map(([d, dia, mes], i) => (
              <div key={i} className="flex items-center gap-1 border-b border-black/5 px-1.5 py-[3px] text-[5.5px] last:border-0">
                <span className="flex-1 text-[#333]">{d}</span>
                <span className="w-10 text-right text-[#3F3F46]">{dia}</span>
                <span className="w-10 text-right font-semibold">{mes}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="pt-3 text-[5.5px] leading-relaxed text-[#3F3F46]">
          <p>Atenciosamente,</p>
          <p className="font-bold text-[#16365c]">Tática Gestão Empresarial Ltda.</p>
          <p className="text-[5px] text-[#999]">contato@taticagestao.com.br · Varginha — MG</p>
        </div>
        <p className="pt-0.5 text-center text-[5px] text-[#999]">Tática Gestão · documento confidencial · pág. 2 de 2</p>
      </div>
    </div>
  );
  return (
    <section className="bg-transparent">
      <div className="mx-auto max-w-6xl px-5 py-14 md:px-6 md:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_0.82fr]">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1351B4]">Exclusivo Tática · Overnight</p>
            <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.6rem)] font-black tracking-tight text-[#020A17]">
              Todo dia às 18h, seu financeiro chega no <span className="text-[#059669]">seu WhatsApp</span>
            </h2>
            <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-[#3F3F46]">
              O <strong className="text-[#020A17]">Overnight</strong> é um relatório automático que você recebe todo fim de tarde, direto no celular — sem precisar abrir o sistema. Você fecha a clínica já sabendo exatamente como foi o dia.
            </p>
            <ul className="mt-6 space-y-2.5">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-[15px] font-medium text-[#473f37]">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[#10B981]/12 text-[#059669]">
                    <Check className="h-3 w-3" />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-8 inline-flex h-12 items-center gap-2 rounded-md bg-[#10B981] px-7 text-[15px] font-bold uppercase tracking-[0.5px] text-white transition hover:-translate-y-0.5 hover:bg-[#059669]"
            >
              Quero receber meu Overnight <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          {/* quadro branco de fundo + iPhone com a 1ª página rolando */}
          <div className="mx-auto w-fit rounded-[2.5rem] bg-white p-5 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.3)] ring-1 ring-black/5 md:p-7">
            <div className="relative w-[248px] rounded-[2.8rem] border-[10px] border-[#0b0b0d] bg-[#0b0b0d] shadow-2xl">
              <div className="absolute left-1/2 top-2 z-20 h-[18px] w-[74px] -translate-x-1/2 rounded-full bg-[#0b0b0d]" />
              <div className="relative h-[520px] overflow-hidden rounded-[2rem] bg-white">
                <div className="relative z-10 flex items-center gap-2 bg-[#075E54] px-2.5 pb-2 pt-7 text-white">
                  <div className="grid h-6 w-6 place-items-center rounded-full bg-white/15">
                    <MessageSquare className="h-3.5 w-3.5" />
                  </div>
                  <div className="leading-tight">
                    <p className="text-[10px] font-bold">Tática Gestão</p>
                    <p className="text-[8px] text-white/70">hoje, 18:00 · PDF</p>
                  </div>
                </div>
                <div className="h-[468px] overflow-hidden bg-[#e9e7e1] p-1.5">
                  <div className="tatica-vscroll space-y-2">
                    {pagina}
                    {pagina2}
                  </div>
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-[#e9e7e1] to-transparent" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const fazemos = [
  "Assumimos o financeiro inteiro da clínica (BPO completo)",
  "Precificação, tributário, maquininha e repasse sob controle",
  "Sistema próprio incluído, com relatórios que você entende",
  "Trabalhamos junto com o seu contador",
  "Foco 100% em clínicas e consultórios médicos",
  "Diagnóstico antes de propor qualquer coisa",
];

const naoFazemos = [
  "Software solto pra você se virar sozinho",
  "Relatório complicado que ninguém entende",
  "Solução genérica de “qualquer setor”",
  "Promessa de resultado sem olhar seus números",
  "Sumir depois de assinar o contrato",
  "Substituir o seu contador (a gente soma com ele)",
];

function Servicos() {
  return (
    <section id="servicos" className="relative overflow-hidden tatica-navy text-white">
      <div className="relative mx-auto max-w-6xl px-5 py-12 md:px-6 md:py-16">
        <div className="text-center">
          <h2 className="text-[clamp(1.9rem,4vw,2.6rem)] font-black tracking-tight text-white">
            O que <span className="text-[#34D399]">fazemos</span> e o que <span className="text-[#FB923C]">não fazemos</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15.5px] leading-relaxed text-white/75">
            Transparência desde o primeiro dia. Você sabe exatamente o que esperar da Tática.
          </p>
        </div>

        <div className="mt-9 grid grid-cols-2 gap-3 md:gap-6">
          <div className="rounded-2xl border border-[#10B981]/30 bg-[#10B981]/[0.07] p-4 sm:p-6 md:p-8">
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#10B981] text-white sm:h-9 sm:w-9">
                <Check className="h-4 w-4 sm:h-5 sm:w-5" />
              </span>
              <p className="text-[12px] font-black uppercase leading-tight tracking-wide text-white sm:text-[15px] md:text-[17px]">O que fazemos</p>
            </div>
            <ul className="mt-4 space-y-2.5 sm:mt-6 sm:space-y-3.5">
              {fazemos.map((t) => (
                <li key={t} className="flex items-start gap-1.5 text-[12px] leading-snug text-white/90 sm:gap-3 sm:text-[14px] md:text-[15.5px]">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-[#34D399] sm:h-4 sm:w-4" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-[#FB923C]/25 bg-[#FB923C]/[0.06] p-4 sm:p-6 md:p-8">
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#F97316] text-white sm:h-9 sm:w-9">
                <X className="h-4 w-4 sm:h-5 sm:w-5" />
              </span>
              <p className="text-[12px] font-black uppercase leading-tight tracking-wide text-white sm:text-[15px] md:text-[17px]">O que não fazemos</p>
            </div>
            <ul className="mt-4 space-y-2.5 sm:mt-6 sm:space-y-3.5">
              {naoFazemos.map((t) => (
                <li key={t} className="flex items-start gap-1.5 text-[12px] leading-snug text-white/85 sm:gap-3 sm:text-[14px] md:text-[15.5px]">
                  <X className="mt-0.5 h-3 w-3 shrink-0 text-[#FB923C] sm:h-4 sm:w-4" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>

      </div>
    </section>
  );
}

function FAQ() {
  const faqs = [
    { q: "Preciso trocar meu contador?", a: "Não. A gente trabalha junto com o seu contador — cuidamos da gestão financeira e do dia a dia da clínica; ele segue com a parte contábil e fiscal." },
    { q: "Quanto tempo até estar funcionando?", a: "A implantação leva, em média, de 15 a 30 dias: configuramos o sistema, migramos os seus dados e treinamos a equipe." },
    { q: "E se eu já tiver um sistema?", a: "Sem problema. No diagnóstico a gente avalia se vale migrar pro sistema Tática (que já vem incluído) ou integrar com o que você usa. Você decide." },
    { q: "Preciso dar acesso a tudo do meu financeiro?", a: "Você controla o que compartilha. Tudo é formalizado em contrato com cláusula de sigilo e tratado conforme a LGPD." },
    { q: "O sistema é cobrado à parte?", a: "Não. O sistema próprio está incluído em todos os planos, sem custo de software adicional." },
    { q: "Como funciona o diagnóstico gratuito?", a: "Você conversa com a gente, analisamos onde sua clínica perde dinheiro hoje e te mostramos o número — sem compromisso e sob sigilo." },
  ];
  return (
    <section id="faq" className="bg-transparent">
      <div className="mx-auto max-w-3xl px-5 py-14 md:px-6 md:py-24">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1351B4]">Dúvidas</p>
          <h2 className="mt-3 text-[clamp(1.9rem,4vw,2.6rem)] font-black tracking-tight text-[#020A17]">
            Perguntas <span className="text-[#059669]">frequentes</span>
          </h2>
        </div>
        <div className="mt-10 space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="group rounded-xl border border-black/8 bg-white px-5 py-4 shadow-[0_2px_14px_rgba(0,0,0,0.04)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-bold text-[#020A17]">
                {f.q}
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#10B981]/10 text-[18px] leading-none text-[#059669] transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-[14.5px] leading-relaxed text-[#3F3F46]">{f.a}</p>
            </details>
          ))}
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
            Pacotes por porte da sua <span className="text-[#059669]">clínica</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15.5px] leading-relaxed text-[#3F3F46]">
            Sistema próprio incluído em todos. O valor final é definido no diagnóstico gratuito, conforme o tamanho da sua clínica.
          </p>
        </div>

        <div className="mt-16 grid gap-7 lg:grid-cols-3">
          {planos.map((p) => (
            <Card
              key={p.nome}
              className={`relative rounded-2xl border-2 transition ${
                p.destaque
                  ? "border-[#065F46] bg-[#060E1C] text-white shadow-[0_20px_50px_-20px_rgba(34,165,92,0.45)] lg:-translate-y-3"
                  : "border-black/10 bg-white text-[#020A17] shadow-[0_2px_16px_rgba(0,0,0,0.04)] hover:-translate-y-1 hover:border-[#065F46]/40 hover:shadow-[0_12px_40px_rgba(0,0,0,0.10)]"
              }`}
            >
              {p.destaque && (
                <div className="absolute left-1/2 top-0 -translate-x-1/2 translate-y-[-50%]">
                  <Badge className="rounded-full bg-[#10B981] px-4 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-white hover:bg-[#10B981]">
                    Mais popular
                  </Badge>
                </div>
              )}

              <CardContent className="p-6 md:p-8">
                <h3 className={`text-[24px] font-black tracking-tight ${p.destaque ? "text-white" : "text-[#020A17]"}`}>
                  {p.nome}
                </h3>
                <p className={`mt-1.5 text-[14px] leading-snug ${p.destaque ? "text-[#D6CFC1]" : "text-[#3F3F46]"}`}>{p.desc}</p>

                <div className="mt-5">
                  <span className={`text-[13px] ${p.destaque ? "text-[#A79E8E]" : "text-[#8A8174]"}`}>a partir de</span>
                  <div className="flex items-end gap-1.5">
                    <span className={`text-[30px] font-black tracking-tight ${p.destaque ? "text-white" : "text-[#020A17]"}`}>R$ {p.preco}</span>
                    <span className={`mb-1.5 text-[14px] ${p.destaque ? "text-[#D6CFC1]" : "text-[#3F3F46]"}`}>/mês</span>
                  </div>
                  <span className={`text-[13px] ${p.destaque ? "text-[#A79E8E]" : "text-[#8A8174]"}`}>+ implantação R$ 4.500 (única)</span>
                </div>

                <ul className="mt-6 space-y-0">
                  {p.bullets.map((b, i) => (
                    <li
                      key={b}
                      className={`flex items-start gap-3 py-2.5 text-[14.5px] ${
                        p.destaque ? "text-[#D6CFC1]" : "text-[#3F3F46]"
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
                      ? "bg-[#10B981] text-white hover:bg-[#059669]"
                      : "bg-[#10B981] text-white hover:bg-[#059669]"
                  }`}
                >
                  <a href={whatsappUrl} target="_blank" rel="noreferrer">
                    Falar no WhatsApp
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-[14px] leading-relaxed text-[#3F3F46]">
          <strong className="text-[#020A17]">A implantação (taxa única)</strong> inclui configuração do sistema, migração dos seus dados e treinamento da equipe — e se paga já no 1º mês com a economia que a gente encontra.
        </p>
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
            Consultoria Financeira <span className="text-[#059669]">Personalizada</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15.5px] leading-relaxed text-[#3F3F46]">
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
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#10B981]/10 text-[#1351B4]">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[16.5px] font-black tracking-tight text-[#020A17]">{t}</p>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-[#3F3F46]">{d}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-14 text-center">
          <Button asChild size="lg" className="h-12 rounded-md bg-[#10B981] px-7 text-[17px] font-bold uppercase tracking-[0.5px] text-white hover:bg-[#059669]">
            <a href={whatsappUrl} target="_blank" rel="noreferrer">
              Falar no WhatsApp
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
    <section className="relative overflow-hidden tatica-navy text-white">
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
            Seu financeiro em <span className="text-[#059669]">mãos seguras</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15.5px] leading-relaxed text-[#3F3F46]">
            Cuidamos de dado sensível como se fosse o nosso. Tudo formalizado, criptografado e sob sigilo.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {itens.map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-2xl border border-black/5 bg-white p-6 shadow-[0_2px_16px_rgba(0,0,0,0.05)]">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#10B981]/10 text-[#059669]">
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-5 text-[16px] font-black tracking-tight text-[#020A17]">{t}</p>
              <p className="mt-2 text-[14px] leading-relaxed text-[#3F3F46]">{d}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex items-center justify-center gap-3 rounded-2xl border border-[#065F46]/20 bg-[#10B981]/[0.06] px-6 py-5 text-center">
          <ShieldCheck className="h-5 w-5 shrink-0 text-[#059669]" />
          <p className="text-[15px] font-semibold text-[#020A17]">
            O diagnóstico é <span className="text-[#059669]">100% gratuito, sem compromisso e sob sigilo.</span>
          </p>
        </div>
      </div>
    </section>
  );
}

function CTAFinal() {
  return (
    <section id="contato" className="tatica-navy text-center text-white">
      <div className="mx-auto max-w-3xl px-5 py-14 md:px-6 md:py-24">
        <h2 className="text-[clamp(2rem,4.5vw,2.8rem)] font-black leading-[1.12] tracking-tight">
          Descubra quanto sua clínica <span className="text-[#34D399]">está perdendo</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-[#CFC8BA]">
          Agende seu diagnóstico gratuito: em cerca de 30 minutos, a gente te mostra onde está vazando dinheiro — maquininha, imposto, precificação e repasses.
        </p>

        <Button asChild size="lg" className="mt-9 h-14 rounded-md bg-[#10B981] px-10 text-[16px] font-bold uppercase tracking-wider text-white hover:-translate-y-0.5 hover:bg-[#059669] hover:shadow-[0_12px_30px_rgba(44,123,196,0.4)]">
          <a href={whatsappUrl} target="_blank" rel="noreferrer">
            Falar no WhatsApp
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
    <footer className="tatica-navy text-[#8A8174]">
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
                  <a href={l.href} className="hover:text-[#059669]">{l.l}</a>
                </li>
              ))}
              <li><Link to="/auth" className="hover:text-[#059669]">Acessar sistema</Link></li>
              <li><Link to="/privacidade" className="hover:text-[#059669]">Política de Privacidade</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-white">Redes sociais</p>
            <ul className="mt-4 space-y-2.5 text-[14px]">
              <li><a href="#" className="hover:text-[#059669]">Instagram</a></li>
              <li><a href="#" className="hover:text-[#059669]">LinkedIn</a></li>
              <li><a href="#" className="hover:text-[#059669]">Facebook</a></li>
              <li><a href="#" className="hover:text-[#059669]">YouTube</a></li>
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
            <a href="#" aria-label="LinkedIn" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-[#10B981] hover:text-white">
              <Linkedin className="h-4 w-4" />
            </a>
            <a href="#" aria-label="Instagram" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-[#10B981] hover:text-white">
              <Instagram className="h-4 w-4" />
            </a>
            <a href="#" aria-label="Facebook" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-[#10B981] hover:text-white">
              <Facebook className="h-4 w-4" />
            </a>
            <a href="#" aria-label="YouTube" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-[#10B981] hover:text-white">
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
