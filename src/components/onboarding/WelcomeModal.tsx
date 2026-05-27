import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanies } from "@/hooks/useCompanies";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Building2, Wallet, CheckCircle2, ArrowRight, ArrowLeft,
  ShoppingCart, FileText,
} from "lucide-react";

const STORAGE_KEY = "welcome_modal_dismissed";

type Slide = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  bullets?: string[];
  accent: string;
  accentBg: string;
};

const SLIDES: Slide[] = [
  {
    icon: Sparkles,
    title: "Bem-vinda ao Tática Flow",
    description: "Sistema completo de gestão financeira para sua empresa. Em poucos minutos você está usando.",
    bullets: [
      "Vendas, contas a pagar e receber, fluxo de caixa",
      "Conciliação bancária automática (OFX/PDF/Excel)",
      "DRE, fluxo de caixa projetado, relatórios pro contador",
      "Tudo em um só lugar, com multi-empresa",
    ],
    accent: "#059669",
    accentBg: "#ECFDF4",
  },
  {
    icon: Building2,
    title: "1. Cadastre sua empresa",
    description: "Comece informando o CNPJ — o sistema busca razão social, endereço e data de abertura na Receita automaticamente.",
    bullets: [
      "Você só precisa preencher CNPJ, regime tributário e responsável",
      "Pode cadastrar quantas empresas precisar",
      "O seletor no topo do menu alterna entre elas",
    ],
    accent: "#0066FF",
    accentBg: "#EFF6FF",
  },
  {
    icon: Wallet,
    title: "2. Configure plano de contas e banco",
    description: "Dois passos rápidos: importe um modelo de plano de contas pronto e cadastre suas contas bancárias.",
    bullets: [
      "Plano de contas: categorias de receita e despesa (você pode copiar um modelo)",
      "Contas bancárias: banco, agência, conta e ACCTID do OFX",
      "Esses cadastros alimentam DRE, fluxo de caixa e conciliação",
    ],
    accent: "#8B5CF6",
    accentBg: "#F5F3FF",
  },
  {
    icon: ShoppingCart,
    title: "3. Comece a lançar",
    description: "Pronto para usar. Lance sua primeira venda ou despesa e veja o sistema gerar caixa, CR/CP e atualizar o dashboard.",
    bullets: [
      "Vendas geram contas a receber automaticamente",
      "Despesas viram contas a pagar com vencimento e categoria",
      "Conciliação concilia o que bate sozinho, você só categoriza o que sobra",
    ],
    accent: "#F59E0B",
    accentBg: "#FFFBEB",
  },
];

export function WelcomeModal() {
  const { user } = useAuth();
  const { companies, isLoading: companiesLoading } = useCompanies(user?.id);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!user || companiesLoading) return;
    let dismissed = false;
    try { dismissed = localStorage.getItem(STORAGE_KEY) === "true"; } catch {}
    if (dismissed) return;
    // Mostra se for usuário sem nenhuma empresa cadastrada (verdadeiro 1º acesso)
    if ((companies?.length ?? 0) === 0) {
      setOpen(true);
    } else {
      // Já tem empresa — marca como visto pra não aparecer depois
      try { localStorage.setItem(STORAGE_KEY, "true"); } catch {}
    }
  }, [user, companies, companiesLoading]);

  const close = () => {
    try { localStorage.setItem(STORAGE_KEY, "true"); } catch {}
    setOpen(false);
  };

  const finish = () => {
    close();
    navigate("/empresas?new=true");
  };

  if (!open) return null;
  const slide = SLIDES[step];
  const isFirst = step === 0;
  const isLast = step === SLIDES.length - 1;
  const Icon = slide.icon;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden gap-0">
        {/* Top accent area */}
        <div
          style={{
            background: slide.accentBg,
            padding: "32px 32px 24px",
            borderBottom: "1px solid #EAECF0",
          }}
        >
          <div
            style={{
              width: 56, height: 56, borderRadius: 14,
              background: "#FFFFFF",
              boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <Icon className="h-7 w-7" style={{ color: slide.accent } as any} />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1D2939", margin: 0, marginBottom: 8, letterSpacing: "-0.02em" }}>
            {slide.title}
          </h2>
          <p style={{ fontSize: 14, color: "#475467", margin: 0, lineHeight: 1.5 }}>
            {slide.description}
          </p>
        </div>

        {/* Bullets */}
        <div style={{ padding: "20px 32px 24px" }}>
          {slide.bullets && (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {slide.bullets.map((b, i) => (
                <li key={i} style={{ display: "flex", gap: 10, fontSize: 13.5, color: "#344054", lineHeight: 1.5 }}>
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: slide.accent } as any} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 32px 24px",
            borderTop: "1px solid #EAECF0",
            background: "#FAFAFA",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}
        >
          {/* Progress dots */}
          <div style={{ display: "flex", gap: 6 }}>
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                aria-label={`Slide ${i + 1}`}
                style={{
                  width: i === step ? 24 : 8,
                  height: 8,
                  borderRadius: 999,
                  background: i === step ? slide.accent : "#D0D5DD",
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  padding: 0,
                }}
              />
            ))}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {!isFirst && (
              <Button variant="ghost" size="sm" onClick={() => setStep(s => Math.max(0, s - 1))}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
            )}
            {!isLast ? (
              <Button
                size="sm"
                onClick={() => setStep(s => Math.min(SLIDES.length - 1, s + 1))}
                style={{ background: slide.accent, color: "#FFFFFF" }}
              >
                Próximo <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={finish}
                style={{ background: slide.accent, color: "#FFFFFF" }}
              >
                Cadastrar empresa <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>

        {/* Skip link */}
        <button
          onClick={close}
          style={{
            position: "absolute",
            top: 12, right: 16,
            background: "transparent", border: "none",
            fontSize: 12, color: "#98A2B3",
            cursor: "pointer", padding: 4,
          }}
        >
          Pular
        </button>
      </DialogContent>
    </Dialog>
  );
}

export default WelcomeModal;
