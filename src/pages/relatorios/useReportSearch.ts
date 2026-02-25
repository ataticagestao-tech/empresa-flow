import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { maskCNPJ, maskCPF, unmask } from "@/utils/masks";

export type ReportSearchSelection =
    | { kind: "client"; id: string; label: string; doc?: string | null; account?: string | null }
    | { kind: "supplier"; id: string; label: string; doc?: string | null; account?: string | null }
    | { kind: "product"; id: string; label: string; code?: string | null }
    | { kind: "term"; label: string };

export type ReportSearchResult =
    | {
        kind: "client";
        id: string;
        label: string;
        doc?: string | null;
        account?: string | null;
        meta?: string;
        value: string;
    }
    | {
        kind: "supplier";
        id: string;
        label: string;
        doc?: string | null;
        account?: string | null;
        meta?: string;
        value: string;
    }
    | {
        kind: "product";
        id: string;
        label: string;
        code?: string | null;
        meta?: string;
        value: string;
    }
    | {
        kind: "term";
        label: string;
        meta?: string;
        value: string;
    };

interface UseReportSearchParams {
    activeClient: any;
    selectedCompanyId?: string;
    isUsingSecondary: boolean;
}

const normalizeSearch = (value: unknown) =>
    String(value ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

const formatSelectionLabel = (selection: ReportSearchSelection) => {
    if (selection.kind === "term") {
        return selection.label;
    }

    if (selection.kind === "product") {
        return [selection.label, selection.code ? `(${selection.code})` : ""].filter(Boolean).join(" ");
    }

    const docDigits = unmask(String(selection.doc || ""));
    const docMasked = docDigits
        ? (docDigits.length > 11 ? maskCNPJ(docDigits) : maskCPF(docDigits))
        : "";
    const meta = [docMasked, selection.account].filter(Boolean).join(" • ");
    return [selection.label, meta ? `(${meta})` : ""].filter(Boolean).join(" ");
};

export function useReportSearch({ activeClient, selectedCompanyId, isUsingSecondary }: UseReportSearchParams) {
    const [resultsOpen, setResultsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedSearch, setSelectedSearch] = useState<ReportSearchSelection | null>(null);

    const selectedSearchKey = useMemo(() => {
        if (!selectedSearch) return null;
        if (selectedSearch.kind === "term") return `term:${selectedSearch.label}`;
        return `${selectedSearch.kind}:${selectedSearch.id}`;
    }, [selectedSearch]);

    const typedDigits = useMemo(() => unmask(searchTerm), [searchTerm]);
    const isDocOnlyInput = useMemo(() => {
        if (selectedSearch) return false;
        if (/[a-zA-Z]/.test(searchTerm)) return false;
        return typedDigits.length === 11 || typedDigits.length === 14;
    }, [searchTerm, selectedSearch, typedDigits.length]);

    const selectedSearchDisplay = useMemo(() => {
        if (!selectedSearch) return "";
        return formatSelectionLabel(selectedSearch);
    }, [selectedSearch]);

    const selectedSearchKindLabel = useMemo(() => {
        if (!selectedSearch) return "";
        if (selectedSearch.kind === "client") return "Cliente";
        if (selectedSearch.kind === "supplier") return "Fornecedor";
        if (selectedSearch.kind === "product") return "Produto";
        return "Texto";
    }, [selectedSearch]);

    const { data: globalSearchResults, isLoading: isSearching } = useQuery({
        queryKey: ["reports_search", selectedCompanyId, isUsingSecondary, searchTerm],
        queryFn: async () => {
            if (!selectedCompanyId) return [];
            const raw = searchTerm.replace(/[,()]/g, " ").trim();
            if (raw.length < 2) return [];

            const digits = unmask(raw);
            const isDocQuery = digits.length === 11 || digits.length === 14;
            const like = (v: string) => `%${v}%`;

            const [clientsRes, suppliersRes, productsRes] = await Promise.all([
                (activeClient as any)
                    .from("clients")
                    .select("id, razao_social, nome_fantasia, cpf_cnpj, dados_bancarios_conta, dados_bancarios_pix")
                    .eq("company_id", selectedCompanyId)
                    .or(
                        [
                            `razao_social.ilike.${like(raw)}`,
                            `nome_fantasia.ilike.${like(raw)}`,
                            `cpf_cnpj.ilike.${like(digits || raw)}`,
                            digits ? `dados_bancarios_conta.ilike.${like(digits)}` : null,
                            `dados_bancarios_pix.ilike.${like(raw)}`,
                        ]
                            .filter(Boolean)
                            .join(","),
                    )
                    .limit(8),
                (activeClient as any)
                    .from("suppliers")
                    .select("id, razao_social, nome_fantasia, cpf_cnpj, dados_bancarios_conta, dados_bancarios_pix")
                    .eq("company_id", selectedCompanyId)
                    .or(
                        [
                            `razao_social.ilike.${like(raw)}`,
                            `nome_fantasia.ilike.${like(raw)}`,
                            `cpf_cnpj.ilike.${like(digits || raw)}`,
                            digits ? `dados_bancarios_conta.ilike.${like(digits)}` : null,
                            `dados_bancarios_pix.ilike.${like(raw)}`,
                        ]
                            .filter(Boolean)
                            .join(","),
                    )
                    .limit(8),
                (activeClient as any)
                    .from("products")
                    .select("id, code, description")
                    .eq("company_id", selectedCompanyId)
                    .or([`description.ilike.${like(raw)}`, `code.ilike.${like(raw)}`].join(","))
                    .limit(8),
            ]);

            if (clientsRes.error) throw clientsRes.error;
            if (suppliersRes.error) throw suppliersRes.error;
            if (productsRes.error) throw productsRes.error;

            const clients = (clientsRes.data || []).map((c: any) => {
                const doc = String(c.cpf_cnpj || "");
                const masked = doc ? (doc.length > 11 ? maskCNPJ(doc) : maskCPF(doc)) : "";
                const account = String(c.dados_bancarios_conta || "");
                const label = c.nome_fantasia || c.razao_social;
                const meta = [masked, account, c.dados_bancarios_pix].filter(Boolean).join(" • ");
                return {
                    kind: "client" as const,
                    id: String(c.id),
                    label: String(label || "Cliente"),
                    doc: doc || null,
                    account: account || null,
                    meta: meta || "",
                    value: normalizeSearch([label, doc, masked, account, c.dados_bancarios_pix].filter(Boolean).join(" ")),
                };
            });

            const suppliers = (suppliersRes.data || []).map((s: any) => {
                const doc = String(s.cpf_cnpj || "");
                const masked = doc ? (doc.length > 11 ? maskCNPJ(doc) : maskCPF(doc)) : "";
                const account = String(s.dados_bancarios_conta || "");
                const label = s.nome_fantasia || s.razao_social;
                const meta = [masked, account, s.dados_bancarios_pix].filter(Boolean).join(" • ");
                return {
                    kind: "supplier" as const,
                    id: String(s.id),
                    label: String(label || "Fornecedor"),
                    doc: doc || null,
                    account: account || null,
                    meta: meta || "",
                    value: normalizeSearch([label, doc, masked, account, s.dados_bancarios_pix].filter(Boolean).join(" ")),
                };
            });

            const products = (productsRes.data || []).map((p: any) => {
                const label = String(p.description || "Produto");
                const code = p.code ? String(p.code) : "";
                return {
                    kind: "product" as const,
                    id: String(p.id),
                    label,
                    code: code || null,
                    meta: code ? `Código: ${code}` : "",
                    value: normalizeSearch([label, code].filter(Boolean).join(" ")),
                };
            });

            const term = {
                kind: "term" as const,
                label: raw,
                meta: "Buscar em descrições (AR/AP)",
                value: normalizeSearch(raw),
            };

            if (isDocQuery) {
                const isExactDoc = (item: any) => unmask(String(item.doc || "")) === digits;
                const exactClients = clients.filter(isExactDoc);
                const exactSuppliers = suppliers.filter(isExactDoc);
                const otherClients = clients.filter((c: any) => !isExactDoc(c));
                const otherSuppliers = suppliers.filter((s: any) => !isExactDoc(s));
                return [...exactClients, ...exactSuppliers, ...otherClients, ...otherSuppliers, ...products, term].slice(0, 25);
            }

            return [term, ...clients, ...suppliers, ...products].slice(0, 25);
        },
        enabled: !!selectedCompanyId && searchTerm.trim().length >= 2,
    });

    const lastAutoSelectedDocRef = useRef<string | null>(null);

    useEffect(() => {
        if (!isDocOnlyInput) return;
        if (isSearching) return;
        if (typedDigits === lastAutoSelectedDocRef.current) return;

        const matches = (globalSearchResults || []).filter(
            (r: any) =>
                (r.kind === "client" || r.kind === "supplier") &&
                unmask(String(r.doc || "")) === typedDigits,
        );

        if (matches.length !== 1) return;
        const match = matches[0] as ReportSearchResult;
        lastAutoSelectedDocRef.current = typedDigits;

        if (match.kind === "client" || match.kind === "supplier") {
            const nextSelected: ReportSearchSelection = {
                kind: match.kind,
                id: match.id,
                label: match.label,
                doc: match.doc ?? null,
                account: match.account ?? null,
            };
            setSelectedSearch(nextSelected);
            setSearchTerm(formatSelectionLabel(nextSelected));
            setResultsOpen(false);
        }
    }, [globalSearchResults, isDocOnlyInput, isSearching, typedDigits]);

    const clearSearchSelection = () => {
        setSelectedSearch(null);
        setSearchTerm("");
    };

    const handleSearchInputChange = (next: string) => {
        setSearchTerm(next);
        setResultsOpen(true);
        if (selectedSearch) setSelectedSearch(null);
    };

    const handleSelectSearchResult = (item: ReportSearchResult) => {
        if (item.kind === "term") {
            const nextSelected: ReportSearchSelection = { kind: "term", label: item.label };
            setSelectedSearch(nextSelected);
            setSearchTerm(nextSelected.label);
        } else if (item.kind === "client" || item.kind === "supplier") {
            const nextSelected: ReportSearchSelection = {
                kind: item.kind,
                id: item.id,
                label: item.label,
                doc: item.doc ?? null,
                account: item.account ?? null,
            };
            setSelectedSearch(nextSelected);
            setSearchTerm(formatSelectionLabel(nextSelected));
        } else {
            const nextSelected: ReportSearchSelection = {
                kind: "product",
                id: item.id,
                label: item.label,
                code: item.code ?? null,
            };
            setSelectedSearch(nextSelected);
            setSearchTerm(formatSelectionLabel(nextSelected));
        }

        setResultsOpen(false);
    };

    return {
        searchTerm,
        setSearchTerm,
        resultsOpen,
        setResultsOpen,
        selectedSearch,
        setSelectedSearch,
        selectedSearchKey,
        selectedSearchDisplay,
        selectedSearchKindLabel,
        globalSearchResults: (globalSearchResults || []) as ReportSearchResult[],
        isSearching,
        typedDigits,
        clearSearchSelection,
        handleSearchInputChange,
        handleSelectSearchResult,
    };
}
