import { useEffect, useState } from "react";
import { Check, Minus, Sparkles } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { precoDoPlano, precoEfetivo, type PrecosPlanos } from "@/lib/faturamento";
import {
  PLAN_ORDER,
  PLANS,
  ALL_MODULES,
  MODULE_LABELS,
  getPlanModules,
  type PlanoId,
  type ModuleId,
  type LimitKey,
} from "@/config/entitlements";

interface CompanyRow {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  plano: PlanoId | null;
  mensalidade_valor: number | null;
  dia_vencimento: number | null;
  assinatura_status: string | null;
}

const LIMIT_LABELS: Record<LimitKey, string> = {
  nfse_per_month: "NFSe por mês",
  whatsapp_per_month: "WhatsApp (Assistente)/mês",
};
const LIMIT_ORDER: LimitKey[] = ["nfse_per_month", "whatsapp_per_month"];

function shortLabel(m: ModuleId): string {
  return m === "core" ? "Essencial" : MODULE_LABELS[m];
}

const PLAN_STYLE: Record<
  PlanoId,
  { tag: string; ring: string; headerBg: string; headerText: string; subText: string; tagBg: string; premium: boolean }
> = {
  assistente: {
    tag: "Entrada",
    ring: "border-[#EAECF0]",
    headerBg: "bg-white",
    headerText: "text-[#1D2939]",
    subText: "text-[#667085]",
    tagBg: "bg-[#F2F4F7] text-[#475467]",
    premium: false,
  },
  controller: {
    tag: "Intermediário",
    ring: "border-[#A6F4C5]",
    headerBg: "bg-[#ECFDF4]",
    headerText: "text-[#054F31]",
    subText: "text-[#3B7A63]",
    tagBg: "bg-[#059669] text-white",
    premium: false,
  },
  gestor: {
    tag: "Completo",
    ring: "border-[#1D2939]",
    headerBg: "bg-[#1D2939]",
    headerText: "text-white",
    subText: "text-white/70",
    tagBg: "bg-white/15 text-white",
    premium: true,
  },
};

