// solicitar-cadastro — versao com suporte Evolution + Cloud API
//
// Quando USE_WHATSAPP_CLOUD=true: envia o template "solicitar_cadastro_funcionario"
// (aprovado pela Meta) com 2 variaveis {nome, empresa}. O detalhamento dos
// campos a preencher chega depois, em texto livre, quando o destinatario
// responder a mensagem (abrindo a janela de 24h).
//
// Quando USE_WHATSAPP_CLOUD=false (legado): envia mensagem unica via Evolution
// ja contendo a lista completa de campos.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
    getCloudConfig,
    isCloudEnabled,
    sendCloudTemplate,
} from "../_shared/whatsapp-cloud.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function j(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

/** Normaliza telefone pra Evolution (12 ou 13 digitos) */
function normalizePhoneEvolution(raw: string): string | null {
    if (!raw) return null;
    let d = raw.replace(/\D/g, "");
    if (!d) return null;
    if (d.startsWith("0")) d = d.slice(1);
    if (!d.startsWith("55")) {
        if (d.length === 10 || d.length === 11) d = "55" + d;
        else return null;
    }
    if (d.length < 12 || d.length > 13) return null;
    return d;
}

function getUserIdFromJwt(authHeader: string): string | null {
    try {
        const token = authHeader.replace(/^Bearer\s+/i, "");
        const parts = token.split(".");
        if (parts.length < 2) return null;
        const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = b64 + "=".repeat((4 - b64.length % 4) % 4);
        return JSON.parse(atob(padded))?.sub ?? null;
    } catch { return null; }
}

const LABELS_FUNC: Record<string, string> = {
    nome_completo: "Nome completo", cpf: "CPF", rg: "RG",
    data_nascimento: "Data de nascimento",
    endereco: "Endereço (rua, número, bairro, cidade, CEP)",
    pix: "Chave PIX", banco: "Banco / Agência / Conta",
    email: "Email", pis: "PIS/NIS",
};
const LABELS_FORN: Record<string, string> = {
    cnpj: "CNPJ", razao_social: "Razão social", nome_fantasia: "Nome fantasia",
    endereco: "Endereço (rua, número, bairro, cidade, CEP)",
    email: "Email", telefone: "Telefone",
    pix: "Chave PIX", banco: "Banco / Agência / Conta",
};

function renderEvolutionTemplate(
    tipo: string,
    nome: string,
    empresa: string,
    campos: string[],
    permiteSkip: boolean,
): string {
    const labels = tipo === "funcionario" ? LABELS_FUNC : LABELS_FORN;
    const linhas = campos.map((c) => `${labels[c] ?? c}:`).join("\n");
    const docObr = tipo === "funcionario" ? "CPF" : "CNPJ";
    const skipHint = permiteSkip
        ? `\n\n⚠️ Apenas o ${docObr} é obrigatório. Demais campos pode pular respondendo "não sei" ou "pular".`
        : `\n\n⚠️ Todos os campos são obrigatórios.`;

    if (tipo === "funcionario") {
        return `Olá ${nome}! 👋\nA *${empresa}* precisa atualizar seus dados cadastrais.\n\nVocê pode responder de 3 formas:\n📝 Texto: copie e preencha o formulário abaixo\n📸 Foto: envie foto do RG/CNH + comprovante de residência\n📄 PDF: envie PDF dos documentos\n\nSe preferir texto, copie e preencha:\n\n${linhas}${skipHint}\n\n_Esta solicitação expira em 7 dias._`;
    }
    return `Olá! A *${empresa}* precisa cadastrar/atualizar os dados de *${nome}*.\n\nVocê pode enviar:\n📸 Foto do cartão CNPJ (mais rápido)\n📝 Ou preencher abaixo:\n\n${linhas}${skipHint}\n\n_Esta solicitação expira em 7 dias._`;
}

const CAMPOS_FUNC = ["nome_completo", "cpf", "rg", "data_nascimento", "endereco", "pix", "banco"];
const CAMPOS_FORN = ["cnpj", "razao_social", "nome_fantasia", "endereco", "email", "telefone", "pix", "banco"];

interface EnvioResult {
    ok: boolean;
    error?: string;
    messageId?: string | null;
    rawResponse?: unknown;
    provider: "evolution" | "cloud";
    mensagemEnviada?: string;
}

async function enviarViaEvolution(
    telefoneNormalizado: string,
    mensagemTexto: string,
): Promise<EnvioResult> {
    const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") ?? "https://api.ataticagestao.com";
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
    const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") ?? "financeiro";

    if (!EVOLUTION_API_KEY) {
        return { ok: false, error: "EVOLUTION_API_KEY nao configurada", provider: "evolution" };
    }

    const evolutionUrl = `${EVOLUTION_API_URL.replace(/\/$/, "")}/message/sendText/${EVOLUTION_INSTANCE}`;
    const sendResp = await fetch(evolutionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
        body: JSON.stringify({ number: telefoneNormalizado, text: mensagemTexto }),
    });
    const sendBody = await sendResp.text();
    let sendData: any;
    try { sendData = JSON.parse(sendBody); } catch { sendData = { raw: sendBody }; }

    if (!sendResp.ok) {
        return {
            ok: false,
            error: `Evolution retornou ${sendResp.status}: ${sendData?.message ?? sendBody}`,
            rawResponse: sendData,
            provider: "evolution",
        };
    }

    return {
        ok: true,
        messageId: sendData?.key?.id ?? sendData?.response?.key?.id ?? null,
        rawResponse: sendData,
        provider: "evolution",
        mensagemEnviada: mensagemTexto,
    };
}

