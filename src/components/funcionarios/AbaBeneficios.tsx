import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import {
  calcularDiasUteis,
  calcularBeneficios,
  type RegimeTrabalho,
  type DiaMes,
} from "@/lib/beneficios/calculos";
import {
  useBeneficiosConfig,
  useBeneficiosHistorico,
  salvarBeneficiosConfig,
  type BeneficiosConfig,
} from "@/hooks/useBeneficios";
import { confirmarBeneficiosMes } from "@/lib/beneficios/confirmar";

interface Props {
  companyId: string;
  employeeId: string;
  employeeNome: string;
  salarioBase: number;
  usuarioId: string;
}

const LB = "text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]";
const IC_EDIT = "border border-[#1a2e4a] rounded-md px-3 py-2 text-[13px] text-[#1a2e4a] bg-white focus:outline-none w-full";
const IC_RO = "border border-[#1a2e4a] rounded-md px-3 py-2 text-[13px] bg-[#f0f4f8] text-[#1a2e4a] font-bold w-full";
const IC_POS = "border border-[#0a5c2e] rounded-md px-3 py-2 text-[13px] bg-[#e6f4ec] text-[#0a5c2e] font-bold w-full";
const IC_NEG = "border border-[#8b0000] rounded-md px-3 py-2 text-[13px] bg-[#fdecea] text-[#8b0000] font-bold w-full";

const REGIMES: { value: RegimeTrabalho; label: string }[] = [
  { value: "seg_sex", label: "Seg–Sex" },
  { value: "seg_sab", label: "Seg–Sáb" },
  { value: "escala_6x1", label: "Escala 6×1" },
];

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const diaClasse = (tipo: DiaMes["tipo"]) => {
  if (tipo === "util") return "bg-[#e6f4ec] text-[#0a5c2e] border border-[#0a5c2e]";
  if (tipo === "feriado") return "bg-[#fdecea] text-[#8b0000] border border-[#8b0000]";
  return "bg-[#f5f5f5] text-[#aaa]";
};