/** Cartões de plano com preço base editável + módulos + limites. */
function PlanCards({
  precos,
  onSavePreco,
}: {
  precos: Partial<PrecosPlanos>;
  onSavePreco: (plano: PlanoId, valor: number) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    setDraft({
      assistente: String(precos.assistente ?? 0),
      controller: String(precos.controller ?? 0),
      gestor: String(precos.gestor ?? 0),
    });
  }, [precos.assistente, precos.controller, precos.gestor]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {PLAN_ORDER.map((id) => {
        const plan = PLANS[id];
        const s = PLAN_STYLE[id];
        const mods = getPlanModules(id);
        const incluidos = ALL_MODULES.filter((m) => mods.has(m)).length;
        return (
          <div
            key={id}
            className={`rounded-2xl border ${s.ring} bg-white overflow-hidden flex flex-col shadow-sm transition-shadow hover:shadow-md ${s.premium ? "ring-1 ring-[#1D2939]/10" : ""}`}
          >
            <div className={`px-5 py-4 ${s.headerBg} border-b ${s.ring}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-lg font-bold tracking-tight ${s.headerText}`}>{plan.label}</span>
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${s.tagBg}`}>
                  {s.premium && <Sparkles className="w-3 h-3" />}
                  {s.tag}
                </span>
              </div>
              <p className={`text-xs mt-1 leading-relaxed ${s.subText}`}>{plan.resumo}</p>

              {/* Preço base editável */}
              <div className="mt-3 flex items-center gap-1.5">
                <span className={`text-sm font-semibold ${s.subText}`}>R$</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft[id] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value }))}
                  onBlur={() => {
                    const v = parseFloat(draft[id] || "0") || 0;
                    if (v !== Number(precos[id] ?? 0)) onSavePreco(id, v);
                  }}
                  className={`w-24 rounded-md px-2 py-1 text-sm font-bold border outline-none ${s.premium ? "bg-white/10 border-white/20 text-white" : "bg-white border-[#D0D5DD] text-[#1D2939]"}`}
                />
                <span className={`text-xs ${s.subText}`}>/mês</span>
              </div>
            </div>

            <div className="p-5 flex flex-col gap-4 flex-1">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#98A2B3] mb-2.5">
                  Módulos · {incluidos} de {ALL_MODULES.length}
                </div>
                <ul className="space-y-2">
                  {ALL_MODULES.map((m) => {
                    const ok = mods.has(m);
                    return (
                      <li key={m} className="flex items-center gap-2.5 text-sm">
                        {ok ? (
                          <span className="w-5 h-5 rounded-full bg-[#ECFDF4] flex items-center justify-center shrink-0">
                            <Check className="w-3.5 h-3.5 text-[#059669]" strokeWidth={3} />
                          </span>
                        ) : (
                          <span className="w-5 h-5 rounded-full bg-[#F4F4F5] flex items-center justify-center shrink-0">
                            <Minus className="w-3.5 h-3.5 text-[#D0D5DD]" />
                          </span>
                        )}
                        <span className={ok ? "text-[#1D2939]" : "text-[#C0C5CD]"}>{shortLabel(m)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="mt-auto rounded-xl bg-[#FBFAF7] border border-[#EAECF0] p-3.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#98A2B3] mb-2.5">Limites</div>
                <div className="space-y-1.5">
                  {LIMIT_ORDER.map((k) => (
                    <div key={k} className="flex items-center justify-between text-sm">
                      <span className="text-[#667085]">{LIMIT_LABELS[k]}</span>
                      <span className="font-bold text-[#1D2939] tabular-nums">{plan.limits[k]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminPlanos() {
  const { activeClient } = useAuth();
  const queryClient = useQueryClient();
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: cfg } = useQuery({
    queryKey: ["tatica_config"],
    queryFn: async () => {
      const { data, error } = await (activeClient as any)
        .from("tatica_config")
        .select("precos_planos")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return (data || {}) as { precos_planos?: Partial<PrecosPlanos> };
    },
  });
  const precos: Partial<PrecosPlanos> = cfg?.precos_planos ?? {};

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["admin-planos-companies"],
    queryFn: async () => {
      const { data, error } = await (activeClient as any)
        .from("companies")
        .select("id, razao_social, nome_fantasia, plano, mensalidade_valor, dia_vencimento, assinatura_status")
        .eq("is_active", true)
        .order("razao_social");
      if (error) throw error;
      return data as CompanyRow[];
    },
  });

  const savePreco = async (plano: PlanoId, valor: number) => {
    try {
      const novos = { ...(precos as PrecosPlanos), [plano]: valor };
      const { error } = await (activeClient as any)
        .from("tatica_config")
        .upsert({ id: 1, precos_planos: novos }, { onConflict: "id" });
      if (error) throw error;
      toast.success(`Preço do ${PLANS[plano].label} atualizado`);
      queryClient.invalidateQueries({ queryKey: ["tatica_config"] });
    } catch (e: any) {
      toast.error("Erro ao salvar preço: " + (e.message || "desconhecido"));
    }
  };

  const updateCompany = async (id: string, patch: Partial<CompanyRow>) => {
    setSavingId(id);
    try {
      const { error } = await (activeClient as any).from("companies").update(patch).eq("id", id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin-planos-companies"] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e.message || "desconhecido"));
    } finally {
      setSavingId(null);
    }
  };

  const inputCls =
    "border border-[#ccc] rounded-md px-2 py-1.5 text-sm text-[#1D2939] bg-white focus:border-[#059669] focus:outline-none disabled:opacity-50";

  return (
    <AppLayout title="Planos & Assinaturas">
      <PagePanel
        title="Planos & Assinaturas"
        subtitle="Pacotes, preços e a assinatura de cada empresa-cliente"
      >
        <div>
          <h3 className="text-sm font-bold text-[#1D2939] mb-3">Planos &amp; preços</h3>
          <PlanCards precos={precos} onSavePreco={savePreco} />
        </div>

        <div>
          <h3 className="text-sm font-bold text-[#1D2939] mb-1">Assinatura de cada empresa</h3>
          <p className="text-xs text-[#667085] mb-3">
            Mensalidade em branco = <strong>herda o preço do plano</strong>. Empresa sem plano = acesso total (legado).
          </p>

          {isLoading ? (
            <div className="text-center py-12 text-sm text-[#555]">Carregando empresas...</div>
          ) : companies.length === 0 ? (
            <div className="text-center py-12 text-sm text-[#555]">Nenhuma empresa encontrada.</div>
          ) : (
            <div className="overflow-x-auto border border-[#EAECF0] rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#1D2939] text-white text-[12px] uppercase tracking-wider">
                    <th className="text-left font-semibold px-4 py-3">Empresa</th>
                    <th className="text-left font-semibold px-4 py-3 w-44">Pacote</th>
                    <th className="text-left font-semibold px-4 py-3 w-40">Mensalidade</th>
                    <th className="text-left font-semibold px-4 py-3 w-24">Venc.</th>
                    <th className="text-left font-semibold px-4 py-3 w-32">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c, i) => {
                    const efetivo = precoEfetivo(c.plano, c.mensalidade_valor, precos);
                    return (
                      <tr key={c.id} className={`border-t border-[#EAECF0] ${i % 2 ? "bg-[#FCFCFB]" : "bg-white"}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[#1D2939]">{c.nome_fantasia || c.razao_social}</div>
                          {c.nome_fantasia && <div className="text-[11px] text-[#98A2B3]">{c.razao_social}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={c.plano ?? ""}
                            disabled={savingId === c.id}
                            onChange={(e) => updateCompany(c.id, { plano: (e.target.value || null) as PlanoId | null })}
                            className={`${inputCls} w-full`}
                          >
                            <option value="">Sem plano</option>
                            {PLAN_ORDER.map((id) => (
                              <option key={id} value={id}>{PLANS[id].label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            defaultValue={c.mensalidade_valor ?? ""}
                            placeholder={`herda ${formatBRL(precoDoPlano(c.plano, precos))}`}
                            disabled={savingId === c.id}
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              const val = raw === "" ? null : parseFloat(raw.replace(",", "."));
                              if ((val ?? null) !== (c.mensalidade_valor ?? null)) {
                                updateCompany(c.id, { mensalidade_valor: val });
                              }
                            }}
                            className={`${inputCls} w-full`}
                          />
                          <div className="text-[11px] text-[#98A2B3] mt-0.5">= {formatBRL(efetivo)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min={1}
                            max={28}
                            defaultValue={c.dia_vencimento ?? 10}
                            disabled={savingId === c.id}
                            onBlur={(e) => {
                              const v = Math.min(28, Math.max(1, parseInt(e.target.value) || 10));
                              if (v !== (c.dia_vencimento ?? 10)) updateCompany(c.id, { dia_vencimento: v });
                            }}
                            className={`${inputCls} w-16`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={c.assinatura_status ?? "ativa"}
                            disabled={savingId === c.id}
                            onChange={(e) => updateCompany(c.id, { assinatura_status: e.target.value })}
                            className={`${inputCls} w-full`}
                          >
                            <option value="ativa">Ativa</option>
                            <option value="suspensa">Suspensa</option>
                            <option value="cancelada">Cancelada</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </PagePanel>
    </AppLayout>
  );
}
