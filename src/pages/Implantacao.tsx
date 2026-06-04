import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Circle, ChevronRight, SlidersHorizontal, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/contexts/CompanyContext";
import { useImplantacao, type ImplantacaoPerfil } from "@/hooks/useImplantacao";
import { cn } from "@/lib/utils";

type PerfilForm = Omit<ImplantacaoPerfil, "preenchido_em">;

const OPT = "flex-1 rounded-md border px-3 py-2 text-[13px] font-semibold transition-colors";
const optCls = (active: boolean) =>
  cn(OPT, active ? "border-[#059669] bg-[#ECFDF4] text-[#059669]" : "border-[#D0D5DD] bg-white text-[#475467] hover:bg-[#F9FAFB]");

function Pergunta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[13px] font-semibold text-[#1D2939]">{label}</p>
      <div className="flex gap-2 max-w-md">{children}</div>
    </div>
  );
}

export default function Implantacao() {
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { perfil, perfilPreenchido, steps, doneCount, total, pct, allDone, isLoading, savePerfil } =
    useImplantacao(companyId);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PerfilForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (perfil) {
      setForm({
        vende: perfil.vende,
        emite_nf: perfil.emite_nf,
        controla_estoque: perfil.controla_estoque,
        identifica_clientes: perfil.identifica_clientes,
      });
    }
  }, [perfil]);

  const mostrarForm = editing || !perfilPreenchido;

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await savePerfil(form);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout title="Implantação">
      <PagePanel title="Implantação do sistema" subtitle="Configure o essencial pra começar a usar — só o que o seu negócio precisa">
        {!companyId ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Selecione uma empresa para começar.</div>
        ) : isLoading || !form ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
          </div>
        ) : mostrarForm ? (
          /* ─── Perfil do negócio ─── */
          <div className="max-w-2xl space-y-6 pt-2">
            <div>
              <h2 className="text-[15px] font-bold text-[#1D2939]">Sobre o seu negócio</h2>
              <p className="text-[13px] text-muted-foreground">Responda 4 perguntas — o checklist se adapta e mostra só o que faz sentido pra você.</p>
            </div>

            <Pergunta label="O que você vende?">
              {(["produto", "servico", "ambos"] as const).map((v) => (
                <button key={v} type="button" className={optCls(form.vende === v)} onClick={() => setForm({ ...form, vende: v })}>
                  {v === "produto" ? "Produtos" : v === "servico" ? "Serviços" : "Ambos"}
                </button>
              ))}
            </Pergunta>

            <Pergunta label="Você emite nota fiscal?">
              <button type="button" className={optCls(form.emite_nf)} onClick={() => setForm({ ...form, emite_nf: true })}>Sim</button>
              <button type="button" className={optCls(!form.emite_nf)} onClick={() => setForm({ ...form, emite_nf: false })}>Não</button>
            </Pergunta>

            <Pergunta label="Você controla estoque?">
              <button type="button" className={optCls(form.controla_estoque)} onClick={() => setForm({ ...form, controla_estoque: true })}>Sim</button>
              <button type="button" className={optCls(!form.controla_estoque)} onClick={() => setForm({ ...form, controla_estoque: false })}>Não</button>
            </Pergunta>

            <Pergunta label="Você cadastra seus clientes?">
              <button type="button" className={optCls(form.identifica_clientes)} onClick={() => setForm({ ...form, identifica_clientes: true })}>Sim</button>
              <button type="button" className={optCls(!form.identifica_clientes)} onClick={() => setForm({ ...form, identifica_clientes: false })}>Não, vendo no balcão</button>
            </Pergunta>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} className="bg-[#059669] hover:bg-[#047a52] text-white">
                {saving ? "Salvando..." : "Salvar e ver checklist"}
              </Button>
              {perfilPreenchido && (
                <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancelar</Button>
              )}
            </div>
          </div>
        ) : (
          /* ─── Checklist adaptativo ─── */
          <div className="space-y-5 pt-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-bold text-[#1D2939]">
                  {allDone ? "Tudo pronto! 🎉" : `${doneCount} de ${total} passos concluídos`}
                </h2>
                <p className="text-[13px] text-muted-foreground">
                  {allDone ? "Seu sistema está implantado." : "Clique num passo pra resolver."}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="shrink-0">
                <SlidersHorizontal className="h-4 w-4 mr-1.5" /> Ajustar perfil
              </Button>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-[#F2F4F7]">
              <div className="h-full rounded-full bg-[#059669] transition-all" style={{ width: `${pct}%` }} />
            </div>

            <div className="divide-y divide-[#F1F3F5] rounded-lg border border-[#EAECF0] overflow-hidden">
              {steps.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => navigate(s.route)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F9FAFB]"
                >
                  {s.done ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-[#039855]" />
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-[#D0D5DD]" strokeWidth={1.5} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[14px] font-semibold", s.done ? "text-[#98A2B3] line-through" : "text-[#1D2939]")}>{s.title}</p>
                    <p className="text-[12px] text-muted-foreground">{s.desc}</p>
                  </div>
                  {!s.done && (
                    <span className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[#059669]">
                      {s.cta} <ChevronRight className="h-4 w-4" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </PagePanel>
    </AppLayout>
  );
}
