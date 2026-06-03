import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Archive } from "lucide-react";

const VERMELHO = "#E53E3E";
const VERDE = "#039855";

const fmt2 = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

/** 'YYYY-MM-DD'(+hora) → 'dd/MM/aaaa'. */
function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}
function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(iso));
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : fmtData(iso);
}

interface ArqRow {
  id: string;
  dados: any;
  motivo: string | null;
  arquivado_em: string;
}

export default function LancamentosArquivados() {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const cId = selectedCompany?.id;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["mov_arquivadas", cId],
    enabled: !!db && !!cId,
    queryFn: async (): Promise<ArqRow[]> => {
      const { data } = await db
        .from("movimentacoes_arquivadas")
        .select("id, dados, motivo, arquivado_em")
        .eq("company_id", cId)
        .order("arquivado_em", { ascending: false })
        .limit(5000);
      return (data || []) as ArqRow[];
    },
  });

  const th: React.CSSProperties = { textAlign: "left", padding: "9px 14px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#000", whiteSpace: "nowrap" };

  return (
    <AppLayout title="Lançamentos Arquivados">
      <div style={{ fontFamily: "var(--font-base)" }}>
        <PagePanel title="Lançamentos Arquivados" subtitle="Lançamentos removidos do razão — guardados aqui, recuperáveis">
          <div style={{ background: "#FFFFFF", border: "var(--border-hairline)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", background: "#071D41", display: "flex", alignItems: "center", gap: 8 }}>
              <Archive size={15} style={{ color: "#fff" }} />
              <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "#fff" }}>Movimentações arquivadas</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #D0D5DD" }}>
                    <th style={th}>Data</th>
                    <th style={th}>Descrição</th>
                    <th style={th}>Conta/Categoria</th>
                    <th style={{ ...th, textAlign: "right" }}>Valor</th>
                    <th style={th}>Motivo do arquivamento</th>
                    <th style={{ ...th, textAlign: "right" }}>Arquivado em</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={6} style={{ padding: "28px 0", textAlign: "center", color: "#98A2B3", fontSize: 13 }}>Carregando…</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: "28px 0", textAlign: "center", color: "#98A2B3", fontSize: 13 }}>Nenhum lançamento arquivado.</td></tr>
                  ) : (
                    rows.map((r) => {
                      const d = r.dados || {};
                      const valor = Number(d.valor) || 0;
                      const credito = (d.tipo || "").toLowerCase() === "credito";
                      return (
                        <tr key={r.id} style={{ borderBottom: "1px solid #F1F3F5" }}>
                          <td style={{ padding: "8px 14px", color: "#1D2939", whiteSpace: "nowrap" }}>{fmtData(d.data)}</td>
                          <td style={{ padding: "8px 14px", color: "#1D2939", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.descricao || ""}>{d.descricao || "—"}</td>
                          <td style={{ padding: "8px 14px", color: "#667085", whiteSpace: "nowrap" }}>{d.origem || "—"}</td>
                          <td style={{ padding: "8px 14px", textAlign: "right", whiteSpace: "nowrap", fontWeight: 600, color: credito ? VERDE : VERMELHO }}>
                            {credito ? "+" : "−"}{fmt2(valor)}
                          </td>
                          <td style={{ padding: "8px 14px", color: "#667085", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.motivo || ""}>{r.motivo || "—"}</td>
                          <td style={{ padding: "8px 14px", textAlign: "right", color: "#98A2B3", whiteSpace: "nowrap" }}>{fmtDataHora(r.arquivado_em)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "10px 14px", borderTop: "var(--border-hairline)", fontSize: 11.5, color: "#98A2B3" }}>
              Estes lançamentos foram removidos do razão mas guardados na íntegra. Para restaurar algum, me avise — é só reinserir.
            </div>
          </div>
        </PagePanel>
      </div>
    </AppLayout>
  );
}
