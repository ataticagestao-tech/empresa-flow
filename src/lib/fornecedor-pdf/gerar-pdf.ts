import jsPDF from "jspdf";

export interface RelatorioPagamentoFornecedor {
    competencia: string;
    descricao: string;
    valor: number;
    data_vencimento: string | null;
    data_pagamento: string | null;
    conta: string | null;
    categoria: string | null;
    status: string;
}

export interface RelatorioFornecedorData {
    empresa_nome: string;
    empresa_cnpj?: string | null;
    fornecedor: {
        razao_social: string;
        nome_fantasia: string | null;
        tipo_pessoa: string | null;
        cpf_cnpj: string | null;
        inscricao_estadual: string | null;
        email: string | null;
        telefone: string | null;
        celular: string | null;
        endereco: string | null;
        banco: string | null;
        agencia: string | null;
        conta: string | null;
        tipo_conta: string | null;
        pix: string | null;
        observacoes: string | null;
        tags: string[] | null;
        is_active: boolean;
    };
    pagamentos: RelatorioPagamentoFornecedor[];
    cor_primaria?: string;
}

const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const fmtData = (iso: string | null | undefined) => {
    if (!iso) return "—";
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00" : iso;
    const d = new Date(parsed);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

const fmtCompetencia = (c: string | null | undefined): string => {
    if (!c) return "—";
    if (/^\d{4}-\d{2}/.test(c)) {
        const [ano, mes] = c.slice(0, 7).split("-");
        return `${mes}/${ano}`;
    }
    return c;
};

const fmtDoc = (doc: string | null | undefined): string => {
    if (!doc) return "—";
    const d = doc.replace(/\D/g, "");
    if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
    return doc;
};

const tipoContaLabel = (v: string | null | undefined): string => {
    if (!v) return "—";
    const map: Record<string, string> = {
        corrente: "Corrente", poupanca: "Poupança", pix: "PIX",
    };
    return map[v] || v;
};

const statusLabel = (s: string): string => {
    const map: Record<string, string> = {
        pago: "Pago", aberto: "Em aberto", parcial: "Parcial",
        vencido: "Vencido", cancelado: "Cancelado",
    };
    return map[s] || s;
};

const statusColor = (s: string): [number, number, number] => {
    if (s === "pago") return [3, 152, 85];
    if (s === "vencido") return [229, 62, 62];
    if (s === "parcial") return [234, 88, 12];
    if (s === "cancelado") return [120, 120, 120];
    return [5, 150, 105];
};

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16),
    ];
}

