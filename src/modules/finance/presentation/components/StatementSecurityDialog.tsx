import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, XCircle, MinusCircle, Ban } from "lucide-react";
import type { StatementSecurityReport, StatementCheck, StatementSource } from "../../application/statementSecurity";

interface StatementSecurityDialogProps {
    open: boolean;
    onClose: () => void;
    report: StatementSecurityReport | null;
    source: StatementSource | null;
    bankAccountName?: string;
    onConfirm: () => void;
    confirming?: boolean;
}

const sourceLabel: Record<StatementSource, string> = {
    ofx: 'OFX',
    pdf: 'PDF',
    excel: 'Excel',
    credit_card_pdf: 'Fatura de cartão',
};

function CheckIcon({ status }: { status: StatementCheck['status'] }) {
    if (status === 'ok') return <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />;
    if (status === 'warn') return <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />;
    if (status === 'block') return <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />;
    return <MinusCircle className="h-4 w-4 text-[#98A2B3] shrink-0 mt-0.5" />;
}

// Veredito em linguagem simples a partir do primeiro problema/atenção.
function buildVerdict(report: StatementSecurityReport) {
    const block = report.checks.find((c) => c.status === 'block');
    if (block) {
        if (block.id === 'account') {
            return { tone: 'block' as const, title: 'Esse extrato é de outra conta', sub: 'Importação bloqueada para não misturar o movimento das contas. Abra a conta certa e importe por lá.' };
        }
        if (block.id === 'gap') {
            return { tone: 'block' as const, title: 'Tem um período faltando', sub: 'Este extrato pula um intervalo desde a última importação. Importe o período que está faltando primeiro.' };
        }
        if (block.id === 'duplicate') {
            return { tone: 'block' as const, title: 'Esse extrato já foi importado', sub: 'Todas as transações deste período já estão na conta — não há nada novo para lançar.' };
        }
        return { tone: 'block' as const, title: 'Não dá pra importar este extrato', sub: 'Há um problema que impede a importação. Veja abaixo.' };
    }
    const warnCount = report.checks.filter((c) => c.status === 'warn').length;
    return {
        tone: 'warn' as const,
        title: 'Confira antes de importar',
        sub: warnCount === 1
            ? 'Encontramos 1 ponto de atenção. Revise e, se estiver tudo certo, importe mesmo assim.'
            : `Encontramos ${warnCount} pontos de atenção. Revise e, se estiver tudo certo, importe mesmo assim.`,
    };
}

export function StatementSecurityDialog({
    open,
    onClose,
    report,
    source,
    bankAccountName,
    onConfirm,
    onSwitchAccount,
    confirming,
}: StatementSecurityDialogProps) {
    if (!report) return null;

    const { hardBlock, checks } = report;
    const verdict = buildVerdict(report);
    const txWord = report.total === 1 ? 'transação' : 'transações';

    const problems = checks.filter((c) => c.status === 'block');
    const warnings = checks.filter((c) => c.status === 'warn');
    const passed = checks.filter((c) => c.status === 'ok' || c.status === 'skip');

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="sm:max-w-[540px]">
                <DialogHeader>
                    <DialogTitle className="text-[15px]">Verificação do extrato</DialogTitle>
                </DialogHeader>

                <div className="space-y-3.5 py-1">
                    {/* Veredito — o que aconteceu e o que fazer, em 1 olhada */}
                    <div className={`rounded-xl p-3.5 flex items-start gap-3 ${verdict.tone === 'block' ? 'bg-red-50 border border-red-100' : 'bg-amber-50 border border-amber-100'}`}>
                        {verdict.tone === 'block'
                            ? <Ban className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                            : <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />}
                        <div className="min-w-0">
                            <p className={`text-[14px] font-bold ${verdict.tone === 'block' ? 'text-red-800' : 'text-amber-900'}`}>{verdict.title}</p>
                            <p className={`text-[12.5px] leading-snug mt-0.5 ${verdict.tone === 'block' ? 'text-red-700' : 'text-amber-800'}`}>{verdict.sub}</p>
                        </div>
                    </div>

                    <div className="text-[11.5px] text-[#98A2B3]">
                        {source ? sourceLabel[source] : 'Extrato'}{bankAccountName ? ` · ${bankAccountName}` : ''} · {report.total} {txWord}
                    </div>

                    {/* Problemas (bloqueiam) e atenções (confirmáveis) em destaque */}
                    {(problems.length > 0 || warnings.length > 0) && (
                        <div className="rounded-lg border border-[#EAECF0] overflow-hidden divide-y divide-[#EAECF0]">
                            {[...problems, ...warnings].map((c) => (
                                <div key={c.id} className={`px-3 py-2.5 flex items-start gap-2.5 ${c.status === 'block' ? 'bg-red-50' : 'bg-amber-50'}`}>
                                    <CheckIcon status={c.status} />
                                    <div className="min-w-0">
                                        <div className="text-[12.5px] font-semibold text-[#1D2939]">{c.label}</div>
                                        <div className="text-[11.5px] text-[#555] leading-snug">{c.detail}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* O que passou — discreto, só pra dar confiança */}
                    {passed.length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1.5 px-0.5">
                            {passed.map((c) => (
                                <span key={c.id} className="inline-flex items-center gap-1 text-[11px] text-[#667085]">
                                    <CheckIcon status={c.status} />
                                    {c.label}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose} disabled={confirming}>
                        {hardBlock ? 'Fechar' : 'Cancelar'}
                    </Button>
                    {!hardBlock && (
                        <Button onClick={onConfirm} disabled={confirming} className="bg-emerald-600 hover:bg-emerald-700">
                            {confirming ? 'Importando...' : 'Importar mesmo assim'}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
