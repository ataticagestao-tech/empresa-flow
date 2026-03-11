
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Trash2, UploadCloud } from "lucide-react";
import { formatBytes } from "@/lib/utils";

interface CompanyDocumentsTabProps {
    cartaoCnpjFile: File | null;
    setCartaoCnpjFile: (file: File | null) => void;
    cartaoCnpjDoc: any;
    certificadoA1File: File | null;
    setCertificadoA1File: (file: File | null) => void;
    certificadoA1Doc: any;
    deleteDocument: (doc: any) => void;
    isLoading: boolean;
}

export function CompanyDocumentsTab({
    cartaoCnpjFile, setCartaoCnpjFile, cartaoCnpjDoc,
    certificadoA1File, setCertificadoA1File, certificadoA1Doc,
    deleteDocument, isLoading
}: CompanyDocumentsTabProps) {

    const hasCartao = !!cartaoCnpjDoc || !!cartaoCnpjFile;
    const hasCertificado = !!certificadoA1Doc || !!certificadoA1File;

    return (
        <div className="space-y-6">
            {/* Cartão CNPJ */}
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-50 rounded-lg">
                            <FileText className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                            <div className="font-bold text-foreground">Cartão CNPJ</div>
                            {hasCartao ? (
                                <div className="text-sm text-muted-foreground">
                                    {cartaoCnpjDoc?.file_name || cartaoCnpjFile?.name}
                                    <span className="text-xs text-muted-foreground ml-2">
                                        ({formatBytes(cartaoCnpjDoc?.file_size || cartaoCnpjFile?.size || 0)})
                                    </span>
                                </div>
                            ) : (
                                <div className="text-xs text-muted-foreground">Nenhum arquivo. PNG, JPG ou PDF.</div>
                            )}
                        </div>
                    </div>
                    {hasCartao ? (
                        <Button variant="ghost" size="icon" onClick={() => {
                            if (cartaoCnpjFile) setCartaoCnpjFile(null);
                            if (cartaoCnpjDoc) deleteDocument(cartaoCnpjDoc);
                        }}>
                            <Trash2 className="w-5 h-5 text-red-500" />
                        </Button>
                    ) : (
                        <div className="relative">
                            <Input
                                type="file"
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                accept=".pdf,image/*"
                                onChange={(e) => setCartaoCnpjFile(e.target.files?.[0] || null)}
                            />
                            <Button variant="outline" className="pointer-events-none">
                                <UploadCloud className="w-4 h-4 mr-2" />
                                Selecionar
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Certificado A1 */}
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 rounded-lg">
                            <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <div className="font-bold text-foreground">Certificado Digital A1</div>
                            {hasCertificado ? (
                                <div className="text-sm text-muted-foreground">
                                    {certificadoA1Doc?.file_name || certificadoA1File?.name}
                                    <span className="text-xs text-muted-foreground ml-2">
                                        ({formatBytes(certificadoA1Doc?.file_size || certificadoA1File?.size || 0)})
                                    </span>
                                </div>
                            ) : (
                                <div className="text-xs text-muted-foreground">Nenhum arquivo. .pfx ou .p12</div>
                            )}
                        </div>
                    </div>
                    {hasCertificado ? (
                        <Button variant="ghost" size="icon" onClick={() => {
                            if (certificadoA1File) setCertificadoA1File(null);
                            if (certificadoA1Doc) deleteDocument(certificadoA1Doc);
                        }}>
                            <Trash2 className="w-5 h-5 text-red-500" />
                        </Button>
                    ) : (
                        <div className="relative">
                            <Input
                                type="file"
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                accept=".pfx,.p12"
                                onChange={(e) => setCertificadoA1File(e.target.files?.[0] || null)}
                            />
                            <Button variant="outline" className="pointer-events-none">
                                <UploadCloud className="w-4 h-4 mr-2" />
                                Selecionar
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            <div className="text-xs text-muted-foreground">
                * Os arquivos selecionados serão enviados ao salvar a empresa.
            </div>
        </div>
    );
}
