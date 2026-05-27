import jsPDF from "jspdf";

export interface ColunaLista {
    /** Cabeçalho exibido na tabela */
    header: string;
    /** Largura relativa da coluna (peso). As larguras são distribuídas proporcionalmente. */
    flex: number;
    /** Alinhamento do conteúdo da célula */
    align?: "left" | "right" | "center";
}

export interface RelatorioListaData {
    empresa_nome: string;
    empresa_cnpj?: string | null;
    /** Título do relatório, ex.: "FUNCIONÁRIOS" */
    titulo: string;
    /** Subtítulo opcional exibido abaixo do título da empresa */
    subtitulo?: string;
    colunas: ColunaLista[];
    /** Cada linha é um array de strings com o mesmo tamanho de `colunas` */
    linhas: string[][];
    cor_primaria?: string;
}

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16),
    ];
}

/**
 * Gera um relatório tabular (paisagem A4) listando todos os cadastros.
 * Reutilizado por Funcionários, Clientes e Fornecedores.
 */
export function gerarRelatorioListaPDF(data: RelatorioListaData): Blob {
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    const cor = data.cor_primaria || "#059669";
    const [cr, cg, cb] = hexToRgb(cor);
    const W = 297;
    const H = 210;
    const margin = 12;
    const contentW = W - margin * 2;

    // Distribui a largura proporcionalmente ao peso de cada coluna.
    const totalFlex = data.colunas.reduce((s, c) => s + c.flex, 0) || 1;
    const colW = data.colunas.map(c => (c.flex / totalFlex) * contentW);
    const colX: number[] = [];
    let acc = margin;
    for (const w of colW) {
        colX.push(acc);
        acc += w;
    }

    const rowH = 6;
    const headerBandH = 26;
    const tableTop = headerBandH + 10;
    const bottomLimit = H - 12;

    let y = 0;

    const drawHeader = () => {
        doc.setFillColor(cr, cg, cb);
        doc.rect(0, 0, W, headerBandH, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.setTextColor(255, 255, 255);
        doc.text(data.empresa_nome, margin, 12);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(225, 235, 240);
        const subParts = [
            data.empresa_cnpj ? `CNPJ: ${data.empresa_cnpj}` : null,
            data.subtitulo || null,
        ].filter(Boolean);
        if (subParts.length) doc.text(subParts.join("   ·   "), margin, 18);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(255, 255, 255);
        doc.text(data.titulo, W - margin, 12, { align: "right" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(225, 235, 240);
        doc.text(
            `${data.linhas.length} ${data.linhas.length === 1 ? "registro" : "registros"}  ·  Emitido em ${new Date().toLocaleDateString("pt-BR")}`,
            W - margin, 18, { align: "right" },
        );
    };

    const drawColumnHeaders = () => {
        doc.setFillColor(243, 244, 246);
        doc.rect(margin, y - 4, contentW, 7, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(80, 88, 100);
        data.colunas.forEach((c, i) => {
            const pad = 2;
            const x = c.align === "right" ? colX[i] + colW[i] - pad
                : c.align === "center" ? colX[i] + colW[i] / 2
                : colX[i] + pad;
            doc.text(c.header.toUpperCase(), x, y, { align: c.align || "left" });
        });
        y += 5;
        doc.setDrawColor(cr, cg, cb);
        doc.setLineWidth(0.3);
        doc.line(margin, y - 1.5, margin + contentW, y - 1.5);
    };

    const startPage = (first: boolean) => {
        if (!first) doc.addPage();
        drawHeader();
        y = tableTop;
        drawColumnHeaders();
    };

    /* ── Render ─────────────────────────── */
    startPage(true);

    if (data.linhas.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(150, 158, 170);
        doc.text("Nenhum registro cadastrado.", margin, y + 4);
    } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        data.linhas.forEach((linha, ri) => {
            if (y + rowH > bottomLimit) {
                startPage(false);
            }
            if (ri % 2 === 0) {
                doc.setFillColor(252, 252, 253);
                doc.rect(margin, y - 2, contentW, rowH, "F");
            }
            doc.setTextColor(29, 41, 57);
            data.colunas.forEach((c, ci) => {
                const pad = 2;
                const cell = linha[ci] ?? "";
                const maxW = colW[ci] - pad * 2;
                const lines = doc.splitTextToSize(cell || "—", maxW);
                let text = lines[0] || "—";
                if (lines.length > 1) {
                    // trunca com reticências preservando largura
                    while (text.length > 1 && doc.getTextWidth(text + "…") > maxW) {
                        text = text.slice(0, -1);
                    }
                    text = text.trimEnd() + "…";
                }
                const x = c.align === "right" ? colX[ci] + colW[ci] - pad
                    : c.align === "center" ? colX[ci] + colW[ci] / 2
                    : colX[ci] + pad;
                doc.text(text, x, y + 2, { align: c.align || "left" });
            });
            y += rowH;
        });
    }

    /* ── Footer em todas as páginas ─────────────────────────── */
    const pageCount = (doc.internal as any).getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        const fy = H - 7;
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.3);
        doc.line(margin, fy - 3, margin + contentW, fy - 3);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(156, 163, 175);
        doc.text("Documento gerado pelo sistema Tatica Gestão.", margin, fy);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(cr, cg, cb);
        doc.text(`Página ${p} de ${pageCount}`, W - margin, fy, { align: "right" });
    }

    return doc.output("blob");
}

/** Helper de download reutilizável pelas páginas. */
export function downloadListaPDF(blob: Blob, baseName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safe = baseName.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase();
    a.download = `${safe}-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