export default function AbaBeneficios({ companyId, employeeId, employeeNome, salarioBase, usuarioId }: Props) {
  const { activeClient } = useAuth();
  const { config: cfgDb, loading: loadingCfg } = useBeneficiosConfig(activeClient, companyId, employeeId);
  const { historico, loading: loadingHist, reload: reloadHist } = useBeneficiosHistorico(activeClient, companyId, employeeId);

  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);

  const [vtAtivo, setVtAtivo] = useState(true);
  const [vtValesPorDia, setVtValesPorDia] = useState(0);
  const [vtValorUnitario, setVtValorUnitario] = useState(0);
  const [vaAtivo, setVaAtivo] = useState(true);
  const [vaValorDia, setVaValorDia] = useState(0);
  const [regime, setRegime] = useState<RegimeTrabalho>("seg_sex");
  const [faltas, setFaltas] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (!cfgDb) return;
    setVtAtivo(cfgDb.vtAtivo);
    setVtValesPorDia(cfgDb.vtValesPorDia);
    setVtValorUnitario(cfgDb.vtValorUnitario);
    setVaAtivo(cfgDb.vaAtivo);
    setVaValorDia(cfgDb.vaValorDia);
    setRegime(cfgDb.regimeTrabalho);
  }, [cfgDb]);

  const { diasUteis, diasDetalhados } = useMemo(
    () => calcularDiasUteis(ano, mes, regime),
    [ano, mes, regime]
  );

  const diasConsiderados = Math.max(0, diasUteis - faltas);

  const resultado = useMemo(
    () =>
      calcularBeneficios({
        salarioBase,
        diasConsiderados,
        vtAtivo,
        vtValesPorDia,
        vtValorUnitario,
        vaAtivo,
        vaValorDia,
      }),
    [salarioBase, diasConsiderados, vtAtivo, vtValesPorDia, vtValorUnitario, vaAtivo, vaValorDia]
  );

  const competencia = `${ano}-${String(mes).padStart(2, "0")}`;
  const jaConfirmado = historico.some((h) => h.competencia === competencia && h.status === "confirmado");

  const handleSalvarConfig = async () => {
    setSalvando(true);
    const ok = await salvarBeneficiosConfig(activeClient, companyId, employeeId, {
      vtAtivo, vtValesPorDia, vtValorUnitario, vaAtivo, vaValorDia, regimeTrabalho: regime,
    });
    setSalvando(false);
    if (ok) toast.success("Configuração salva");
    else toast.error("Erro ao salvar configuração");
  };

  const handleConfirmar = async () => {
    setConfirmando(true);
    const res = await confirmarBeneficiosMes({
      client: activeClient,
      companyId, employeeId, employeeNome,
      competencia, diasUteis, diasFaltas: faltas, diasConsiderados,
      config: { vtAtivo, vtValesPorDia, vtValorUnitario, vaAtivo, vaValorDia, regimeTrabalho: regime },
      resultado, usuarioId,
    });
    setConfirmando(false);
    if (res.sucesso) {
      toast.success(`CPs gerados para ${competencia}`);
      reloadHist();
    } else {
      toast.error(res.erro || "Erro ao confirmar");
    }
  };

  const offset = new Date(ano, mes - 1, 1).getDay();

  if (loadingCfg) return <div className="p-8 text-center text-sm text-[#555]">Carregando configuração...</div>;

  return (
    <div className="space-y-6">
      {/* Seletor mês/ano + regime */}
      <div className="flex items-end gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className={LB}>Mês</label>
          <select value={mes} onChange={(e) => { setMes(Number(e.target.value)); setFaltas(0); }} className={IC_EDIT} style={{ width: 150 }}>
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={LB}>Ano</label>
          <input type="number" value={ano} onChange={(e) => { setAno(Number(e.target.value)); setFaltas(0); }} className={IC_EDIT} style={{ width: 90 }} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LB}>Regime</label>
          <select value={regime} onChange={(e) => setRegime(e.target.value as RegimeTrabalho)} className={IC_EDIT} style={{ width: 140 }}>
            {REGIMES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {/* Calendário */}
      <div className="border border-[#ccc] rounded-lg p-4">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#1a2e4a] mb-3">
          Calendário — {MESES[mes - 1]} {ano}
        </h4>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wider text-[#555] mb-1">
          {DIAS_SEMANA.map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
          {diasDetalhados.map((d) => (
            <div key={d.data} className={`rounded text-center text-[11px] py-1 ${diaClasse(d.tipo)}`}>
              {Number(d.data.split("-")[2])}
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-3 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#e6f4ec] border border-[#0a5c2e]" /> Útil</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#f5f5f5]" /> FDS</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#fdecea] border border-[#8b0000]" /> Feriado</span>
        </div>
      </div>

      {/* Config VT + VA */}
      <div className="grid grid-cols-2 gap-6">
        {/* VT */}
        <div className="border border-[#ccc] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#1a2e4a]">Vale Transporte</h4>
            <label className="flex items-center gap-2 text-[11px]">
              <input type="checkbox" checked={vtAtivo} onChange={(e) => setVtAtivo(e.target.checked)} />
              Ativo
            </label>
          </div>
          {vtAtivo && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className={LB}>Vales/dia</label>
                  <input type="number" min={0} value={vtValesPorDia} onChange={(e) => setVtValesPorDia(Number(e.target.value))} className={IC_EDIT} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={LB}>Valor unitário (R$)</label>
                  <input type="number" min={0} step={0.01} value={vtValorUnitario} onChange={(e) => setVtValorUnitario(Number(e.target.value))} className={IC_EDIT} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className={LB}>Valor diário VT</label>
                  <input readOnly value={formatBRL(vtValesPorDia * vtValorUnitario)} className={IC_RO} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={LB}>Desconto func. (6%)</label>
                  <input readOnly value={formatBRL(resultado.vtDescontoFunc)} className={IC_NEG} />
                </div>
              </div>
            </>
          )}
        </div>

        {/* VA */}
        <div className="border border-[#ccc] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#1a2e4a]">Vale Alimentação</h4>
            <label className="flex items-center gap-2 text-[11px]">
              <input type="checkbox" checked={vaAtivo} onChange={(e) => setVaAtivo(e.target.checked)} />
              Ativo
            </label>
          </div>
          {vaAtivo && (
            <div className="flex flex-col gap-1">
              <label className={LB}>Valor/dia (R$)</label>
              <input type="number" min={0} step={0.01} value={vaValorDia} onChange={(e) => setVaValorDia(Number(e.target.value))} className={IC_EDIT} />
            </div>
          )}
        </div>
      </div>

      {/* Salvar config */}
      <div className="flex justify-end">
        <button onClick={handleSalvarConfig} disabled={salvando}
          className="bg-[#1a2e4a] text-white text-[11px] font-bold uppercase tracking-wider px-5 py-2 rounded hover:bg-[#0f1e33] disabled:opacity-50 transition-all">
          {salvando ? "Salvando..." : "Salvar Configuração"}
        </button>
      </div>

      {/* Dias + Resumo */}
      <div className="grid grid-cols-[1fr_2fr] gap-6">
        <div className="border border-[#ccc] rounded-lg p-4 space-y-3">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#1a2e4a]">Dias do Mês</h4>
          <div className="flex flex-col gap-1">
            <label className={LB}>Dias úteis</label>
            <input readOnly value={diasUteis} className={IC_RO} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={LB}>Faltas</label>
            <input type="number" min={0} max={diasUteis} value={faltas}
              onChange={(e) => setFaltas(Math.min(diasUteis, Math.max(0, Number(e.target.value))))}
              className={IC_EDIT} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={LB}>Dias considerados</label>
            <input readOnly value={diasConsiderados} className={IC_RO} />
          </div>
        </div>

        <div className="border-2 border-[#1a2e4a] rounded-lg p-4">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#1a2e4a] mb-4">Resumo — {competencia}</h4>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[#555]">VT Bruto</span><span className="font-semibold">{formatBRL(resultado.vtBruto)}</span></div>
            <div className="flex justify-between"><span className="text-[#555]">VA Total</span><span className="font-semibold">{formatBRL(resultado.vaTotal)}</span></div>
            <div className="flex justify-between text-[#8b0000]"><span>(-) Desc. VT func.</span><span>{formatBRL(resultado.vtDescontoFunc)}</span></div>
            <div className="flex justify-between text-[#8b0000]"><span>(-) Desc. VA func.</span><span>{formatBRL(resultado.vaDescontoFunc)}</span></div>
            <div className="flex justify-between"><span className="text-[#555]">VT custo empresa</span><span className="font-bold">{formatBRL(resultado.vtCustoEmpresa)}</span></div>
            <div className="flex justify-between"><span className="text-[#555]">VA custo empresa</span><span className="font-bold">{formatBRL(resultado.vaCustoEmpresa)}</span></div>
          </div>
          <div className="border-t-2 border-[#1a2e4a] mt-4 pt-3 flex justify-between text-base">
            <span className="font-bold text-[#0a5c2e]">Total custo empresa</span>
            <span className="font-bold text-[#0a5c2e]">{formatBRL(resultado.totalCustoEmpresa)}</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-[#8b0000] font-bold">Total desconto funcionário</span>
            <span className="text-[#8b0000] font-bold">{formatBRL(resultado.totalDescontoFunc)}</span>
          </div>
        </div>
      </div>

      {/* Alerta CPs */}
      {resultado.totalCustoEmpresa > 0 && !jaConfirmado && (
        <div className="bg-[#fffbe6] border border-[#e6c300] rounded-lg p-4 text-sm space-y-1">
          <p className="font-bold text-[#8b6e00]">Ao confirmar, serão geradas as seguintes Contas a Pagar:</p>
          {resultado.vtCustoEmpresa > 0 && (
            <p className="text-[#8b6e00]">• VT {competencia} — {employeeNome}: <strong>{formatBRL(resultado.vtCustoEmpresa)}</strong></p>
          )}
          {resultado.vaCustoEmpresa > 0 && (
            <p className="text-[#8b6e00]">• VA {competencia} — {employeeNome}: <strong>{formatBRL(resultado.vaCustoEmpresa)}</strong></p>
          )}
        </div>
      )}

      {/* Botão confirmar */}
      <div className="flex justify-end">
        {jaConfirmado ? (
          <span className="text-[11px] font-bold text-[#0a5c2e] bg-[#e6f4ec] px-5 py-2 rounded border border-[#0a5c2e]">
            Competência {competencia} já confirmada
          </span>
        ) : (
          <button onClick={handleConfirmar}
            disabled={resultado.totalCustoEmpresa === 0 || confirmando}
            className="bg-[#0a5c2e] text-white text-[11px] font-bold uppercase tracking-wider px-5 py-2 rounded hover:bg-[#07401f] disabled:opacity-50 transition-all">
            {confirmando ? "Gerando CPs..." : "Confirmar e gerar CPs →"}
          </button>
        )}
      </div>

      {/* Histórico */}
      <div className="border border-[#ccc] rounded-lg p-4">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#1a2e4a] mb-3">Histórico de Lançamentos</h4>
        {loadingHist ? (
          <p className="text-sm text-[#555]">Carregando...</p>
        ) : historico.length === 0 ? (
          <p className="text-sm text-[#555]">Nenhum lançamento registrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[#ccc] text-[10px] font-bold uppercase tracking-wider text-[#555]">
                  <th className="text-left py-2 px-2">Competência</th>
                  <th className="text-right py-2 px-2">Dias</th>
                  <th className="text-right py-2 px-2">VT Bruto</th>
                  <th className="text-right py-2 px-2">VA Total</th>
                  <th className="text-right py-2 px-2">Custo Empresa</th>
                  <th className="text-right py-2 px-2">Desc. Func.</th>
                  <th className="text-center py-2 px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={h.id} className="border-b border-[#eee] hover:bg-[#f8f8f8]">
                    <td className="py-2 px-2 font-semibold">{h.competencia}</td>
                    <td className="py-2 px-2 text-right">{h.dias_considerados}</td>
                    <td className="py-2 px-2 text-right">{formatBRL(Number(h.vt_valor_bruto))}</td>
                    <td className="py-2 px-2 text-right">{formatBRL(Number(h.va_valor_total))}</td>
                    <td className="py-2 px-2 text-right font-bold text-[#0a5c2e]">{formatBRL(Number(h.total_custo_empresa))}</td>
                    <td className="py-2 px-2 text-right text-[#8b0000]">{formatBRL(Number(h.total_desconto_func))}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        h.status === "confirmado" ? "bg-[#e6f4ec] text-[#0a5c2e]" : h.status === "cancelado" ? "bg-[#fdecea] text-[#8b0000]" : "bg-[#f5f5f5] text-[#555]"
                      }`}>{h.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
