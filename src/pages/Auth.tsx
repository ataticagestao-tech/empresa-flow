import { useMemo, useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { z } from "zod";
import logoTatica from "@/assets/logo-tatica.png";
import { BarChart3, Shield, Zap } from "lucide-react";

const loginSchema = z.object({
  email: z.string().trim().email("Email invalido").max(255),
  password: z.string().min(6, "Senha deve ter no minimo 6 caracteres"),
});
const signupSchema = loginSchema.extend({
  fullName: z.string().trim().min(3, "Nome deve ter no minimo 3 caracteres").max(100),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, { message: "Senhas nao conferem", path: ["confirmPassword"] });
const resetSchema = z.object({
  password: z.string().min(6, "Senha deve ter no minimo 6 caracteres"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, { message: "Senhas nao conferem", path: ["confirmPassword"] });

const toPtBrAuthError = (message: string) => {
  const msg = (message || "").toLowerCase();
  if (msg.includes("invalid login credentials")) return "Email ou senha incorretos.";
  if (msg.includes("email not confirmed")) return "Email nao confirmado. Verifique sua caixa.";
  if (msg.includes("user not found")) return "Usuario nao encontrado";
  if (msg.includes("too many requests")) return "Muitas tentativas. Aguarde.";
  if (msg.includes("token has expired") || msg.includes("invalid or expired")) return "Link invalido ou expirado.";
  if (msg.includes("weak password")) return "Senha fraca.";
  if (msg.includes("already registered") || msg.includes("duplicate") || msg.includes("already exists")) return "Este email ja esta cadastrado";
  return message;
};

const features = [
  { icon: BarChart3, title: "Gestao Financeira", description: "Controle total de contas a pagar, receber e fluxo de caixa." },
  { icon: Shield, title: "Seguranca", description: "Dados protegidos com criptografia de ponta a ponta." },
  { icon: Zap, title: "Performance", description: "Interface rapida e responsiva para o seu dia a dia." },
];

export default function Auth() {
  const navigate = useNavigate();
  const { user, signIn, signUp, loading, activeClient } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [signupFullName, setSignupFullName] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");

  const isRecoveryFlow = useMemo(() => {
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    return hash.includes("type=recovery") || search.includes("type=recovery");
  }, []);

  useEffect(() => { if (user && !loading) navigate("/dashboard"); }, [user, loading, navigate]);

  if (loading) return (<div className="min-h-screen flex items-center justify-center bg-white"><div className="flex flex-col items-center gap-3"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /><span className="text-sm text-slate-500">Carregando...</span></div></div>);
  if (user) return <Navigate to="/dashboard" replace />;

  const handleForgotPassword = async () => {
    if (!loginEmail) { toast.error("Informe seu email."); return; }
    setIsLoading(true);
    try {
      const v = z.string().trim().email("Email invalido").max(255).parse(loginEmail);
      const { error } = await activeClient.auth.resetPasswordForEmail(v, { redirectTo: `${window.location.origin}/auth` });
      if (error) { toast.error(toPtBrAuthError(error.message)); return; }
      toast.success("Email de recuperacao enviado.");
    } catch (e) { if (e instanceof z.ZodError) toast.error(e.errors[0].message); } finally { setIsLoading(false); }
  };
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true);
    try {
      const v = resetSchema.parse({ password: resetPassword, confirmPassword: resetConfirmPassword });
      const { error } = await activeClient.auth.updateUser({ password: v.password });
      if (error) { toast.error(toPtBrAuthError(error.message)); return; }
      toast.success("Senha atualizada!"); window.location.hash = ""; navigate("/dashboard");
    } catch (e) { if (e instanceof z.ZodError) toast.error(e.errors[0].message); } finally { setIsLoading(false); }
  };
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true);
    try {
      const v = loginSchema.parse({ email: loginEmail, password: loginPassword });
      const { error } = await signIn(v.email, v.password);
      if (error) { toast.error(toPtBrAuthError(error.message)); return; }
      toast.success("Login realizado!"); navigate("/dashboard");
    } catch (e) { if (e instanceof z.ZodError) toast.error(e.errors[0].message); } finally { setIsLoading(false); }
  };
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault(); setIsLoading(true);
    try {
      const v = signupSchema.parse({ email: signupEmail, password: signupPassword, confirmPassword: signupConfirmPassword, fullName: signupFullName });
      const { error } = await signUp(v.email, v.password, v.fullName);
      if (error) { toast.error(toPtBrAuthError(error.message)); return; }
      toast.success("Conta criada!"); navigate("/dashboard");
    } catch (e) { if (e instanceof z.ZodError) toast.error(e.errors[0].message); } finally { setIsLoading(false); }
  };

  const ic = "bg-white border-slate-200 focus:border-primary focus:ring-primary/20 rounded-lg h-11 text-slate-900 placeholder:text-slate-400 transition-all duration-200";

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      <div className="relative hidden lg:flex flex-col justify-between bg-slate-50 p-12 overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        <div className="relative z-10"><div className="flex items-center gap-3 mb-2"><div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center"><img src={logoTatica} alt="Logo" className="w-7 h-7 object-contain" /></div><span className="text-slate-900 font-semibold text-lg tracking-wide">Tatica Gestao</span></div></div>
        <div className="relative z-10 space-y-8">
          <div><h2 className="text-4xl font-bold text-slate-900 leading-tight mb-4">Gerencie seu negocio<br /><span className="text-primary">com inteligencia.</span></h2><p className="text-lg text-slate-500 max-w-md leading-relaxed">Plataforma completa para gestao financeira, clientes e operacoes da sua empresa.</p></div>
          <div className="space-y-4">{features.map((f) => (<div key={f.title} className="flex items-start gap-4 p-4 rounded-xl bg-white/70 border border-slate-100 transition-all duration-200 hover:bg-white hover:shadow-sm"><div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><f.icon className="w-5 h-5 text-primary" /></div><div><h3 className="font-semibold text-slate-900 text-sm">{f.title}</h3><p className="text-slate-500 text-sm leading-relaxed">{f.description}</p></div></div>))}</div>
        </div>
        <div className="relative z-10"><p className="text-slate-400 text-sm">&copy; {new Date().getFullYear()} Tatica Gestao Empresarial</p></div>
      </div>
      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-[420px]">
          <div className="flex flex-col mb-8">
            <div className="lg:hidden flex items-center gap-3 mb-8"><div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center"><img src={logoTatica} alt="Tatica" className="w-7 h-7 object-contain" /></div><span className="font-semibold text-lg text-slate-900">Tatica Gestao</span></div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">{isRecoveryFlow ? "Redefinir senha" : "Bem-vindo de volta"}</h1>
            <p className="text-slate-500">{isRecoveryFlow ? "Defina uma senha segura." : "Faca login para acessar sua plataforma."}</p>
          </div>
          {isRecoveryFlow ? (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div className="space-y-2"><Label htmlFor="rp" className="text-slate-700 text-sm font-medium">Nova senha</Label><Input id="rp" type="password" autoComplete="new-password" placeholder="Min. 6 caracteres" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} required className={ic} /></div>
              <div className="space-y-2"><Label htmlFor="rc" className="text-slate-700 text-sm font-medium">Confirmar senha</Label><Input id="rc" type="password" autoComplete="new-password" placeholder="Repita a senha" value={resetConfirmPassword} onChange={(e) => setResetConfirmPassword(e.target.value)} required className={ic} /></div>
              <Button type="submit" className="w-full h-11 rounded-lg font-semibold transition-all duration-200 hover:shadow-md active:scale-[0.98]" disabled={isLoading}>{isLoading ? "Atualizando..." : "Atualizar senha"}</Button>
            </form>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="grid w-full grid-cols-2 p-1 bg-slate-100 rounded-lg h-11">
                <TabsTrigger value="login" className="rounded-md h-full data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 text-slate-500 font-medium text-sm transition-all">Entrar</TabsTrigger>
                <TabsTrigger value="signup" className="rounded-md h-full data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 text-slate-500 font-medium text-sm transition-all">Criar conta</TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2"><Label htmlFor="le" className="text-slate-700 text-sm font-medium">Email</Label><Input id="le" type="email" autoComplete="email" placeholder="seu@empresa.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required className={ic} /></div>
                  <div className="space-y-2"><div className="flex justify-between items-center"><Label htmlFor="lp" className="text-slate-700 text-sm font-medium">Senha</Label><button type="button" className="text-xs text-primary hover:text-primary/80 transition-colors font-medium" onClick={handleForgotPassword}>Esqueci minha senha</button></div><Input id="lp" type="password" autoComplete="current-password" placeholder="Min. 6 caracteres" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required className={ic} /></div>
                  <Button type="submit" className="w-full h-11 rounded-lg font-semibold transition-all duration-200 hover:shadow-md active:scale-[0.98] mt-2" disabled={isLoading}>{isLoading ? "Entrando..." : "Entrar"}</Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2"><Label htmlFor="sn" className="text-slate-700 text-sm font-medium">Nome completo</Label><Input id="sn" type="text" placeholder="Seu nome" value={signupFullName} onChange={(e) => setSignupFullName(e.target.value)} required className={ic} /></div>
                  <div className="space-y-2"><Label htmlFor="se" className="text-slate-700 text-sm font-medium">Email</Label><Input id="se" type="email" autoComplete="email" placeholder="seu@email.com" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required className={ic} /></div>
                  <div className="space-y-2"><Label htmlFor="sp" className="text-slate-700 text-sm font-medium">Senha</Label><Input id="sp" type="password" autoComplete="new-password" placeholder="Min. 6 caracteres" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} required className={ic} /></div>
                  <div className="space-y-2"><Label htmlFor="sc" className="text-slate-700 text-sm font-medium">Confirmar senha</Label><Input id="sc" type="password" autoComplete="new-password" placeholder="Repita a senha" value={signupConfirmPassword} onChange={(e) => setSignupConfirmPassword(e.target.value)} required className={ic} /></div>
                  <Button type="submit" className="w-full h-11 rounded-lg font-semibold transition-all duration-200 hover:shadow-md active:scale-[0.98] mt-2" disabled={isLoading}>{isLoading ? "Criando conta..." : "Criar conta"}</Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
