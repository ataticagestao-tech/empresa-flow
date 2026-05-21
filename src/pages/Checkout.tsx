import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ShieldCheck,
  Lock,
  CreditCard,
  Banknote,
  Building2,
  MessageSquare,
  CheckCircle2,
} from "lucide-react";

const WHATSAPP_NUMERO = "5535999905768";

function LogoOficial({ variant = "dark", size = "sm" }: { variant?: "dark" | "light"; size?: "sm" | "md" }) {
  const text = variant === "light" ? "#FFFFFF" : "#171717";
  const arcColor = "#B98A3C";
  const dims = size === "md"
    ? { font: 28, arc: 52, sub: 8, gap: 3, arcDX: -14, arcDY: -12, strokeW: 3, subTracking: "0.20em" }
    : { font: 20, arc: 36, sub: 7, gap: 2, arcDX: -10, arcDY: -8, strokeW: 2.5, subTracking: "0.18em" };
  return (
    <div className="inline-flex flex-col items-start" aria-label="Tática">
      <div className="relative inline-block leading-none">
        <svg
          width={dims.arc}
          height={dims.arc}
          viewBox="0 0 100 100"
          fill="none"
          className="absolute z-0"
          style={{ left: dims.arcDX, top: dims.arcDY }}
          aria-hidden="true"
        >
          <path d="M 75 12 A 42 42 0 1 0 75 88" stroke={arcColor} strokeWidth={dims.strokeW} strokeLinecap="round" fill="none" />
        </svg>
        <p
          className="relative z-10 font-semibold tracking-[0.02em]"
          style={{ color: text, fontFamily: "'Playfair Display', Georgia, serif", fontSize: dims.font, lineHeight: 1 }}
        >
          TÁTICA
        </p>
      </div>
      <p
        className="font-medium uppercase"
        style={{ color: text, fontSize: dims.sub, letterSpacing: dims.subTracking, marginTop: dims.gap }}
      >
        Gestão &amp; Finanças Empresariais
      </p>
    </div>
  );
}

type PlanoKey = "Assistente" | "Controller" | "Gestor";

type Plano = {
  nome: PlanoKey;
  preco: string;
  precoMes: string;
  resumo: string;
  bullets: string[];
};

const planosCatalogo: Record<PlanoKey, Plano> = {
  Assistente: {
    nome: "Assistente",
    preco: "Sob consulta",
    precoMes: "/mês",
    resumo: "Ideal para MEI e microempresas iniciando a estruturação financeira.",
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
  },
  Controller: {
    nome: "Controller",
    preco: "Sob consulta",
    precoMes: "/mês",
    resumo: "Para pequenas e médias empresas que precisam de controle mensal robusto.",
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
  },
  Gestor: {
    nome: "Gestor",
    preco: "Sob consulta",
    precoMes: "/mês",
    resumo: "Para médias empresas com necessidade de FP&A e gestão mensal próxima.",
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
  },
};

type Forma = "pix" | "cartao" | "boleto";

const formasPagamento: { id: Forma; label: string; sub: string; icon: typeof CreditCard }[] = [
  { id: "pix", label: "PIX", sub: "Confirmação imediata", icon: Banknote },
  { id: "cartao", label: "Cartão de crédito", sub: "Recorrência mensal", icon: CreditCard },
  { id: "boleto", label: "Boleto bancário", sub: "Vencimento mensal", icon: Building2 },
];

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function maskCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").trim();
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").trim();
}