export async function gerarRelatorioFornecedorPDF(data: RelatorioFornecedorData): Promise<Blob> {
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
        doc.text("RELATÓRIO DO FORNECEDOR", W - margin, 14, { align: "right" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(220, 230, 240);
        doc.text(`Emitido em ${new Date().toLocaleDateString("pt-BR")}`, W - margin, 20, { align: "right" });
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

    const drawKV = (label: string, value: string, opts?: { col?: 0 | 1 | 2; cols?: number }) => {
        const cols = opts?.cols || 1;
        if (cols === 1) {
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
        } else {
            const col = opts?.col ?? 0;
            const colW = contentW / cols;
            const x = margin + col * colW;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(110, 120, 130);
            doc.text(label, x, y);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.setTextColor(29, 41, 57);
            const lines = doc.splitTextToSize(value || "—", colW - 28);
            doc.text(lines, x + 28, y);
        }
    };

    const drawKVRow = (pairs: { label: string; value: string }[]) => {
        ensureSpace(6);
        pairs.forEach((p, i) => drawKV(p.label, p.value, { col: i as 0 | 1 | 2, cols: pairs.length as any }));
        y += 6;
    };

    drawHeader();
    y = 40;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(29, 41, 57);
    doc.text(data.fornecedor.razao_social, margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110, 120, 130);
    const subline = [
        data.fornecedor.nome_fantasia,
        data.fornecedor.tipo_pessoa === "PF" ? "Pessoa Física" : "Pessoa Jurídica",
        data.fornecedor.is_active ? "Ativo" : "Inativo",
    ].filter(Boolean).join("  ·  ");
    doc.text(subline, margin, y);
    y += 8;

    /* ── Dados Cadastrais ─────────────────────────────────── */
    drawSectionTitle("DADOS CADASTRAIS");
    drawKVRow([
        { label: "CPF/CNPJ", value: fmtDoc(data.fornecedor.cpf_cnpj) },
        { label: "Insc. Est.", value: data.fornecedor.inscricao_estadual || "—" },
    ]);
    drawKVRow([
        { label: "E-mail", value: data.fornecedor.email || "—" },
        { label: "Telefone", value: data.fornecedor.telefone || "—" },
        { label: "Celular", value: data.fornecedor.celular || "—" },
    ]);
    if (data.fornecedor.endereco) {
        drawKV("Endereço", data.fornecedor.endereco);
    }
    if (data.fornecedor.tags && data.fornecedor.tags.length > 0) {
        drawKV("Tags", data.fornecedor.tags.join(", "));
    }
    y += 2;

    /* ── Dados Bancários ──────────────────────────────────── */
    if (data.fornecedor.banco || data.fornecedor.pix) {
        drawSectionTitle("DADOS BANCÁRIOS");
        drawKVRow([
            { label: "Banco", value: data.fornecedor.banco || "—" },
            { label: "Agência", value: data.fornecedor.agencia || "—" },
            { label: "Conta", value: data.fornecedor.conta || "—" },
        ]);
        drawKVRow([
            { label: "Tipo Conta", value: tipoContaLabel(data.fornecedor.tipo_conta) },
            { label: "Chave PIX", value: data.fornecedor.pix || "—" },
        ]);
        y += 2;
    }

    /* ── Observações ──────────────────────────────────────── */
    if (data.fornecedor.observacoes) {
        drawSectionTitle("OBSERVAÇÕES");
        ensureSpace(8);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(29, 41, 57);
        const lines = doc.splitTextToSize(data.fornecedor.observacoes, contentW);
        doc.text(lines, margin, y);
        y += lines.length * 4.5 + 4;
    }

    /* ── Histórico de Pagamentos ──────────────────────────── */
    const totalPago = data.pagamentos
        .filter(p => p.status === "pago")
        .reduce((s, p) => s + (Number(p.valor) || 0), 0);
    const totalAberto = data.pagamentos
        .filter(p => p.status !== "pago" && p.status !== "cancelado")
        .reduce((s, p) => s + (Number(p.valor) || 0), 0);
    drawSectionTitle(`HISTÓRICO DE PAGAMENTOS (${data.pagamentos.length})  ·  Pago: ${fmt(totalPago)}  ·  Em aberto: ${fmt(totalAberto)}`);

    if (data.pagamentos.length === 0) {
        ensureSpace(6);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(150, 158, 170);
        doc.text("Nenhum pagamento registrado para este fornecedor.", margin, y);
        y += 6;
    } else {
        ensureSpace(8);
        doc.setFillColor(243, 244, 246);
        doc.rect(margin, y - 3, contentW, 6, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(80, 88, 100);
        doc.text("VENC.", margin + 2, y + 1);
        doc.text("DESCRIÇÃO", margin + 22, y + 1);
        doc.text("CATEGORIA", margin + 90, y + 1);
        doc.text("PAGO EM", margin + 125, y + 1);
        doc.text("STATUS", margin + 150, y + 1);
        doc.text("VALOR", margin + contentW - 2, y + 1, { align: "right" });
        y += 5;

        data.pagamentos.forEach((item, i) => {
            ensureSpace(7);
            if (i % 2 === 0) {
                doc.setFillColor(252, 252, 253);
                doc.rect(margin, y - 2, contentW, 6, "F");
            }
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(29, 41, 57);
            doc.text(fmtData(item.data_vencimento), margin + 2, y + 2);
            const desc = doc.splitTextToSize(item.descricao || "—", 65);
            doc.text(desc[0], margin + 22, y + 2);
            doc.setTextColor(80, 88, 100);
            const cat = doc.splitTextToSize(item.categoria || "—", 33);
            doc.text(cat[0], margin + 90, y + 2);
            doc.text(item.data_pagamento ? fmtData(item.data_pagamento) : "—", margin + 125, y + 2);
            const [r, g, b] = statusColor(item.status);
            doc.setTextColor(r, g, b);
            doc.setFont("helvetica", "bold");
            doc.text(statusLabel(item.status), margin + 150, y + 2);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(29, 41, 57);
            doc.text(fmt(item.valor), margin + contentW - 2, y + 2, { align: "right" });
            y += 6;
        });
    }

    /* ── Footer ──────────────────────────────────────────── */
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
}
