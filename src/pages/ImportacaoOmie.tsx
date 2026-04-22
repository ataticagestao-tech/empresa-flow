import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useCompany } from "@/contexts/CompanyContext";
import { supabaseTatica } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ImportResults {
  categories: { imported: number; errors: number };
  clients: { imported: number; errors: number };
  suppliers: { imported: number; errors: number };
  accountsPayable: { imported: number; errors: number };
  accountsReceivable: { imported: number; errors: number };
}

export default function ImportacaoOmie() {
  const { selectedCompany } = useCompany();
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ImportResults | null>(null);

  const [files, setFiles] = useState({
    categories: null as File | null,
    clientsSuppliers: null as File | null,
    accountsPayable: null as File | null,
    accountsReceivable: null as File | null,
  });

  const handleFileChange = (type: keyof typeof files) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setFiles(prev => ({ ...prev, [type]: file }));
  };

  const readFileContent = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, 'UTF-8');
    });
  };

  const parseCSV = (content: string, delimiter: string = ';'): string[][] => {
    const lines: string[][] = [];
    let currentLine: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const nextChar = content[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        currentLine.push(currentField.trim());
        currentField = '';
      } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !inQuotes) {
        currentLine.push(currentField.trim());
        if (currentLine.some(f => f.length > 0)) {
          lines.push(currentLine);
        }
        currentLine = [];
        currentField = '';
        if (char === '\r') i++;
      } else if (char !== '\r') {
        currentField += char;
      }
    }

    if (currentField.length > 0 || currentLine.length > 0) {
      currentLine.push(currentField.trim());
      if (currentLine.some(f => f.length > 0)) {
        lines.push(currentLine);
      }
    }

    return lines;
  };

  const chunkArray = <T,>(array: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  };

  const handleImport = async () => {
    if (!selectedCompany?.id) {
      toast.error("Selecione uma empresa para importar os dados");
      return;
    }

    const hasAnyFile = Object.values(files).some(f => f !== null);
    if (!hasAnyFile) {
      toast.error("Selecione pelo menos um arquivo para importar");
      return;
    }

    setIsImporting(true);
    setProgress(0);
    setResults({
      categories: { imported: 0, errors: 0 },
      clients: { imported: 0, errors: 0 },
      suppliers: { imported: 0, errors: 0 },
      accountsPayable: { imported: 0, errors: 0 },
      accountsReceivable: { imported: 0, errors: 0 },
    });

    try {
      const companyId = selectedCompany.id;

      // 1. Process Categories
      if (files.categories) {
        toast.info("Processando Categorias...");
        const content = await readFileContent(files.categories);
        const lines = parseCSV(content).slice(1); // Remove header
        const chunks = chunkArray(lines, 100);

        for (let i = 0; i < chunks.length; i++) {
          const { data, error } = await supabaseTatica.functions.invoke('import-omie-data', {
            body: { companyId, categories: chunks[i] }
          });
          if (error) throw error;
          setResults(prev => ({
            ...prev!,
            categories: {
              imported: prev!.categories.imported + (data.results.categories.imported || 0),
              errors: prev!.categories.errors + (data.results.categories.errors || 0)
            }
          }));
          setProgress(Math.round(((i + 1) / chunks.length) * 20));
        }
      }

      // 2. Process Clients & Suppliers
      if (files.clientsSuppliers) {
        toast.info("Processando Clientes e Fornecedores...");
        const content = await readFileContent(files.clientsSuppliers);
        const lines = parseCSV(content).slice(1);
        const chunks = chunkArray(lines, 50); // Smaller batch for CS as it does double insert

        for (let i = 0; i < chunks.length; i++) {
          const { data, error } = await supabaseTatica.functions.invoke('import-omie-data', {
            body: { companyId, clientsSuppliers: chunks[i] }
          });
          if (error) throw error;
          setResults(prev => ({
            ...prev!,
            clients: {
              imported: prev!.clients.imported + (data.results.clients.imported || 0),
              errors: prev!.clients.errors + (data.results.clients.errors || 0)
            },
            suppliers: {
              imported: prev!.suppliers.imported + (data.results.suppliers.imported || 0),
              errors: prev!.suppliers.errors + (data.results.suppliers.errors || 0)
            }
          }));
          setProgress(20 + Math.round(((i + 1) / chunks.length) * 30));
        }
      }

      // 3. Process Accounts Payable
      if (files.accountsPayable) {
        toast.info("Processando Contas a Pagar...");
        const content = await readFileContent(files.accountsPayable);
        const lines = parseCSV(content).slice(1);
        const chunks = chunkArray(lines, 100);

        for (let i = 0; i < chunks.length; i++) {
          const { data, error } = await supabaseTatica.functions.invoke('import-omie-data', {
            body: { companyId, accountsPayable: chunks[i] }
          });
          if (error) throw error;
          setResults(prev => ({
            ...prev!,
            accountsPayable: {
              imported: prev!.accountsPayable.imported + (data.results.accountsPayable.imported || 0),
              errors: prev!.accountsPayable.errors + (data.results.accountsPayable.errors || 0)
            }
          }));
          setProgress(50 + Math.round(((i + 1) / chunks.length) * 25));
        }
      }

      // 4. Process Accounts Receivable
      if (files.accountsReceivable) {
        toast.info("Processando Contas a Receber...");
        const content = await readFileContent(files.accountsReceivable);
        const lines = parseCSV(content).slice(1);
        const chunks = chunkArray(lines, 100);

        for (let i = 0; i < chunks.length; i++) {
          const { data, error } = await supabaseTatica.functions.invoke('import-omie-data', {
            body: { companyId, accountsReceivable: chunks[i] }
          });
          if (error) throw error;
          setResults(prev => ({
            ...prev!,
            accountsReceivable: {
              imported: prev!.accountsReceivable.imported + (data.results.accountsReceivable.imported || 0),
              errors: prev!.accountsReceivable.errors + (data.results.accountsReceivable.errors || 0)
            }
          }));
          setProgress(75 + Math.round(((i + 1) / chunks.length) * 25));
        }
      }

      setProgress(100);
      toast.success("Importação concluída com sucesso!");

    } catch (error: any) {
      console.error('Import exception:', error);
      toast.error(`Erro ao processar importação: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setIsImporting(false);
    }
  };

  const renderResultBadge = (imported: number, errors: number) => {
    if (imported === 0 && errors === 0) return null;

    return (
      <div className="flex items-center gap-2 text-sm">
        {imported > 0 && (
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            {imported} importados
          </span>
        )}
        {errors > 0 && (
          <span className="flex items-center gap-1 text-[#E53E3E]">
            <XCircle className="h-4 w-4" />
            {errors} erros
          </span>
        )}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">

        {!selectedCompany && (
          <Alert variant="destructive">
            <AlertTitle>Empresa não selecionada</AlertTitle>
            <AlertDescription>
              Selecione uma empresa no menu superior antes de importar os dados.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Categorias
              </CardTitle>
              <CardDescription>
                Arquivo: Omie_Categorias.csv
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange('categories')}
                  disabled={isImporting}
                />
                {files.categories && (
                  <p className="text-sm text-muted-foreground">
                    {files.categories.name}
                  </p>
                )}
                {results && renderResultBadge(results.categories.imported, results.categories.errors)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Clientes e Fornecedores
              </CardTitle>
              <CardDescription>
                Arquivo: Omie_Clientes_Fornecedors.csv
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange('clientsSuppliers')}
                  disabled={isImporting}
                />
                {files.clientsSuppliers && (
                  <p className="text-sm text-muted-foreground">
                    {files.clientsSuppliers.name}
                  </p>
                )}
                {results && (
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Clientes:</div>
                    {renderResultBadge(results.clients.imported, results.clients.errors)}
                    <div className="text-sm font-medium">Fornecedores:</div>
                    {renderResultBadge(results.suppliers.imported, results.suppliers.errors)}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Contas a Pagar
              </CardTitle>
              <CardDescription>
                Arquivo: Omie_Contas_Pagar.csv
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange('accountsPayable')}
                  disabled={isImporting}
                />
                {files.accountsPayable && (
                  <p className="text-sm text-muted-foreground">
                    {files.accountsPayable.name}
                  </p>
                )}
                {results && renderResultBadge(results.accountsPayable.imported, results.accountsPayable.errors)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Contas a Receber
              </CardTitle>
              <CardDescription>
                Arquivo: Omie_Contas_Receber.csv
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange('accountsReceivable')}
                  disabled={isImporting}
                />
                {files.accountsReceivable && (
                  <p className="text-sm text-muted-foreground">
                    {files.accountsReceivable.name}
                  </p>
                )}
                {results && renderResultBadge(results.accountsReceivable.imported, results.accountsReceivable.errors)}
              </div>
            </CardContent>
          </Card>
        </div>

        {isImporting && (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Processando importação...</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} />
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end">
          <Button
            onClick={handleImport}
            disabled={isImporting || !selectedCompany}
            size="lg"
          >
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Iniciar Importação
              </>
            )}
          </Button>
        </div>

        {results && (
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="text-green-700">Importação Concluída</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-5">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-700">{results.categories.imported}</div>
                  <div className="text-sm text-muted-foreground">Categorias</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-700">{results.clients.imported}</div>
                  <div className="text-sm text-muted-foreground">Clientes</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-700">{results.suppliers.imported}</div>
                  <div className="text-sm text-muted-foreground">Fornecedores</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-700">{results.accountsPayable.imported}</div>
                  <div className="text-sm text-muted-foreground">Contas a Pagar</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-700">{results.accountsReceivable.imported}</div>
                  <div className="text-sm text-muted-foreground">Contas a Receber</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
