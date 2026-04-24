import jsPDF from "jspdf";

export interface FichaContratoParcela {
    numero: number;
    valor: number;
    valor_pago: number;
    data_vencimento: string | null;
    data_pagamento: string | null;
    status: string;
    tipo: "reserva" | "parcela";
}

export interface FichaContrato {
    descricao: string;
    procedimento: string | null;
    consultora: string | null;
    valor_total: number;
    total_pago: number;
    saldo: number;
    data_venda: string;
    previsao_cirurgia: string | null;
    forma_pagamento: string | null;
    status: string;
    parcelas: FichaContratoParcela[];
}

export interface FichaHistoricoItem {
    descricao: string;
    data_vencimento: string | null;
    data_pagamento: string | null;
    valor: number;
    valor_pago: number;
    status: string;
    forma_recebimento: string | null;
    categoria: string | null;
}

export interface FichaClienteData {
    empresa_nome: string;
    empresa_cnpj?: string;
    paciente_nome: string;
    paciente_cpf_cnpj: string | null;
    paciente_email: string | null;
    paciente_telefone: string | null;
    total_comprado: number;
    em_aberto: number;
    ultima_compra: string | null;
    contratos_ativos: FichaContrato[];
    negociacoes: FichaContrato[];
    historico: FichaHistoricoItem[];
    cor_primaria?: string;
}

const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtData = (iso: string | null | undefined) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

const formaLabel = (v: string | null | undefined): string => {
    if (!v) return "—";
    const map: Record<string, string> = {
        cartao_credito: "Cartão de crédito",
        cartao_debito: "Cartão de débito",
        pix: "PIX",
        boleto: "Boleto",
        dinheiro: "Dinheiro",
        transferencia: "Transferência",
        parcelado: "Parcelado",
        misto: "Misto",
        reserva: "Reserva de data",
    };
    return map[v] || v;
};

const statusLabel = (cr: { status: string; forma_recebimento?: string | null; data_vencimento?: string | null }): string => {
    if (cr.status === "pago") return "Pago";
    if (cr.status === "cancelado") return "Cancelado";
    if (cr.forma_recebimento === "cartao_credito" || cr.forma_recebimento === "cartao_debito") return "Pago";
    if (cr.status === "parcial") return "Parcial";
    if (cr.status === "vencido") return "Vencido";
    if (cr.data_vencimento && new Date(cr.data_vencimento) < new Date()) return "Vencido";
    return "Aberto";
};

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16),
    ];
}

