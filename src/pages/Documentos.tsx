import { useState, useCallback, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  FolderOpen, Upload, Search, File, FileText, FileImage, FileSpreadsheet,
  FileArchive, Trash2, Download, Plus, Clock, AlertTriangle, CheckCircle2,
  XCircle, Loader2, X,
} from "lucide-react";

// ── Types ──

interface Documento {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string;
  storage_path: string;
  storage_bucket: string;
  mime_type: string | null;
  tamanho_bytes: number | null;
  tags: string[] | null;
  versao: number;
  created_at: string;
}

interface DocumentoValidade {
  id: string;
  documento_id: string;
  data_emissao: string | null;
  data_validade: string;
  orgao_emissor: string | null;
  responsavel: string | null;
  status: string;
  documentos?: { nome: string; categoria: string };
}

// ── Helpers ──

const CATEGORIAS = [
  { value: "contrato", label: "Contrato" },
  { value: "nota_fiscal", label: "Nota Fiscal" },
  { value: "alvara", label: "Alvará" },
  { value: "certidao", label: "Certidão" },
  { value: "licenca", label: "Licença" },
  { value: "certificado_digital", label: "Cert. Digital" },
  { value: "recibo", label: "Recibo" },
  { value: "holerite", label: "Holerite" },
  { value: "guia_imposto", label: "Guia Imposto" },
  { value: "procuracao", label: "Procuração" },
  { value: "contrato_social", label: "Contrato Social" },
  { value: "relatorio", label: "Relatório" },
  { value: "outros", label: "Outros" },
];

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

function getFileIcon(mime: string | null) {
  const t = (mime || "").toLowerCase();
  if (t.includes("image")) return FileImage;
  if (t.includes("pdf") || t.includes("document")) return FileText;
  if (t.includes("sheet") || t.includes("excel")) return FileSpreadsheet;
  if (t.includes("zip") || t.includes("rar")) return FileArchive;
  return File;
}

function getCategoriaLabel(cat: string) {
  return CATEGORIAS.find((c) => c.value === cat)?.label || cat;
}

type Tab = "explorador" | "vencimentos";

// ── Component ──

