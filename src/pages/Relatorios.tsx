import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReportSearch } from "@/pages/relatorios/useReportSearch";
import { ArapOverview } from "@/pages/relatorios/ArapOverview";
import { ReportSearchInput } from "@/pages/relatorios/ReportSearchInput";
import { ReportPeriodOverview } from "@/pages/relatorios/ReportPeriodOverview";
import { DfcOverview } from "@/pages/relatorios/DfcOverview";
import { TopCategoriesOverview } from "@/pages/relatorios/TopCategoriesOverview";
import { useRelatoriosData } from "@/pages/relatorios/useRelatoriosData";
import { useRelatoriosPageState } from "@/pages/relatorios/useRelatoriosPageState";
import { useRelatoriosRealtime } from "@/pages/relatorios/useRelatoriosRealtime";

export default function Relatorios() {
    const { selectedCompany } = useCompany();
    const { activeClient, isUsingSecondary } = useAuth();
    const queryClient = useQueryClient();

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

    const {
        searchTerm,
        resultsOpen,
        selectedSearch,
        setSelectedSearch,
        setResultsOpen,
        selectedSearchKey,
        selectedSearchDisplay,
        selectedSearchKindLabel,
        globalSearchResults,
        isSearching,
        typedDigits,
        clearSearchSelection,
        handleSearchInputChange,
        handleSelectSearchResult,
    } = useReportSearch({
        activeClient,
        selectedCompanyId: selectedCompany?.id,
        isUsingSecondary,
    });
    const { dateRange, setDateRange } = useRelatoriosPageState({
        selectedSearch,
        setSelectedSearch,
    });

    useRelatoriosRealtime({
        activeClient,
        queryClient,
        selectedCompanyId: selectedCompany?.id,
        isUsingSecondary,
    });

    const {
        isLoading,
        isLoadingArap,
        arapSummary,
        arapBucketed,
        summary,
        bucketed,
        cashflowBucketed,
        topCategories,
        dfcSummary,
        isLoadingDfcSummary,
    } = useRelatoriosData({
        activeClient,
        selectedCompanyId: selectedCompany?.id,
        isUsingSecondary,
        dateRange,
        selectedSearch,
        selectedSearchKey,
    });

    return (
        <AppLayout title="Relatórios">
            <div className="space-y-6 animate-fade-in">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <h2 className="text-3xl font-bold tracking-tight">Relatórios</h2>
                    <div className="flex flex-wrap items-center gap-2">
                        <Input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
                            className="h-9 w-40"
                        />
                        <span className="text-muted-foreground">a</span>
                        <Input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
                            className="h-9 w-40"
                        />
                    </div>
                </div>

                <Card>
                    <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <CardTitle>Busca avançada</CardTitle>
                        {selectedSearch && (
                            <Button
                                variant="ghost"
                                className="h-8 w-fit px-2 text-muted-foreground hover:text-foreground"
                                onClick={clearSearchSelection}
                            >
                                <X className="h-4 w-4 mr-2" />
                                Limpar
                            </Button>
                        )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <ReportSearchInput
                            searchTerm={searchTerm}
                            onSearchChange={handleSearchInputChange}
                            resultsOpen={resultsOpen}
                            setResultsOpen={setResultsOpen}
                            isSearching={isSearching}
                            globalSearchResults={globalSearchResults}
                            selectedSearchKey={selectedSearchKey}
                            onSelectResult={handleSelectSearchResult}
                        />

                        <ArapOverview
                            selectedSearch={selectedSearch}
                            selectedSearchDisplay={selectedSearchDisplay}
                            selectedSearchKindLabel={selectedSearchKindLabel}
                            isLoadingArap={isLoadingArap}
                            arapSummary={arapSummary}
                            arapBucketed={arapBucketed}
                            typedDigits={typedDigits}
                            formatCurrency={formatCurrency}
                        />
                    </CardContent>
                </Card>

                <ReportPeriodOverview
                    summary={summary}
                    bucketed={bucketed}
                    formatCurrency={formatCurrency}
                />

                <DfcOverview
                    isLoadingDfcSummary={isLoadingDfcSummary}
                    dfcSummary={dfcSummary}
                    summaryNet={summary.net}
                    cashflowBucketed={cashflowBucketed}
                    formatCurrency={formatCurrency}
                />

                <TopCategoriesOverview
                    topCategories={topCategories}
                    formatCurrency={formatCurrency}
                />

                {isLoading && (
                    <div className="text-center py-8 text-muted-foreground">
                        Carregando dados do relatório...
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