export default function Checkout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const planoParam = (params.get("plano") ?? "Controller") as PlanoKey;
  const planoInicial: PlanoKey = planoCatalogoKey(planoParam) ?? "Controller";

  const [planoSelecionado, setPlanoSelecionado] = useState<PlanoKey>(planoInicial);
  const plano = planosCatalogo[planoSelecionado];

  const [razaoSocial, setRazaoSocial] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [obs, setObs] = useState("");
  const [forma, setForma] = useState<Forma>("pix");

  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  function validar() {
    const e: Record<string, string> = {};
    if (razaoSocial.trim().length < 3) e.razaoSocial = "Informe a razão social.";
    const dCnpj = cnpj.replace(/\D/g, "");
    if (dCnpj.length !== 14) e.cnpj = "CNPJ deve ter 14 dígitos.";
    if (responsavel.trim().length < 3) e.responsavel = "Informe o nome do responsável.";
    if (!isValidEmail(email)) e.email = "Email inválido.";
    if (telefone.replace(/\D/g, "").length < 10) e.telefone = "Telefone inválido.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const mensagemWhatsApp = useMemo(() => {
    const linhas = [
      "*Novo pedido - Tática Financeiro*",
      "",
      `*Plano:* ${plano.nome}`,
      `*Forma de pagamento desejada:* ${formaLabel(forma)}`,
      "",
      "*Dados da empresa*",
      `Razão Social: ${razaoSocial}`,
      `CNPJ: ${cnpj}`,
      "",
      "*Contato*",
      `Responsável: ${responsavel}`,
      `Email: ${email}`,
      `Telefone: ${telefone}`,
    ];
    if (obs.trim()) {
      linhas.push("", "*Observações*", obs.trim());
    }
    return linhas.join("\n");
  }, [plano.nome, forma, razaoSocial, cnpj, responsavel, email, telefone, obs]);

  function handleConfirmar() {
    if (!validar()) {
      const first = document.querySelector("[aria-invalid='true']") as HTMLElement | null;
      first?.focus();
      return;
    }
    const url = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensagemWhatsApp)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setSent(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (sent) {
    return <SucessoView plano={plano.nome} responsavel={responsavel} onVoltar={() => navigate("/venda")} />;
  }

  return (
    <div className="min-h-screen bg-[#F5F0E8] text-[#2c2c2c] font-sans antialiased">
      <header className="bg-[#0D2847]">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-6">
          <Link to="/venda" className="flex items-center gap-3 text-white/85 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-[13.5px] font-medium">Voltar para a página inicial</span>
          </Link>
          <LogoOficial variant="light" size="sm" />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#2C7BC4]">Finalizar contratação</p>
          <h1 className="mt-2 text-[clamp(1.8rem,3.5vw,2.4rem)] font-black leading-tight tracking-tight text-[#0D2847]">
            Estamos a um passo de organizar o financeiro da sua empresa.
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#666]">
            Preencha os dados abaixo. Em seguida, nossa equipe entra em contato pelo WhatsApp para confirmar
            o cadastro, enviar o contrato e o link de pagamento personalizado.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            <Card className="border-black/10 bg-white shadow-[0_2px_16px_rgba(0,0,0,0.05)]">
              <CardContent className="space-y-5 p-7">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#2C7BC4]">Etapa 1</p>
                  <p className="mt-1 text-[16px] font-black tracking-tight text-[#0D2847]">Dados da empresa</p>
                </div>

                <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
                  <Campo
                    id="razaoSocial"
                    label="Razão Social"
                    placeholder="Ex.: Hair of Brasil LTDA"
                    value={razaoSocial}
                    onChange={(v) => setRazaoSocial(v)}
                    error={errors.razaoSocial}
                  />
                  <Campo
                    id="cnpj"
                    label="CNPJ"
                    placeholder="00.000.000/0000-00"
                    value={cnpj}
                    onChange={(v) => setCnpj(maskCnpj(v))}
                    error={errors.cnpj}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-black/10 bg-white shadow-[0_2px_16px_rgba(0,0,0,0.05)]">
              <CardContent className="space-y-5 p-7">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#2C7BC4]">Etapa 2</p>
                  <p className="mt-1 text-[16px] font-black tracking-tight text-[#0D2847]">Contato do responsável</p>
                </div>

                <Campo
                  id="responsavel"
                  label="Nome do responsável"
                  placeholder="Como você se chama?"
                  value={responsavel}
                  onChange={setResponsavel}
                  error={errors.responsavel}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <Campo
                    id="email"
                    label="Email corporativo"
                    placeholder="financeiro@empresa.com.br"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    error={errors.email}
                  />
                  <Campo
                    id="telefone"
                    label="Telefone / WhatsApp"
                    placeholder="(00) 00000-0000"
                    value={telefone}
                    onChange={(v) => setTelefone(maskPhone(v))}
                    error={errors.telefone}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-black/10 bg-white shadow-[0_2px_16px_rgba(0,0,0,0.05)]">
              <CardContent className="space-y-5 p-7">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#2C7BC4]">Etapa 3</p>
                  <p className="mt-1 text-[16px] font-black tracking-tight text-[#0D2847]">Forma de pagamento</p>
                  <p className="mt-1 text-[12.5px] text-[#666]">
                    Sua preferência. O link de pagamento será enviado pelo nosso time após o contrato.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {formasPagamento.map((f) => {
                    const Icon = f.icon;
                    const active = forma === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setForma(f.id)}
                        aria-pressed={active}
                        className={`group flex items-start gap-3 rounded-xl border p-4 text-left transition ${
                          active
                            ? "border-[#22A55C] bg-[#22A55C]/8 shadow-[0_8px_20px_-15px_rgba(34,165,92,0.5)]"
                            : "border-black/10 bg-white hover:border-[#2C7BC4]/40 hover:bg-[#F5F0E8]/40"
                        }`}
                      >
                        <div
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                            active ? "bg-[#22A55C] text-white" : "bg-[#2C7BC4]/10 text-[#2C7BC4]"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <p className="text-[13.5px] font-bold tracking-tight text-[#0D2847]">{f.label}</p>
                          <p className="mt-0.5 text-[12px] text-[#666]">{f.sub}</p>
                        </div>
                        {active && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#22A55C]" />}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="border-black/10 bg-white shadow-[0_2px_16px_rgba(0,0,0,0.05)]">
              <CardContent className="space-y-4 p-7">
                <div>
                  <Label htmlFor="obs" className="text-[13px] font-semibold text-[#0D2847]">
                    Observações <span className="font-normal text-[#999]">(opcional)</span>
                  </Label>
                  <Textarea
                    id="obs"
                    placeholder="Quer compartilhar algo sobre sua empresa, faturamento médio ou desafios atuais? Ajuda nossa equipe a se preparar."
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                    rows={4}
                    className="mt-2 resize-none border-black/10 text-[13.5px]"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            <Card className="border-black/10 bg-white shadow-[0_2px_16px_rgba(0,0,0,0.05)]">
              <CardContent className="space-y-5 p-7">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#2C7BC4]">Resumo do pedido</p>
                  <Badge className="rounded-full bg-[#22A55C]/12 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#22A55C] hover:bg-[#22A55C]/12">
                    Plano {plano.nome}
                  </Badge>
                </div>

                <div className="grid gap-2">
                  {(Object.keys(planosCatalogo) as PlanoKey[]).map((k) => {
                    const p = planosCatalogo[k];
                    const active = planoSelecionado === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setPlanoSelecionado(k)}
                        aria-pressed={active}
                        className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-left transition ${
                          active
                            ? "border-[#22A55C] bg-[#22A55C]/8"
                            : "border-black/10 bg-white hover:border-[#2C7BC4]/40"
                        }`}
                      >
                        <span className={`text-[13px] font-bold ${active ? "text-[#22A55C]" : "text-[#0D2847]"}`}>{p.nome}</span>
                        {active && <CheckCircle2 className="h-4 w-4 text-[#22A55C]" />}
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-xl bg-[#F5F0E8] p-5">
                  <p className="text-[12.5px] leading-relaxed text-[#666]">{plano.resumo}</p>
                </div>

                <ul className="space-y-2 border-t border-black/8 pt-4">
                  {plano.bullets.slice(0, 6).map((b) => (
                    <li key={b} className="flex items-start gap-2.5 text-[13px] text-[#1A1A2E]">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#22A55C]" />
                      {b}
                    </li>
                  ))}
                  {plano.bullets.length > 6 && (
                    <li className="text-[11.5px] italic text-[#666]">
                      + {plano.bullets.length - 6} itens adicionais
                    </li>
                  )}
                </ul>

                <div className="border-t border-black/8 pt-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px] uppercase tracking-wider text-[#666]">Investimento</span>
                    <div className="text-right">
                      <p className="text-[20px] font-black tracking-tight text-[#0D2847]">{plano.preco}</p>
                      <p className="text-[11px] text-[#666]">{plano.precoMes}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[11.5px] italic text-[#666]">
                    Valor confirmado após análise de porte e volume na conversa com nosso especialista.
                  </p>
                </div>

                <Button
                  onClick={handleConfirmar}
                  className="w-full rounded-md bg-[#2C7BC4] py-6 text-[14px] font-bold uppercase tracking-wider text-white hover:bg-[#1f5d96]"
                >
                  Confirmar contratação
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>

                <div className="space-y-2 text-[11.5px] text-[#666]">
                  <p className="flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5 text-[#22A55C]" />
                    Seus dados estão seguros e em conformidade com a LGPD.
                  </p>
                  <p className="flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#22A55C]" />
                    Sem fidelidade. Sem taxa de setup.
                  </p>
                  <p className="flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-[#22A55C]" />
                    Atendimento humano por WhatsApp em até 1 hora útil.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function Campo({
  id,
  label,
  value,
  onChange,
  placeholder,
  error,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  type?: string;
}) {
  const invalid = !!error;
  return (
    <div>
      <Label htmlFor={id} className="text-[13px] font-semibold text-[#0D2847]">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={invalid}
        className={`mt-2 h-11 border-black/15 text-[13.5px] focus-visible:ring-[#2C7BC4] ${
          invalid ? "border-red-400 focus-visible:ring-red-400" : ""
        }`}
      />
      {invalid && <p className="mt-1 text-[12px] font-medium text-red-600">{error}</p>}
    </div>
  );
}

function SucessoView({ plano, responsavel, onVoltar }: { plano: string; responsavel: string; onVoltar: () => void }) {
  return (
    <div className="min-h-screen bg-[#F5F0E8] text-[#2c2c2c]">
      <header className="bg-[#0D2847]">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-6">
          <Link to="/venda" className="flex items-center">
            <LogoOficial variant="light" size="sm" />
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#22A55C]/15 text-[#22A55C]">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <h1 className="mt-8 text-[clamp(1.8rem,4vw,2.4rem)] font-black tracking-tight text-[#0D2847]">
          {responsavel.split(" ")[0] || "Tudo certo"}, recebemos seu pedido!
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-[14.5px] leading-relaxed text-[#666]">
          O pedido do plano <strong className="text-[#0D2847]">{plano}</strong> foi enviado para o nosso WhatsApp.
          Em até <strong>1 hora útil</strong> nosso especialista vai te contatar para confirmar os dados,
          enviar o contrato e o link de pagamento personalizado.
        </p>

        <div className="mx-auto mt-10 grid max-w-md gap-3 text-left">
          <PassoSucesso n="1" t="Conversa de confirmação" d="Vamos confirmar dados, esclarecer dúvidas e alinhar o início." />
          <PassoSucesso n="2" t="Contrato + pagamento" d="Você assina digitalmente e recebe o link de pagamento da forma escolhida." />
          <PassoSucesso n="3" t="Onboarding em até 7 dias" d="Nossa equipe assume o financeiro e configura o sistema." />
        </div>

        <Button
          onClick={onVoltar}
          variant="outline"
          className="mt-10 rounded-full border-[#0D2847]/15 bg-transparent text-[#0D2847] hover:bg-[#0D2847]/5"
        >
          Voltar para a página inicial
        </Button>
      </div>
    </div>
  );
}

function PassoSucesso({ n, t, d }: { n: string; t: string; d: string }) {
  return (
    <div className="flex gap-4 rounded-xl border border-black/8 bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#2C7BC4] text-[13px] font-black text-white">
        {n}
      </div>
      <div>
        <p className="text-[13.5px] font-bold text-[#0D2847]">{t}</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#666]">{d}</p>
      </div>
    </div>
  );
}

function planoCatalogoKey(v: string): PlanoKey | null {
  const norm = v.trim().toLowerCase();
  if (norm === "assistente") return "Assistente";
  if (norm === "controller") return "Controller";
  if (norm === "gestor") return "Gestor";
  return null;
}

function formaLabel(f: Forma) {
  if (f === "pix") return "PIX";
  if (f === "cartao") return "Cartão de crédito";
  return "Boleto bancário";
}