export default function Documentos() {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const { toast } = useToast();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>("explorador");
  const [docs, setDocs] = useState<Documento[]>([]);
  const [validades, setValidades] = useState<DocumentoValidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategoria, setFilterCategoria] = useState("all");
  const [uploading, setUploading] = useState(false);

  // Upload modal
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadNome, setUploadNome] = useState("");
  const [uploadCategoria, setUploadCategoria] = useState("outros");
  const [uploadDescricao, setUploadDescricao] = useState("");

  // Vencimento modal
  const [showAddVenc, setShowAddVenc] = useState(false);
  const [vencDocId, setVencDocId] = useState("");
  const [vencData, setVencData] = useState("");
  const [vencEmissao, setVencEmissao] = useState("");
  const [vencOrgao, setVencOrgao] = useState("");
  const [vencResponsavel, setVencResponsavel] = useState("");
  const [savingVenc, setSavingVenc] = useState(false);

  // ── Fetch Documentos ──

  const fetchDocs = useCallback(async () => {
    if (!selectedCompany?.id || !db) return;
    setLoading(true);
    try {
      const { data, error } = await db
        .from("documentos")
        .select("*")
        .eq("company_id", selectedCompany.id)
        .order("created_at", { ascending: false });

      if (error) { console.error("[Docs] fetch error:", error); setDocs([]); }
      else setDocs(data || []);
    } catch { setDocs([]); }
    finally { setLoading(false); }
  }, [selectedCompany?.id, db]);

  const fetchValidades = useCallback(async () => {
    if (!selectedCompany?.id || !db) return;
    try {
      const { data, error } = await db
        .from("documentos_validade")
        .select("*, documentos(nome, categoria)")
        .eq("company_id", selectedCompany.id)
        .order("data_validade", { ascending: true });

      if (!error && data) setValidades(data);
      else setValidades([]);
    } catch { setValidades([]); }
  }, [selectedCompany?.id, db]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);
  useEffect(() => { if (tab === "vencimentos") fetchValidades(); }, [tab, fetchValidades]);

  // ── Upload ──

  async function handleUpload() {
    if (!uploadFile || !selectedCompany?.id || !db) return;
    setUploading(true);
    try {
      const ext = uploadFile.name.split(".").pop() || "";
      const storagePath = `${selectedCompany.id}/${Date.now()}_${uploadFile.name}`;

      const { error: storageError } = await db.storage
        .from("documentos")
        .upload(storagePath, uploadFile, { contentType: uploadFile.type });

      if (storageError) throw storageError;

      const { error: insertError } = await db
        .from("documentos")
        .insert({
          company_id: selectedCompany.id,
          nome: uploadNome || uploadFile.name,
          descricao: uploadDescricao || null,
          categoria: uploadCategoria,
          origem: "upload",
          storage_path: storagePath,
          storage_bucket: "documentos",
          mime_type: uploadFile.type,
          tamanho_bytes: uploadFile.size,
        });

      if (insertError) throw insertError;

      toast({ title: "Sucesso", description: "Documento enviado!" });
      setShowUpload(false);
      setUploadFile(null);
      setUploadNome("");
      setUploadCategoria("outros");
      setUploadDescricao("");
      fetchDocs();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message || "Erro ao enviar", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  // ── Download ──

  async function handleDownload(doc: Documento) {
    try {
      const { data, error } = await db.storage
        .from(doc.storage_bucket)
        .createSignedUrl(doc.storage_path, 60);

      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message || "Erro ao baixar", variant: "destructive" });
    }
  }

  // ── Delete ──

  async function handleDelete(doc: Documento) {
    const ok = await confirm({
      title: `Excluir "${doc.nome}"?`,
      description: "O arquivo será removido permanentemente do storage e do banco.",
      confirmLabel: "Sim, excluir",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      // Delete from storage
      await db.storage.from(doc.storage_bucket).remove([doc.storage_path]);
      // Delete from table
      const { error } = await db.from("documentos").delete().eq("id", doc.id);
      if (error) throw error;
      toast({ title: "Excluído", description: "Documento removido." });
      fetchDocs();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message || "Erro ao excluir", variant: "destructive" });
    }
  }

  // ── Add Vencimento ──

  async function handleAddVencimento() {
    if (!vencDocId || !vencData || !selectedCompany?.id) return;
    setSavingVenc(true);
    try {
      const { error } = await db.from("documentos_validade").insert({
        documento_id: vencDocId,
        company_id: selectedCompany.id,
        data_validade: vencData,
        data_emissao: vencEmissao || null,
        orgao_emissor: vencOrgao || null,
        responsavel: vencResponsavel || null,
      });
      if (error) throw error;
      toast({ title: "Sucesso", description: "Vencimento cadastrado!" });
      setShowAddVenc(false);
      setVencDocId(""); setVencData(""); setVencEmissao(""); setVencOrgao(""); setVencResponsavel("");
      fetchValidades();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message || "Erro ao salvar", variant: "destructive" });
    } finally { setSavingVenc(false); }
  }

  // ── Filtered data ──

  const filteredDocs = docs.filter((d) => {
    if (filterCategoria !== "all" && d.categoria !== filterCategoria) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      return d.nome.toLowerCase().includes(s) || (d.descricao || "").toLowerCase().includes(s);
    }
    return true;
  });

  const today = new Date();
  const validadesEnriched = validades.map((v) => {
    const exp = new Date(v.data_validade);
    const diff = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const level = diff < 0 ? "vencido" : diff <= 30 ? "critico" : diff <= 60 ? "atencao" : "ok";
    return { ...v, dias_restantes: diff, nivel_alerta: level };
  });

  const vencidoCount = validadesEnriched.filter((v) => v.nivel_alerta === "vencido").length;
  const criticoCount = validadesEnriched.filter((v) => v.nivel_alerta === "critico").length;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Documentos</h1>
            <p className="text-sm text-muted-foreground">
              Gerencie documentos da empresa com controle de vencimentos
            </p>
          </div>
          <div className="flex gap-2">
            {tab === "explorador" && (
              <Button onClick={() => setShowUpload(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </Button>
            )}
            {tab === "vencimentos" && (
              <Button onClick={() => setShowAddVenc(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Vencimento
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab("explorador")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === "explorador" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FolderOpen className="h-4 w-4 inline mr-1.5" />
            Explorador
          </button>
          <button
            onClick={() => setTab("vencimentos")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === "vencimentos" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Clock className="h-4 w-4 inline mr-1.5" />
            Vencimentos
            {vencidoCount > 0 && (
              <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5">{vencidoCount}</Badge>
            )}
          </button>
        </div>

        {/* ── TAB: Explorador ── */}
        {tab === "explorador" && (
          <>
            {/* Filters */}
            <div className="flex gap-3 items-center">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar documentos..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterCategoria} onValueChange={setFilterCategoria}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas categorias</SelectItem>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredDocs.length === 0 ? (
                  <div className="text-center py-16">
                    <FolderOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                    <p className="text-muted-foreground">
                      {docs.length === 0 ? "Nenhum documento enviado" : "Nenhum resultado encontrado"}
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Tamanho</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDocs.map((doc) => {
                        const Icon = getFileIcon(doc.mime_type);
                        return (
                          <TableRow key={doc.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{doc.nome}</p>
                                  {doc.descricao && (
                                    <p className="text-xs text-muted-foreground truncate">{doc.descricao}</p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{getCategoriaLabel(doc.categoria)}</Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground tabular-nums">
                              {formatBytes(doc.tamanho_bytes)}
                            </TableCell>
                            <TableCell className="text-muted-foreground tabular-nums">
                              {formatDate(doc.created_at)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => handleDownload(doc)} title="Baixar">
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDelete(doc)} title="Excluir" className="text-destructive hover:text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* ── TAB: Vencimentos ── */}
        {tab === "vencimentos" && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-4">
                <p className="text-2xl font-bold">{validades.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </Card>
              <Card className="p-4">
                <p className="text-2xl font-bold text-amber-500">{criticoCount}</p>
                <p className="text-xs text-muted-foreground">Vencem em 30d</p>
              </Card>
              <Card className="p-4">
                <p className="text-2xl font-bold text-red-500">{vencidoCount}</p>
                <p className="text-xs text-muted-foreground">Vencidos</p>
              </Card>
              <Card className="p-4">
                <p className="text-2xl font-bold text-green-500">
                  {validadesEnriched.filter((v) => v.nivel_alerta === "ok").length}
                </p>
                <p className="text-xs text-muted-foreground">Vigentes</p>
              </Card>
            </div>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                {validadesEnriched.length === 0 ? (
                  <div className="text-center py-16">
                    <Clock className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                    <p className="text-muted-foreground">Nenhum vencimento cadastrado</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Documento</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Emissão</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Responsável</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validadesEnriched.map((v) => {
                        const config = v.nivel_alerta === "vencido"
                          ? { icon: XCircle, label: "Vencido", color: "text-red-500 bg-red-50" }
                          : v.nivel_alerta === "critico"
                          ? { icon: AlertTriangle, label: `${v.dias_restantes}d`, color: "text-amber-500 bg-amber-50" }
                          : v.nivel_alerta === "atencao"
                          ? { icon: Clock, label: `${v.dias_restantes}d`, color: "text-yellow-600 bg-yellow-50" }
                          : { icon: CheckCircle2, label: "Vigente", color: "text-green-500 bg-green-50" };
                        const StatusIcon = config.icon;

                        return (
                          <TableRow key={v.id}>
                            <TableCell className="font-medium">
                              {v.documentos?.nome || "—"}
                              {v.orgao_emissor && (
                                <p className="text-xs text-muted-foreground">{v.orgao_emissor}</p>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {v.documentos?.categoria ? getCategoriaLabel(v.documentos.categoria) : "—"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground tabular-nums">
                              {formatDate(v.data_emissao)}
                            </TableCell>
                            <TableCell className="text-muted-foreground tabular-nums">
                              {formatDate(v.data_validade)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {v.responsavel || "—"}
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
                                <StatusIcon className="h-3 w-3" />
                                {config.label}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* ── Upload Sheet ── */}
      <Sheet open={showUpload} onOpenChange={setShowUpload}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Enviar Documento</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div>
              <Label>Arquivo *</Label>
              <Input
                type="file"
                className="mt-1"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setUploadFile(f);
                    if (!uploadNome) setUploadNome(f.name.replace(/\.[^.]+$/, ""));
                  }
                }}
              />
            </div>
            <div>
              <Label>Nome</Label>
              <Input value={uploadNome} onChange={(e) => setUploadNome(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={uploadCategoria} onValueChange={setUploadCategoria}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={uploadDescricao} onChange={(e) => setUploadDescricao(e.target.value)} className="mt-1" placeholder="Opcional" />
            </div>
            <Button onClick={handleUpload} disabled={!uploadFile || uploading} className="w-full">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              {uploading ? "Enviando..." : "Enviar"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Add Vencimento Sheet ── */}
      <Sheet open={showAddVenc} onOpenChange={setShowAddVenc}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Adicionar Vencimento</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div>
              <Label>Documento *</Label>
              <Select value={vencDocId} onValueChange={setVencDocId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {docs.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data de Vencimento *</Label>
              <Input type="date" value={vencData} onChange={(e) => setVencData(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Data de Emissão</Label>
              <Input type="date" value={vencEmissao} onChange={(e) => setVencEmissao(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Órgão Emissor</Label>
              <Input value={vencOrgao} onChange={(e) => setVencOrgao(e.target.value)} className="mt-1" placeholder="Ex: Prefeitura, Receita Federal" />
            </div>
            <div>
              <Label>Responsável</Label>
              <Input value={vencResponsavel} onChange={(e) => setVencResponsavel(e.target.value)} className="mt-1" placeholder="Quem deve renovar" />
            </div>
            <Button onClick={handleAddVencimento} disabled={!vencDocId || !vencData || savingVenc} className="w-full">
              {savingVenc ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              {savingVenc ? "Salvando..." : "Adicionar"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
