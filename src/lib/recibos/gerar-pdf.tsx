import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  pdf,
  Svg,
  Path,
  Circle,
} from "@react-pdf/renderer";

export interface ReciboPDFData {
  numero: string;
  valor: number;
  favorecido: string;
  forma_pagamento?: string;
  categoria?: string;
  conta_bancaria?: string;
  data_pagamento: string;
  descricao: string;
  empresa_nome: string;
  empresa_cnpj?: string;
  cor_primaria?: string;
  rodape_texto?: string;
  tipo?: "payable" | "receivable";
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function makeStyles(cor: string) {
  return StyleSheet.create({
    page: {
      padding: 40,
      fontFamily: "Helvetica",
      fontSize: 10,
      color: "#1a1a1a",
      backgroundColor: "#ffffff",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 28,
      paddingBottom: 16,
      borderBottomWidth: 2,
      borderBottomColor: cor,
    },
    headerLeft: {
      flexDirection: "column",
    },
    empresaNome: {
      fontSize: 16,
      fontFamily: "Helvetica-Bold",
      color: cor,
      marginBottom: 2,
    },
    empresaCnpj: {
      fontSize: 8.5,
      color: "#888888",
      letterSpacing: 0.5,
    },
    headerRight: {
      alignItems: "flex-end",
    },
    tipoDoc: {
      fontSize: 9,
      fontFamily: "Helvetica-Bold",
      color: "#ffffff",
      backgroundColor: cor,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 4,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    numero: {
      fontSize: 8,
      color: "#999999",
      marginTop: 4,
    },
    statusBlock: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#f0fdf4",
      borderRadius: 8,
      padding: 16,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: "#bbf7d0",
    },
    checkCircle: {
      width: 36,
      height: 36,
      marginRight: 14,
    },
    statusTexts: {
      flexDirection: "column",
    },
    statusLabel: {
      fontSize: 9,
      color: "#16a34a",
      fontFamily: "Helvetica-Bold",
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 2,
    },
    statusValor: {
      fontSize: 22,
      fontFamily: "Helvetica-Bold",
      color: "#15803d",
    },
    section: {
      marginBottom: 20,
    },
    sectionTitle: {
      fontSize: 9,
      fontFamily: "Helvetica-Bold",
      color: cor,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 10,
      paddingBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: "#e5e7eb",
    },
    row: {
      flexDirection: "row",
      paddingVertical: 7,
      borderBottomWidth: 1,
      borderBottomColor: "#f3f4f6",
    },
    rowLabel: {
      width: "40%",
      fontSize: 9,
      color: "#6b7280",
    },
    rowValue: {
      width: "60%",
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: "#1a1a1a",
    },
    footer: {
      position: "absolute",
      bottom: 30,
      left: 40,
      right: 40,
      borderTopWidth: 1,
      borderTopColor: "#e5e7eb",
      paddingTop: 10,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    footerText: {
      fontSize: 7.5,
      color: "#9ca3af",
    },
    footerBrand: {
      fontSize: 7.5,
      color: cor,
      fontFamily: "Helvetica-Bold",
    },
  });
}

function CheckIcon() {
  return (
    <Svg width={36} height={36} viewBox="0 0 36 36">
      <Circle cx="18" cy="18" r="18" fill="#22c55e" />
      <Path d="M11 18l5 5 9-9" stroke="#ffffff" strokeWidth={2.5} fill="none" />
    </Svg>
  );
}

function ComprovantePDF({ data }: { data: ReciboPDFData }) {
  const cor = data.cor_primaria || "#0d1b2a";
  const s = makeStyles(cor);
  const tipoLabel = data.tipo === "receivable" ? "Comprovante de Recebimento" : "Comprovante de Pagamento";
  const statusLabel = data.tipo === "receivable" ? "VALOR RECEBIDO" : "VALOR PAGO";

  const rows: { label: string; value: string }[] = [
    { label: "Favorecido / Pagador", value: data.favorecido || "-" },
    { label: "Descricao", value: data.descricao },
    { label: "Data do Pagamento", value: data.data_pagamento },
    ...(data.categoria ? [{ label: "Categoria", value: data.categoria }] : []),
    ...(data.conta_bancaria ? [{ label: "Conta Bancaria", value: data.conta_bancaria }] : []),
    ...(data.forma_pagamento ? [{ label: "Forma de Pagamento", value: data.forma_pagamento }] : []),
  ];

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.empresaNome}>{data.empresa_nome}</Text>
            {data.empresa_cnpj && (
              <Text style={s.empresaCnpj}>CNPJ: {data.empresa_cnpj}</Text>
            )}
          </View>
          <View style={s.headerRight}>
            <Text style={s.tipoDoc}>{tipoLabel}</Text>
            <Text style={s.numero}>N.º {data.numero}</Text>
          </View>
        </View>

        {/* Status Block */}
        <View style={s.statusBlock}>
          <View style={s.checkCircle}>
            <CheckIcon />
          </View>
          <View style={s.statusTexts}>
            <Text style={s.statusLabel}>{statusLabel}</Text>
            <Text style={s.statusValor}>{fmt(data.valor)}</Text>
          </View>
        </View>

        {/* Details */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Detalhes</Text>
          {rows.map((r, i) => (
            <View style={s.row} key={i}>
              <Text style={s.rowLabel}>{r.label}</Text>
              <Text style={s.rowValue}>{r.value}</Text>
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            {data.rodape_texto || "Documento gerado automaticamente pelo sistema Tatica Gestao."}
          </Text>
          <Text style={s.footerBrand}>Tatica Gestao</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function gerarReciboPDF(data: ReciboPDFData): Promise<Blob> {
  const blob = await pdf(<ComprovantePDF data={data} />).toBlob();
  return blob;
}

export function downloadBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