export async function gerarFichaClientePDF(data: FichaClienteData): Promise<Blob> {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const cor = data.cor_primaria || "#059669";
    const [cr, cg, cb] = hexToRgb(cor);
    const W = 210;
    const H = 297;
    const margin = 18;
    const contentW = W - margin * 2;
    let y = 0;

    const ensureSpace = (needed: number) => {
        if (y + needed > H - 18) {
            doc.addPage();
            y = margin;
        }
    };

    const drawHeader = () => {
        doc.setFillColor(cr, cg, cb);
        doc.rect(0, 0, W, 30, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(255, 255, 255);
        doc.text(data.empresa_nome, margin, 14);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(220, 230, 240);
        if (data.empresa_cnpj) doc.text(`CNPJ: ${data.empresa_cnpj}`, margin, 20);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text("FICHA DO CLIENTE", W - margin, 14, { align: "right" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(220, 230, 240);
        doc.text(`Emitida em ${new Date().toLocaleDateString("pt-BR")}`, W - margin, 20, { align: "right" });
    };

    const drawSectionTitle = (title: string) => {
        ensureSpace(12);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(cr, cg, cb);
        doc.text(title, margin, y);
        y += 2;
        doc.setDrawColor(cr, cg, cb);
        doc.setLineWidth(0.4);
        doc.line(margin, y, margin + contentW, y);
        y += 6;
    };

    const drawKV = (label: string, value: string) => {
        ensureSpace(6);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(110, 120, 130);
        doc.text(label, margin, y);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(29, 41, 57);
        const lines = doc.splitTextToSize(value || "—", contentW - 40);
        doc.text(lines, margin + 40, y);
        y += Math.max(5, lines.length * 4.5);
    };

    /* ── Page 1: Header + Paciente ─────────────────────────── */
    drawHeader();
    y = 40;

    // Nome em destaque
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(29, 41, 57);
    doc.text(data.paciente_nome, margin, y);
    y += 8;

    drawKV("CPF/CNPJ", data.paciente_cpf_cnpj || "—");
    drawKV("E-mail", data.paciente_email || "—");
    drawKV("Telefone", data.paciente_telefone || "—");
    y += 2;

    // KPIs
    drawSectionTitle("RESUMO FINANCEIRO");
    const kpiW = (contentW - 6) / 3;
    const kpiY = y;
    const kpis: { label: string; value: string; color?: [number, number, number] }[] = [
        { label: "Total comprado", value: fmt(data.total_comprado) },
        {
            label: "Em aberto",
            value: fmt(data.em_aberto),
            color: data.em_aberto > 0 ? [229, 62, 62] : [3, 152, 85],
        },
        { label: "Última compra", value: fmtData(data.ultima_compra) },
    ];
    kpis.forEach((k, i) => {
        const x = margin + i * (kpiW + 3);
        doc.setFillColor(249, 250, 251);
        doc.roundedRect(x, kpiY, kpiW, 18, 2, 2, "F");
        doc.setDrawColor(234, 236, 240);
        doc.roundedRect(x, kpiY, kpiW, 18, 2, 2, "S");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(120, 128, 140);
        doc.text(k.label.toUpperCase(), x + 3, kpiY + 5);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        const [r, g, b] = k.color || [29, 41, 57];
        doc.setTextColor(r, g, b);
        doc.text(k.value, x + 3, kpiY + 13);
    });
    y = kpiY + 22;

    /* ── Contratos ativos ──────────────────────────────────── */
    if (data.contratos_ativos.length > 0) {
        drawSectionTitle(`CONTRATOS ATIVOS (${data.contratos_ativos.length})`);
        data.contratos_ativos.forEach((c) => desenharContrato(doc, c));
    }

    /* ── Negociações ───────────────────────────────────────── */
    if (data.negociacoes.length > 0) {
        drawSectionTitle(`NEGOCIAÇÕES (${data.negociacoes.length})`);
        data.negociacoes.forEach((c) => desenharContrato(doc, c));
    }

    /* ── Histórico financeiro ──────────────────────────────── */
    drawSectionTitle(`HISTÓRICO FINANCEIRO (${data.historico.length})`);
    if (data.historico.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(150, 158, 170);
        doc.text("Nenhum lançamento registrado.", margin, y);
        y += 6;
    } else {
        // Cabeçalho da tabela
        ensureSpace(8);
        doc.setFillColor(243, 244, 246);
        doc.rect(margin, y - 3, contentW, 6, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(80, 88, 100);
        doc.text("DESCRIÇÃO", margin + 2, y + 1);
        doc.text("VENCIMENTO", margin + 85, y + 1);
        doc.text("FORMA", margin + 115, y + 1);
        doc.text("STATUS", margin + 145, y + 1);
        doc.text("VALOR", margin + contentW - 2, y + 1, { align: "right" });
        y += 5;

        data.historico.forEach((item, i) => {
            ensureSpace(7);
            if (i % 2 === 0) {
                doc.setFillColor(252, 252, 253);
                doc.rect(margin, y - 2, contentW, 6, "F");
            }
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(29, 41, 57);
            const desc = doc.splitTextToSize(item.descricao || "—", 80);
            doc.text(desc[0], margin + 2, y + 2);
            doc.setTextColor(80, 88, 100);
            doc.text(fmtData(item.data_vencimento), margin + 85, y + 2);
            doc.text(formaLabel(item.forma_recebimento).substring(0, 14), margin + 115, y + 2);
            const status = statusLabel(item);
            const statusColor: [number, number, number] =
                status === "Pago" ? [3, 152, 85]
                : status === "Vencido" ? [229, 62, 62]
                : status === "Parcial" ? [234, 88, 12]
                : status === "Cancelado" ? [120, 120, 120]
                : [5, 150, 105];
            doc.setTextColor(...statusColor);
            doc.setFont("helvetica", "bold");
            doc.text(status, margin + 145, y + 2);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(29, 41, 57);
            doc.text(fmt(item.valor), margin + contentW - 2, y + 2, { align: "right" });
            y += 6;
        });
    }

    /* ── Footer em todas as páginas ─────────────────────────── */
    const pageCount = (doc.internal as any).getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        const fy = H - 10;
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.3);
        doc.line(margin, fy - 3, margin + contentW, fy - 3);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(156, 163, 175);
        doc.text(`Documento gerado pelo sistema Tatica Gestão.`, margin, fy);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(cr, cg, cb);
        doc.text(`Página ${p} de ${pageCount}`, W - margin, fy, { align: "right" });
    }

    return doc.output("blob");

    /* ── Helper: desenha um contrato ────────────────────────── */
    function desenharContrato(_doc: jsPDF, c: FichaContrato) {
        const pagas = c.parcelas.filter((p) => p.status === "pago").length;
        const total = c.parcelas.length;
        const progresso = c.valor_total > 0 ? Math.min(100, (c.total_pago / c.valor_total) * 100) : 0;

        ensureSpace(30);
        const boxY = y;
        const boxH = 26;

        doc.setFillColor(249, 250, 251);
        doc.roundedRect(margin, boxY, contentW, boxH, 2, 2, "F");
        doc.setDrawColor(229, 231, 235);
        doc.roundedRect(margin, boxY, contentW, boxH, 2, 2, "S");

        // Título contrato
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(29, 41, 57);
        const titulo = c.procedimento || c.descricao || "Contrato";
        doc.text(titulo, margin + 3, boxY + 6);

        // Info linha 1
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(110, 120, 130);
        const info1: string[] = [];
        info1.push(`Venda ${fmtData(c.data_venda)}`);
        if (c.previsao_cirurgia) info1.push(`Cirurgia ${fmtData(c.previsao_cirurgia)}`);
        if (c.consultora) info1.push(`Consultora: ${c.consultora}`);
        info1.push(`Pagamento: ${formaLabel(c.forma_pagamento)}`);
        doc.text(info1.join(" · "), margin + 3, boxY + 11);

        // Valores à direita
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(29, 41, 57);
        doc.text(fmt(c.valor_total), margin + contentW - 3, boxY + 7, { align: "right" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(3, 152, 85);
        doc.text(`Pago: ${fmt(c.total_pago)}`, margin + contentW - 3, boxY + 12, { align: "right" });
        if (c.saldo > 0) {
            doc.setTextColor(229, 62, 62);
            doc.text(`Saldo: ${fmt(c.saldo)}`, margin + contentW - 3, boxY + 16, { align: "right" });
        }

        // Barra de progresso
        const barX = margin + 3;
        const barY = boxY + 18;
        const barW = contentW - 6;
        doc.setFillColor(229, 231, 235);
        doc.roundedRect(barX, barY, barW, 2.5, 1, 1, "F");
        if (progresso > 0) {
            doc.setFillColor(cr, cg, cb);
            doc.roundedRect(barX, barY, barW * (progresso / 100), 2.5, 1, 1, "F");
        }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(110, 120, 130);
        doc.text(`${pagas}/${total} parcelas · ${progresso.toFixed(0)}% quitado`, barX, boxY + 24);

        y = boxY + boxH + 3;

        // Tabela de parcelas
        if (c.parcelas.length > 0) {
            ensureSpace(6);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(7);
            doc.setTextColor(110, 120, 130);
            doc.text("#", margin + 3, y);
            doc.text("TIPO", margin + 10, y);
            doc.text("VENCIMENTO", margin + 30, y);
            doc.text("STATUS", margin + 65, y);
            doc.text("PAGO", margin + 95, y);
            doc.text("VALOR", margin + contentW - 3, y, { align: "right" });
            y += 3;
            doc.setDrawColor(234, 236, 240);
            doc.setLineWidth(0.2);
            doc.line(margin + 3, y, margin + contentW - 3, y);
            y += 3;

            c.parcelas.forEach((p) => {
                ensureSpace(5);
                doc.setFont("helvetica", "normal");
                doc.setFontSize(8);
                doc.setTextColor(29, 41, 57);
                doc.text(String(p.numero), margin + 3, y);
                doc.setTextColor(110, 120, 130);
                doc.text(p.tipo === "reserva" ? "Reserva" : "Parcela", margin + 10, y);
                doc.text(fmtData(p.data_vencimento), margin + 30, y);
                const st = statusLabel(p);
                const stColor: [number, number, number] =
                    st === "Pago" ? [3, 152, 85]
                    : st === "Vencido" ? [229, 62, 62]
                    : st === "Parcial" ? [234, 88, 12]
                    : [5, 150, 105];
                doc.setTextColor(...stColor);
                doc.setFont("helvetica", "bold");
                doc.text(st, margin + 65, y);
                doc.setFont("helvetica", "normal");
                doc.setTextColor(110, 120, 130);
                doc.text(fmt(p.valor_pago), margin + 95, y);
                doc.setFont("helvetica", "bold");
                doc.setTextColor(29, 41, 57);
                doc.text(fmt(p.valor), margin + contentW - 3, y, { align: "right" });
                y += 4.5;
            });
            y += 2;
        }

        y += 2;
    }
}

export function downloadFichaPDF(blob: Blob, nomeCliente: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safe = nomeCliente.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_");
    a.download = `ficha_${safe}_${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
