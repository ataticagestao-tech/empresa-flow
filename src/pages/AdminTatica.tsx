import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Mail, Landmark } from "lucide-react";

const IC =
  "border border-[#ccc] rounded-md px-3 py-2 text-sm text-[#1D2939] bg-white focus:border-[#059669] focus:outline-none w-full";
const LB = "text-[11px] font-bold uppercase tracking-wider text-[#1D2939]";

type Cfg = Record<string, any>;

const FIELDS_IDENTIDADE = [
  ["razao_social", "Razão Social"],
  ["nome_fantasia", "Nome Fantasia"],
  ["cnpj", "CNPJ"],
  ["inscricao_estadual", "Inscrição Estadual"],
  ["inscricao_municipal", "Inscrição Municipal"],
  ["logo_url", "URL do Logo"],
  ["endereco_logradouro", "Logradouro"],
  ["endereco_numero", "Número"],
  ["endereco_bairro", "Bairro"],
  ["endereco_cidade", "Cidade"],
  ["endereco_estado", "UF"],
  ["endereco_cep", "CEP"],
] as const;

const FIELDS_CONTATO = [
  ["contato_email", "E-mail"],
  ["contato_telefone", "Telefone / WhatsApp"],
  ["site", "Site"],
] as const;

const FIELDS_RECEBIMENTO = [
  ["pix_chave", "Chave PIX"],
  ["pix_titular_nome", "Titular (nome)"],
  ["pix_titular_documento", "Titular (CPF/CNPJ)"],
  ["banco", "Banco"],
  ["agencia", "Agência"],
  ["conta", "Conta"],
  ["conta_digito", "Dígito"],
] as const;

export default function AdminTatica() {
  const { activeClient } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Cfg>({});
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["tatica_config"],
    queryFn: async () => {
      const { data, error } = await (activeClient as any)
        .from("tatica_config")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return (data || {}) as Cfg;
    },
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...form, id: 1, updated_at: new Date().toISOString() };
      const { error } = await (activeClient as any)
        .from("tatica_config")
        .upsert(payload, { onConflict: "id" });
      if (error) throw error;
      toast.success("Dados da Tática salvos");
      queryClient.invalidateQueries({ queryKey: ["tatica_config"] });
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e.message || "desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  const renderFields = (fields: readonly (readonly [string, string])[]) => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {fields.map(([key, label]) => (
        <div key={key} className="flex flex-col gap-1">
          <label className={LB}>{label}</label>
          <input
            className={IC}
            value={form[key] ?? ""}
            onChange={(e) => set(key, e.target.value)}
          />
        </div>
      ))}
    </div>
  );

  const Section = ({
    icon: Icon,
    title,
    subtitle,
    children,
  }: {
    icon: typeof Building2;
    title: string;
    subtitle: string;
    children: React.ReactNode;
  }) => (
    <div className="rounded-xl border border-[#EAECF0] bg-white overflow-hidden">
      <div className="bg-[#1D2939] px-4 py-2.5 flex items-center gap-2">
        <Icon className="w-4 h-4 text-white/80" />
        <div>
          <div className="text-xs font-bold text-white uppercase tracking-widest">{title}</div>
          <div className="text-[11px] text-white/60">{subtitle}</div>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );

  return (
    <AppLayout title="Dados da Tática">
      <PagePanel
        title="Dados da Tática"
        subtitle="Identidade e dados de recebimento da Tática como emissora das faturas do sistema"
      >
        {isLoading ? (
          <div className="text-center py-12 text-sm text-[#555]">Carregando...</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#EAECF0] bg-[#FBFAF7] px-4 py-3 text-xs text-[#475467]">
              Estes dados aparecem na <strong>fatura mensal</strong> enviada aos clientes (quem
              cobra + para onde pagar). Visível só para a equipe Tática.
            </div>

            <Section icon={Building2} title="Identidade" subtitle="Quem emite a fatura">
              {renderFields(FIELDS_IDENTIDADE)}
            </Section>

            <Section icon={Mail} title="Contato" subtitle="Aparece no rodapé da fatura">
              {renderFields(FIELDS_CONTATO)}
            </Section>

            <Section icon={Landmark} title="Recebimento" subtitle="Para onde o cliente paga (PIX / banco)">
              {renderFields(FIELDS_RECEBIMENTO)}
            </Section>

            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-[#059669] text-white text-sm font-bold px-6 py-2 rounded-md disabled:opacity-40"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        )}
      </PagePanel>
    </AppLayout>
  );
}
