// ============================================================
// whatsapp-inbox — Edge Function (Deno)
//
// Gateway autenticado da caixa de entrada de WhatsApp (Cloud API).
// O número é UM só pra toda a Tática (não é por empresa-cliente) e
// leads não têm company_id, então as tabelas têm RLS sem policy
// pública — só esta function (service role) lê/escreve, após checar
// que quem chama é dono/admin (mesmo padrão de admin-create-user).
//
// Ações (campo `action` no body POST):
//   conversas    → lista threads
//   mensagens    → histórico de uma conversa (conversa_id)
//   enviar       → resposta manual (texto livre, janela 24h); pausa a IA
//   marcar_lida  → zera unread_count
//   toggle_ia    → liga/desliga a IA da conversa
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCloudConfig, isCloudEnabled, sendCloudText } from "../_shared/whatsapp-cloud.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPER_ADMIN_EXACT_EMAILS = [
    "izabelvier@outlook.com",
    "isabelvier@outlook.com",
    "yuriallmeida@gmail.com",
];

function isSuperAdminEmail(email?: string | null) {
    const normalized = String(email || "").trim().toLowerCase();
    if (!normalized) return false;
    return SUPER_ADMIN_EXACT_EMAILS.includes(normalized);
}

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

        if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
            return jsonResponse({ ok: false, erro: "Variáveis de ambiente não configuradas" }, 500);
        }

        const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

        // Auth modo 1 — servidor-a-servidor (ex: meutatico.site chamando pra montar o chat):
        // header X-Inbox-Secret igual ao INBOX_SERVICE_SECRET pula o gate de login/admin.
        const INBOX_SERVICE_SECRET = Deno.env.get("INBOX_SERVICE_SECRET") || "";
        const inboxSecret = req.headers.get("X-Inbox-Secret") || "";
        const isServiceCall = !!INBOX_SERVICE_SECRET && inboxSecret === INBOX_SERVICE_SECRET;

        // Auth modo 2 — chamada do browser com JWT de dono/admin (gate original).
        if (!isServiceCall) {
            const authHeader = req.headers.get("Authorization") || "";
            if (!authHeader.startsWith("Bearer ")) {
                return jsonResponse({ ok: false, erro: "Não autenticado" }, 401);
            }
            // Identifica quem está pedindo (JWT do chamador)
            const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
                global: { headers: { Authorization: authHeader } },
            });
            const { data: callerData, error: callerError } = await callerClient.auth.getUser();
            if (callerError || !callerData?.user) {
                return jsonResponse({ ok: false, erro: "Sessão inválida" }, 401);
            }
            const caller = callerData.user;

            // Gate: dono/admin (whitelist de email OU admin_users.is_super_admin)
            let isSuperAdmin = isSuperAdminEmail(caller.email);
            if (!isSuperAdmin) {
                const { data: adminRow } = await admin
                    .from("admin_users")
                    .select("is_super_admin")
                    .eq("user_id", caller.id)
                    .single();
                isSuperAdmin = Boolean(adminRow?.is_super_admin);
            }
            if (!isSuperAdmin) {
                return jsonResponse({ ok: false, erro: "Permissão negada" }, 403);
            }
        }

        const body = await req.json().catch(() => ({}));
        const action = String(body.action || "");

        // ── lista de conversas ──────────────────────────────────
        if (action === "conversas") {
            const { data, error } = await admin
                .from("whatsapp_conversas")
                .select("id, phone, nome, company_id, is_lead, ia_ativa, unread_count, referral, last_message_at, last_message_preview, last_message_autor, status, created_at")
                .order("last_message_at", { ascending: false, nullsFirst: false })
                .limit(300);
            if (error) return jsonResponse({ ok: false, erro: error.message }, 400);
            return jsonResponse({ ok: true, conversas: data || [] });
        }

        // ── mensagens de uma conversa ───────────────────────────
        if (action === "mensagens") {
            const conversaId = String(body.conversa_id || "");
            if (!conversaId) return jsonResponse({ ok: false, erro: "conversa_id obrigatório" }, 400);
            const { data, error } = await admin
                .from("whatsapp_mensagens")
                .select("id, direcao, autor, tipo, conteudo, midia, status, wa_message_id, created_at")
                .eq("conversa_id", conversaId)
                .order("created_at", { ascending: true })
                .limit(500);
            if (error) return jsonResponse({ ok: false, erro: error.message }, 400);
            return jsonResponse({ ok: true, mensagens: data || [] });
        }

        // ── enviar resposta manual (humano) ─────────────────────
        if (action === "enviar") {
            const conversaId = String(body.conversa_id || "");
            const texto = String(body.texto || "").trim();
            if (!conversaId) return jsonResponse({ ok: false, erro: "conversa_id obrigatório" }, 400);
            if (!texto) return jsonResponse({ ok: false, erro: "texto obrigatório" }, 400);

            const { data: conv, error: convErr } = await admin
                .from("whatsapp_conversas")
                .select("phone")
                .eq("id", conversaId)
                .single();
            if (convErr || !conv) return jsonResponse({ ok: false, erro: "Conversa não encontrada" }, 404);

            if (!isCloudEnabled()) {
                return jsonResponse({ ok: false, erro: "WhatsApp Cloud não está ativo (USE_WHATSAPP_CLOUD)" }, 400);
            }
            const cfg = getCloudConfig();
            if (!cfg) return jsonResponse({ ok: false, erro: "Credenciais Cloud ausentes no servidor" }, 500);

            const res = await sendCloudText(cfg, { to: (conv as any).phone, text: texto });
            if (!res.ok) {
                // Causa comum: fora da janela de 24h (Meta só aceita template aí).
                return jsonResponse({
                    ok: false,
                    erro: res.error || "Falha ao enviar",
                    dica: "Se a última mensagem do contato tem mais de 24h, o WhatsApp só deixa enviar via modelo aprovado.",
                }, 400);
            }

            // Grava no inbox como saída humana e pausa a IA (Izabel assumiu).
            await admin.rpc("whatsapp_registrar_msg", {
                p_phone: (conv as any).phone,
                p_direcao: "saida",
                p_autor: "humano",
                p_conteudo: texto,
                p_wa_message_id: res.waMessageId ?? null,
                p_tipo: "texto",
                p_status: res.waMessageId ? "sent" : null,
            });
            await admin.from("whatsapp_conversas").update({ ia_ativa: false }).eq("id", conversaId);

            return jsonResponse({ ok: true, wa_message_id: res.waMessageId ?? null, ia_ativa: false });
        }

        // ── marcar como lida ────────────────────────────────────
        if (action === "marcar_lida") {
            const conversaId = String(body.conversa_id || "");
            if (!conversaId) return jsonResponse({ ok: false, erro: "conversa_id obrigatório" }, 400);
            const { error } = await admin
                .from("whatsapp_conversas")
                .update({ unread_count: 0 })
                .eq("id", conversaId);
            if (error) return jsonResponse({ ok: false, erro: error.message }, 400);
            return jsonResponse({ ok: true });
        }

        // ── liga/desliga IA da conversa ─────────────────────────
        if (action === "toggle_ia") {
            const conversaId = String(body.conversa_id || "");
            const ativa = Boolean(body.ia_ativa);
            if (!conversaId) return jsonResponse({ ok: false, erro: "conversa_id obrigatório" }, 400);
            const { error } = await admin
                .from("whatsapp_conversas")
                .update({ ia_ativa: ativa })
                .eq("id", conversaId);
            if (error) return jsonResponse({ ok: false, erro: error.message }, 400);
            return jsonResponse({ ok: true, ia_ativa: ativa });
        }

        return jsonResponse({ ok: false, erro: `Ação desconhecida: ${action}` }, 400);
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        return jsonResponse({ ok: false, erro: msg }, 500);
    }
});
