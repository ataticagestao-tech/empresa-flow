import { Info, TriangleAlert, CheckCircle2, Lock, LockOpen } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useSaldoBancoVsSistema, type SaldoComparacao } from "@/modules/finance/presentation/hooks/useContasSaldo";

/**
 * Fase 1 PLANO_SALDO_CONCILIACAO — painel "Banco × Sistema × Diferença".
 * Mostra, por conta, o saldo do sistema vs o último saldo declarado pelo extrato (banco),
 * e a diferença. Só revela o buraco — não muda nenhum saldo.
 */

const NAVY = "#071D41";
const VERMELHO = "#E53E3E";
const VERDE = "#039855";

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
const fmt2 = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

const INFO =
  "Banco = último saldo declarado no extrato importado (OFX). Sistema = saldo calculado pelas movimentações. " +
  "Diferença = sistema − banco. Diferente de zero indica lançamentos faltando, duplicados ou taxa de cartão não registrada. " +
  "Importe o extrato (OFX) de cada conta para o banco aparecer aqui.";

/** Tolerância pra considerar "bate" (centavos de arredondamento). */
const TOL = 0.5;

export function SaldoBancoVsSistema({ companyId }: { companyId?: string }) {
  const { selectedCompany } = useCompany();
  // Resolve a empresa internamente: alguns pais (ex.: Conciliação) montam o painel
  // sem passar a prop. Sem isto, as ações (conferir/fechar/reabrir) saíam caladas.
  const cid = companyId || selectedCompany?.id;
  const { comparacao, isLoading } = useSaldoBancoVsSistema(cid);
  const { activeClient, user } = useAuth();
  const db = activeClient as any;
  const queryClient = useQueryClient();

  const comBanco = comparacao.filter((c) => c.saldoBanco != null);
  const totalDiferenca = comBanco.reduce((s, c) => s + Math.abs(c.diferenca ?? 0), 0);

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["saldo_banco_vs_sistema"] });

  const fechar = async (c: SaldoComparacao) => {
    if (!cid || !c.asOfDate) return;
    const ok = window.confirm(
      `Fechar a conciliação da conta "${c.nome}" até ${fmtData(c.asOfDate)}?\n\n` +
      `Banco: ${fmt2(c.saldoBanco ?? 0)} · Sistema: ${fmt2(c.saldoSistema)} · Diferença: ${fmt2(c.diferenca ?? 0)}\n\n` +
      `Vai TRAVAR a desconciliação dos lançamentos até essa data (dá pra reabrir depois).`,
    );
    if (!ok) return;
    try {
      const { error } = await db.from("reconciliation_closings").insert({
        company_id: cid,
        bank_account_id: c.contaId,
        period_end: c.asOfDate,
        closing_balance: c.saldoBanco,
        system_balance: c.saldoSistema,
        difference: c.diferenca,
        closed_by: user?.id ?? null,
      });
      if (error) throw error;
      toast.success(`Período de "${c.nome}" fechado até ${fmtData(c.asOfDate)}.`);
      invalidar();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao fechar período");
    }
  };

  const reabrir = async (c: SaldoComparacao) => {
    if (!cid) return;
    if (!window.confirm(`Reabrir o fechamento de "${c.nome}"? Os lançamentos voltam a poder ser desconciliados.`)) return;
    try {
      const { error } = await db.from("reconciliation_closings").delete().eq("company_id", cid).eq("bank_account_id", c.contaId);
      if (error) throw error;
      toast.success(`Fechamento de "${c.nome}" reaberto.`);
      invalidar();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao reabrir");
    }
  };

  // Caixa físico não tem extrato: o "saldo do banco" vem de uma CONTAGEM manual.
  // Registra o valor contado como âncora (source 'contagem') — daí o caixa passa a
  // mostrar diferença vs sistema e libera o "Fechar", igual às contas com extrato.
  const conferirCaixa = async (c: SaldoComparacao) => {
    if (!cid) return;
    const raw = window.prompt(
      `Conferência de caixa — "${c.nome}"\n\n` +
      `O sistema diz que tem ${fmt2(c.saldoSistema)}.\n` +
      `Quanto você CONTOU de verdade no caixa? (digite o valor real)`,
      c.saldoSistema.toFixed(2).replace(".", ","),
    );
    if (raw == null) return;
    const limpo = raw.trim().replace(/[R$\s]/g, "");
    const contado = limpo.includes(",")
      ? parseFloat(limpo.replace(/\./g, "").replace(",", "."))
      : parseFloat(limpo);
    if (!Number.isFinite(contado)) {
      toast.error("Valor inválido. Digite só números, ex.: 1500,00");
      return;
    }
    const d = new Date();
    const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dif = Number((c.saldoSistema - contado).toFixed(2));
    try {
      const { error } = await db.from("bank_statement_balances").upsert(
        {
          company_id: cid,
          bank_account_id: c.contaId,
          as_of_date: hoje,
          closing_balance: contado,
          source: "contagem",
        },
        { onConflict: "bank_account_id,as_of_date" },
      );
      if (error) throw error;
      if (Math.abs(dif) <= TOL) {
        toast.success(`Caixa confere! Contado ${fmt2(contado)} bate com o sistema.`);
      } else {
        toast.warning(
          `Contagem registrada: ${fmt2(contado)}. ${dif > 0 ? "Falta" : "Sobra"} de ${fmt2(Math.abs(dif))} vs o sistema — lance um ajuste de caixa pra zerar.`,
        );
      }
      invalidar();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao registrar a contagem");
    }
  };

  return (
    <div style={{ background: "#FFFFFF", border: "var(--border-hairline)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", background: NAVY, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "#fff" }}>
          Saldo: Banco × Sistema
        </span>
        <span title={INFO} style={{ display: "inline-flex", cursor: "help" }}>
          <Info size={13} style={{ color: "rgba(255,255,255,0.6)" }} />
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #D0D5DD" }}>
              <th style={{ textAlign: "left", padding: "9px 14px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#000" }}>Conta</th>
              <th style={{ textAlign: "right", padding: "9px 14px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#000" }}>Sistema</th>
              <th style={{ textAlign: "right", padding: "9px 14px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#000" }}>Banco (extrato)</th>
              <th style={{ textAlign: "right", padding: "9px 14px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#000" }}>Diferença</th>
              <th style={{ textAlign: "right", padding: "9px 14px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#000" }}>A conciliar</th>
              <th style={{ textAlign: "right", padding: "9px 14px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#000" }}>Fechamento</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ padding: "24px 0", textAlign: "center", color: "#98A2B3", fontSize: 13 }}>Carregando…</td></tr>
            ) : comparacao.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: "24px 0", textAlign: "center", color: "#98A2B3", fontSize: 13 }}>Nenhuma conta encontrada.</td></tr>
            ) : (
              comparacao.map((c) => {
                const semBanco = c.saldoBanco == null;
                const bate = !semBanco && Math.abs(c.diferenca ?? 0) <= TOL;
                const difColor = semBanco ? "#98A2B3" : bate ? VERDE : VERMELHO;
                return (
                  <tr key={c.contaId} style={{ borderBottom: "1px solid #F1F3F5" }}>
                    <td style={{ padding: "9px 14px", color: "#1D2939" }}>
                      {c.nome}
                      {c.asOfDate && <span style={{ marginLeft: 8, fontSize: 11, color: "#98A2B3" }}>{c.fonteSaldo === "contagem" ? "contagem" : "extrato"} {fmtData(c.asOfDate)}</span>}
                    </td>
                    <td style={{ padding: "9px 14px", textAlign: "right", color: c.saldoSistema < 0 ? VERMELHO : "#1D2939", fontWeight: 600, whiteSpace: "nowrap" }}>{fmt2(c.saldoSistema)}</td>
                    <td style={{ padding: "9px 14px", textAlign: "right", color: semBanco ? "#98A2B3" : c.saldoBanco! < 0 ? VERMELHO : "#1D2939", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {semBanco ? (c.accountType === "cash" ? "não contado" : "sem extrato") : fmt2(c.saldoBanco!)}
                    </td>
                    <td style={{ padding: "9px 14px", textAlign: "right", color: difColor, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {semBanco ? (
                        "—"
                      ) : bate ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}><CheckCircle2 size={13} /> bate</span>
                      ) : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}><TriangleAlert size={13} /> {fmt2(c.diferenca!)}</span>
                      )}
                    </td>
                    <td style={{ padding: "9px 14px", textAlign: "right", whiteSpace: "nowrap", color: c.pendentesCount > 0 ? "#B54708" : VERDE, fontWeight: 600 }}>
                      {c.pendentesCount > 0 ? (
                        <span title={`Total pendente: ${fmt2(c.pendentesTotal)}`}>{c.pendentesCount} lanç.</span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td style={{ padding: "9px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {c.fechadoAte ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "#027A48", fontWeight: 600, fontSize: 12 }} title={`Fechado · diferença registrada ${fmt2(c.fechadoDiferenca ?? 0)}`}>
                            <Lock size={12} /> {fmtData(c.fechadoAte)}
                          </span>
                          <button onClick={() => reabrir(c)} style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#fff", border: "1px solid #D0D5DD", borderRadius: 6, padding: "3px 7px", fontSize: 11, color: "#B42318", cursor: "pointer" }} title="Reabrir período">
                            <LockOpen size={11} /> Reabrir
                          </button>
                        </span>
                      ) : c.accountType === "cash" ? (
                        // Caixa físico: sem extrato. Confere por contagem; depois libera o Fechar.
                        semBanco ? (
                          <button onClick={() => conferirCaixa(c)} style={{ background: "#1D2939", color: "#fff", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }} title="Caixa não tem extrato — informe o valor contado">
                            Conferir caixa
                          </button>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                            <button onClick={() => fechar(c)} style={{ background: bate ? "#059669" : "#fff", color: bate ? "#fff" : "#1D2939", border: bate ? "none" : "1px solid #D0D5DD", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }} title={bate ? "Caixa confere — fechar o período" : "Fechar mesmo com diferença (fica registrada)"}>
                              Fechar
                            </button>
                            <button onClick={() => conferirCaixa(c)} style={{ background: "#fff", border: "1px solid #D0D5DD", borderRadius: 6, padding: "5px 8px", fontSize: 11, color: "#475467", cursor: "pointer" }} title="Refazer a contagem do caixa">
                              Recontar
                            </button>
                          </span>
                        )
                      ) : semBanco ? (
                        <span style={{ color: "#98A2B3", fontSize: 12 }}>—</span>
                      ) : (
                        <button onClick={() => fechar(c)} style={{ background: bate ? "#059669" : "#fff", color: bate ? "#fff" : "#1D2939", border: bate ? "none" : "1px solid #D0D5DD", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }} title={bate ? "Diferença zero — fechar o período" : "Fechar mesmo com diferença (fica registrada)"}>
                          Fechar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{ padding: "10px 14px", borderTop: "var(--border-hairline)", fontSize: 11.5, color: "#667085", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        {comBanco.length === 0 ? (
          <span>Importe o extrato (OFX) de cada conta pra ver o saldo do banco aqui.</span>
        ) : (
          <span>Divergência total (contas com extrato): <strong style={{ color: totalDiferenca > TOL ? VERMELHO : VERDE }}>{fmt(totalDiferenca)}</strong></span>
        )}
        <span style={{ color: "#98A2B3" }}>Concilie os lançamentos "a conciliar" pra a diferença zerar (fechar o mês).</span>
      </div>
    </div>
  );
}