async function enviarViaCloud(
    telefone: string,
    nome: string,
    nomeEmpresa: string,
    tipo: string,
): Promise<EnvioResult> {
    const cfg = getCloudConfig();
    if (!cfg) {
        return { ok: false, error: "WhatsApp Cloud nao configurado (secrets faltando)", provider: "cloud" };
    }

    // Hoje so temos o template de funcionario aprovado.
    // Pra fornecedor: reusa o mesmo template (mensagem generica de cadastro).
    // TODO: quando criar template proprio de fornecedor, separar.
    const templateName = tipo === "funcionario"
        ? "solicitar_cadastro_funcionario"
        : "solicitar_cadastro_funcionario";

    const result = await sendCloudTemplate(cfg, {
        to: telefone,
        templateName,
        bodyParams: [nome, nomeEmpresa],
    });

    if (!result.ok) {
        return { ok: false, error: result.error, rawResponse: result.rawError, provider: "cloud" };
    }

    return {
        ok: true,
        messageId: result.waMessageId ?? null,
        rawResponse: { waMessageId: result.waMessageId },
        provider: "cloud",
        mensagemEnviada: `[template:${templateName}] ${nome}, ${nomeEmpresa}`,
    };
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const authHeader = req.headers.get("authorization");
        if (!authHeader) return j({ error: "Authorization obrigatorio" }, 401);

        const body = await req.json();
        const {
            company_id, tipo, employee_id, supplier_id, nome, telefone,
            permite_skip = true,
        } = body;

        if (!company_id) return j({ error: "company_id obrigatorio" }, 400);
        if (!tipo || !["funcionario", "fornecedor"].includes(tipo)) return j({ error: "tipo invalido" }, 400);
        if (!nome?.trim()) return j({ error: "nome obrigatorio" }, 400);
        if (!telefone) return j({ error: "telefone obrigatorio" }, 400);

        const telefoneNormalizado = normalizePhoneEvolution(telefone);
        if (!telefoneNormalizado) return j({ error: `Telefone invalido: ${telefone}` }, 400);

        const userId = getUserIdFromJwt(authHeader);
        if (!userId) return j({ error: "Token sem user_id" }, 401);

        const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

        const { data: acesso } = await service
            .from("user_companies").select("company_id")
            .eq("user_id", userId).eq("company_id", company_id).maybeSingle();
        if (!acesso) return j({ error: "Sem acesso a essa empresa" }, 403);

        const { data: companyData } = await service
            .from("companies").select("nome_fantasia, razao_social")
            .eq("id", company_id).maybeSingle();
        const nomeEmpresa =
            (companyData as any)?.nome_fantasia ||
            (companyData as any)?.razao_social ||
            "sua empresa";

        const camposParaPedir = tipo === "funcionario" ? CAMPOS_FUNC : CAMPOS_FORN;
        const obrigatorios = tipo === "funcionario" ? ["cpf"] : ["cnpj"];

        const { data: existente } = await service
            .from("cadastro_solicitacoes").select("id, status")
            .eq("company_id", company_id).eq("telefone", telefoneNormalizado)
            .in("status", ["aguardando_envio", "enviado", "em_conversa"])
            .maybeSingle();
        if (existente) {
            return j({
                error: "Ja existe solicitacao ativa para esse telefone",
                solicitacao_id: (existente as any).id,
                status: (existente as any).status,
            }, 409);
        }

        const { data: solicitacao, error: insertErr } = await service
            .from("cadastro_solicitacoes")
            .insert({
                company_id, tipo,
                employee_id: employee_id ?? null,
                supplier_id: supplier_id ?? null,
                nome_destinatario: nome.trim(),
                telefone: telefoneNormalizado,
                status: "aguardando_envio",
                campos_obrigatorios: obrigatorios,
                campos_faltando: camposParaPedir,
                permite_skip,
                criado_por: userId,
            })
            .select().single();

        if (insertErr || !solicitacao) {
            return j({ error: "Falha ao criar solicitacao", details: insertErr?.message }, 500);
        }

        let envio: EnvioResult;
        if (isCloudEnabled()) {
            envio = await enviarViaCloud(telefoneNormalizado, nome.trim(), nomeEmpresa, tipo);
        } else {
            const mensagemTexto = renderEvolutionTemplate(
                tipo, nome.trim(), nomeEmpresa, camposParaPedir, permite_skip,
            );
            envio = await enviarViaEvolution(telefoneNormalizado, mensagemTexto);
        }

        if (!envio.ok) {
            await service.from("cadastro_solicitacoes").delete().eq("id", (solicitacao as any).id);
            return j({
                error: envio.error ?? "Falha ao enviar WhatsApp",
                provider: envio.provider,
                details: envio.rawResponse,
            }, 502);
        }

        await service.from("cadastro_mensagens").insert({
            solicitacao_id: (solicitacao as any).id,
            direcao: "enviada",
            conteudo: envio.mensagemEnviada ?? "",
            evolution_message_id: envio.messageId ?? null,
        });

        await service.from("cadastro_solicitacoes")
            .update({ status: "enviado" }).eq("id", (solicitacao as any).id);

        return j({
            ok: true,
            provider: envio.provider,
            solicitacao: { ...(solicitacao as any), status: "enviado" },
            telefone: telefoneNormalizado,
            mensagem_enviada: envio.mensagemEnviada,
            response: envio.rawResponse,
        });

    } catch (err: any) {
        console.error("[solicitar-cadastro] erro:", err?.message, err?.stack);
        return j({ error: err?.message || String(err), stack: err?.stack }, 500);
    }
});
