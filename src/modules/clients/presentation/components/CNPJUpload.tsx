
import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Upload, FileText, Loader2, CheckCircle } from "lucide-react";
import { CNPJParserService, CNPJData } from "../../infra/cnpj-parser.service";
import { useToast } from "@/hooks/use-toast";

interface CNPJUploadProps {
    onDataExtracted: (data: Partial<CNPJData>) => void;
}

export function CNPJUpload({ onDataExtracted }: CNPJUploadProps) {
    const [isProcessing, setIsProcessing] = useState(false);
    const { toast } = useToast();
    const parser = new CNPJParserService();

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);
        try {
            const data = await parser.parseFile(file);
            if (!data.cnpj && !data.razao_social) {
                throw new Error("Não foi possível identificar dados de CNPJ válidos.");
            }
            onDataExtracted(data);
            toast({
                title: "Dados Extraídos!",
                description: `${data.razao_social} encontrado.`,
                className: "bg-green-600 text-white"
            });
        } catch (error: any) {
            toast({
                title: "Erro na leitura",
                description: error.message || "Falha ao ler o arquivo.",
                variant: "destructive"
            });
        } finally {
            setIsProcessing(false);
            // Reset input
            event.target.value = '';
        }
    };

    return (
        <div className="mb-6 p-4 border-2 border-dashed border-[#E2E8F0] rounded-lg bg-[#F8FAFC] flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                    <FileText className="h-5 w-5" />
                </div>
                <div>
                    <h4 className="font-semibold text-sm">Cartão CNPJ Automático</h4>
                    <p className="text-xs text-muted-foreground">Envie o PDF do Cartão CNPJ para preencher automaticamente.</p>
                </div>
            </div>

            <div>
                <input
                    type="file"
                    id="cnpj-upload"
                    accept=".pdf"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={isProcessing}
                />
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={isProcessing}
                    onClick={() => document.getElementById('cnpj-upload')?.click()}
                >
                    {isProcessing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Upload className="h-4 w-4" />
                    )}
                    {isProcessing ? "Lendo..." : "Carregar Cartão CNPJ"}
                </Button>
            </div>
        </div>
    );
}
