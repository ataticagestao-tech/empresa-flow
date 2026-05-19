// ============================================================
// importar-extrato-email — Edge Function (Deno)
//
// Polla a caixa Gmail configurada, lê mensagens NÃO lidas com anexo OFX,
// mapeia o ACCTID do OFX pra uma bank_account, faz upsert das transações
// e dispara auto_conciliar_extrato. Marca o email como lido só se importou
// com sucesso (assim emails sem match de conta ficam visíveis pra ajuste).
//
// Idempotência: email_import_log.message_id é UNIQUE. Se o mesmo email for
// processado de novo, o INSERT falha por conflito e a função pula.
//
// Trigger: pg_cron de hora em hora chama via SELECT net.http_post(...).
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================
// CONFIG — todas via Supabase secrets
// ============================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GMAIL_CLIENT_ID = Deno.env.get("GMAIL_CLIENT_ID");
const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET");
const GMAIL_REFRESH_TOKEN = Deno.env.get("GMAIL_REFRESH_TOKEN");
// Filtro de busca; padrão pega só não lidos com OFX. Pode customizar via secret
// (ex: limitar ao remetente do banco: `from:no-reply@bradesco.com.br ...`).
const GMAIL_QUERY = Deno.env.get("GMAIL_QUERY")
    ?? "is:unread has:attachment (filename:ofx OR filename:OFX)";
// Limite de segurança por execução pra não estourar o tempo (Edge Function tem ~150s)
const MAX_MESSAGES_PER_RUN = Number(Deno.env.get("GMAIL_MAX_PER_RUN") ?? "20");

// ============================================================
// GMAIL API HELPERS
// ============================================================

/** Troca refresh_token por access_token válido (expira em 1h, descartável) */
async function getGmailAccessToken(): Promise<string> {
    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: GMAIL_CLIENT_ID!,
            client_secret: GMAIL_CLIENT_SECRET!,
            refresh_token: GMAIL_REFRESH_TOKEN!,
            grant_type: "refresh_token",
        }),
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Gmail OAuth refresh falhou: ${res.status} ${txt}`);
    }
    const data = await res.json();
    return data.access_token as string;
}

interface GmailMessage {
    id: string;
    threadId: string;
}

async function listMessages(token: string, query: string): Promise<GmailMessage[]> {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", String(MAX_MESSAGES_PER_RUN));
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Gmail list: ${res.status}`);
    const data = await res.json();
    return (data.messages ?? []) as GmailMessage[];
}

interface GmailPart {
    partId?: string;
    mimeType?: string;
    filename?: string;
    body?: { attachmentId?: string; data?: string; size?: number };
    parts?: GmailPart[];
    headers?: Array<{ name: string; value: string }>;
}

interface GmailFullMessage {
    id: string;
    internalDate: string;
    payload: GmailPart;
}

async function getMessage(token: string, id: string): Promise<GmailFullMessage> {
    const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`Gmail get ${id}: ${res.status}`);
    return await res.json();
}

async function getAttachment(token: string, msgId: string, attId: string): Promise<string> {
    const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/attachments/${attId}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`Gmail attachment ${attId}: ${res.status}`);
    const data = await res.json();
    // Gmail usa base64url (- e _ em vez de + e /)
    const b64 = (data.data as string).replace(/-/g, "+").replace(/_/g, "/");
    return atob(b64);
}

async function markAsRead(token: string, msgId: string): Promise<void> {
    await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/modify`,
        {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
        }
    );
}

function getHeader(part: GmailPart, name: string): string | null {
    const h = part.headers?.find(h => h.name.toLowerCase() === name.toLowerCase());
    return h?.value ?? null;
}

/** Walk parts recursivamente, retorna o primeiro anexo .ofx encontrado */
function findOFXAttachment(part: GmailPart): { filename: string; attachmentId: string } | null {
    if (part.filename && /\.ofx$/i.test(part.filename) && part.body?.attachmentId) {
        return { filename: part.filename, attachmentId: part.body.attachmentId };
    }
    for (const sub of part.parts ?? []) {
        const found = findOFXAttachment(sub);
        if (found) return found;
    }
    return null;
}

// ============================================================
// OFX PARSER — versão Deno (espelha src/lib/parsers/ofx.ts)
// ============================================================

interface OFXTransaction {
    fitId: string;
    type: "credit" | "debit";
    date: string;       // 'yyyy-MM-dd' direto pro DB
    amount: number;
    description: string;
    memo?: string;
}

interface OFXSummary {
    bankId: string | null;
    acctId: string | null;
    branchId: string | null;
    closingBalance: number | null;
    closingDate: string | null;
    periodStart: string | null;
    periodEnd: string | null;
}

function hashString(input: string): string {
    let hash = 5381;
    for (let i = 0; i < input.length; i += 1) {
        hash = (hash * 33) ^ input.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
}

function ofxDateToISO(raw: string | null): string | null {
    if (!raw) return null;
    const clean = raw.trim().substring(0, 8);
    if (clean.length < 8) return null;
    return `${clean.substring(0, 4)}-${clean.substring(4, 6)}-${clean.substring(6, 8)}`;
}

function parseOFX(text: string): { transactions: OFXTransaction[]; summary: OFXSummary } {
    const transactions: OFXTransaction[] = [];
    const parts = text.split(/<STMTTRN>/i);
    parts.shift();

    const getTag = (block: string, tag: string): string | null => {
        const regex = new RegExp(`<${tag}>([^<\\r\\n]+)`, "i");
        const m = regex.exec(block);
        return m ? m[1].trim() : null;
    };

    const occurrenceCounter = new Map<string, number>();

    for (let i = 0; i < parts.length; i++) {
        let block = parts[i];
        const endIdx = block.search(/<\/STMTTRN>|<\/BANKTRANLIST>/i);
        if (endIdx > -1) block = block.substring(0, endIdx);

        const dtPosted = getTag(block, "DTPOSTED");
        const trnAmt = getTag(block, "TRNAMT");
        const name = getTag(block, "NAME");
        const memo = getTag(block, "MEMO");

        if (!dtPosted || !trnAmt) continue;
        const isoDate = ofxDateToISO(dtPosted);
        if (!isoDate) continue;

        const amountVal = parseFloat(trnAmt.replace(",", "."));
        if (!Number.isFinite(amountVal)) continue;

        const type: "credit" | "debit" = amountVal < 0 ? "debit" : "credit";
        const description = name || memo || "Transação Bancária";

        const contentKey = `${dtPosted}_${trnAmt}_${description}_${memo || ""}`;
        const occurrenceIdx = occurrenceCounter.get(contentKey) || 0;
        occurrenceCounter.set(contentKey, occurrenceIdx + 1);
        const fitId = `ofx_${dtPosted}_${trnAmt}_${hashString(contentKey)}_${occurrenceIdx}`;

        transactions.push({
            fitId,
            type,
            date: isoDate,
            amount: Math.abs(amountVal),
            description,
            memo: memo || undefined,
        });
    }

    const getOuter = (tag: string): string | null => {
        const regex = new RegExp(`<${tag}>([^<\\r\\n]+)`, "i");
        const m = regex.exec(text);
        return m ? m[1].trim() : null;
    };

    const closingBalanceRaw = getOuter("BALAMT");
    const closingBalance = closingBalanceRaw != null
        ? parseFloat(closingBalanceRaw.replace(",", "."))
        : null;

    const summary: OFXSummary = {
        bankId: getOuter("BANKID"),
        acctId: getOuter("ACCTID"),
        branchId: getOuter("BRANCHID"),
        closingBalance: Number.isFinite(closingBalance as number) ? (closingBalance as number) : null,
        closingDate: ofxDateToISO(getOuter("DTASOF")),
        periodStart: ofxDateToISO(getOuter("DTSTART")),
        periodEnd: ofxDateToISO(getOuter("DTEND")),
    };

    return { transactions, summary };
}

// ============================================================
// HTTP ENTRY
// ============================================================

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // Sanity check de configuração
    if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
        return new Response(
            JSON.stringify({ error: "Gmail secrets não configurados (GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN)" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
    });

    const summary = {
        processed: 0,
        imported: 0,
        auto_reconciled: 0,
        skipped_already_processed: 0,
        unmatched_account: 0,
        errors: 0,
        details: [] as Array<Record<string, unknown>>,
    };

    try {
        const accessToken = await getGmailAccessToken();
        const messages = await listMessages(accessToken, GMAIL_QUERY);

        for (const msg of messages) {
            summary.processed++;
            let logRow: Record<string, unknown> = {
                message_id: msg.id,
                status: "error",
            };

            try {
                // Idempotência: se já processamos esse message_id, pula
                const { data: existing } = await supabase
                    .from("email_import_log")
                    .select("id")
                    .eq("message_id", msg.id)
                    .maybeSingle();
                if (existing) {
                    summary.skipped_already_processed++;
                    summary.details.push({ id: msg.id, status: "already_processed" });
                    continue;
                }

                const full = await getMessage(accessToken, msg.id);
                logRow.from_address = getHeader(full.payload, "From");
                logRow.subject = getHeader(full.payload, "Subject");
                logRow.received_at = new Date(Number(full.internalDate)).toISOString();

                const attachment = findOFXAttachment(full.payload);
                if (!attachment) {
                    logRow.status = "no_ofx_attachment";
                    await supabase.from("email_import_log").insert(logRow);
                    summary.details.push({ id: msg.id, status: "no_ofx_attachment" });
                    // Marca como lido — sem OFX, não há trabalho a fazer
                    await markAsRead(accessToken, msg.id);
                    continue;
                }

                const ofxText = await getAttachment(accessToken, msg.id, attachment.attachmentId);
                let parsed;
                try {
                    parsed = parseOFX(ofxText);
                } catch (e) {
                    logRow.status = "parse_error";
                    logRow.error_detail = String(e);
                    await supabase.from("email_import_log").insert(logRow);
                    summary.errors++;
                    continue;  // NÃO marca como lido — usuário precisa ver
                }

                logRow.ofx_acctid = parsed.summary.acctId;
                logRow.ofx_bankid = parsed.summary.bankId;
                logRow.transactions_parsed = parsed.transactions.length;

                // Mapeia ACCTID → bank_account
                if (!parsed.summary.acctId) {
                    logRow.status = "unmatched_account";
                    logRow.error_detail = "OFX sem ACCTID — banco não informa ID da conta";
                    await supabase.from("email_import_log").insert(logRow);
                    summary.unmatched_account++;
                    continue;  // NÃO marca como lido
                }

                const { data: account } = await supabase
                    .from("bank_accounts")
                    .select("id, company_id, auto_conciliacao_policy")
                    .eq("ofx_acctid", parsed.summary.acctId)
                    .eq("is_active", true)
                    .maybeSingle();

                if (!account) {
                    logRow.status = "unmatched_account";
                    logRow.error_detail = `Nenhuma bank_account com ofx_acctid='${parsed.summary.acctId}'`;
                    await supabase.from("email_import_log").insert(logRow);
                    summary.unmatched_account++;
                    continue;  // NÃO marca como lido
                }

                logRow.bank_account_id = account.id;
                logRow.company_id = account.company_id;

                // ── REGRA 2: Empresa precisa estar ativa ──────────────────
                const { data: company } = await supabase
                    .from("companies")
                    .select("is_active")
                    .eq("id", account.company_id)
                    .maybeSingle();
                if ((company as { is_active?: boolean } | null)?.is_active !== true) {
                    logRow.status = "company_inactive";
                    logRow.error_detail = `Empresa is_active=${(company as { is_active?: boolean } | null)?.is_active ?? "desconhecido"}, precisa estar TRUE`;
                    await supabase.from("email_import_log").insert(logRow);
                    summary.errors++;
                    continue;  // NÃO marca como lido
                }

                // ── REGRA 3: Só 1 import 'ok' por conta por dia (timezone BR) ─
                const nowBR = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
                nowBR.setHours(0, 0, 0, 0);
                const { count: importsToday } = await supabase
                    .from("email_import_log")
                    .select("id", { count: "exact", head: true })
                    .eq("bank_account_id", account.id)
                    .eq("status", "ok")
                    .gte("processed_at", nowBR.toISOString());
                if ((importsToday ?? 0) > 0) {
                    logRow.status = "duplicate_today";
                    logRow.error_detail = `Ja houve import 'ok' pra esta conta hoje (${nowBR.toLocaleDateString("pt-BR")}). Aguarde amanha.`;
                    await supabase.from("email_import_log").insert(logRow);
                    summary.errors++;
                    continue;  // NÃO marca como lido — usuario decide o que fazer
                }

                // ── REGRA 1: Continuidade — gap maximo de 7 dias ─────────
                // Cobre fim de semana prolongado e feriados (1º de maio etc).
                // Skip pra primeiro import (sem ultima tx).
                const ofxEarliest = parsed.transactions.reduce<string | null>(
                    (min, tx) => (!min || tx.date < min ? tx.date : min),
                    null
                );
                if (ofxEarliest) {
                    const { data: lastTx } = await supabase
                        .from("bank_transactions")
                        .select("date")
                        .eq("bank_account_id", account.id)
                        .order("date", { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    const lastDate = (lastTx as { date?: string } | null)?.date;
                    if (lastDate) {
                        const lastMs = new Date(lastDate).getTime();
                        const earliestMs = new Date(ofxEarliest).getTime();
                        const daysDiff = Math.floor((earliestMs - lastMs) / 86400000);
                        if (daysDiff > 7) {
                            logRow.status = "continuity_gap";
                            logRow.error_detail = `Gap de ${daysDiff} dias entre ultima tx (${lastDate}) e inicio do OFX (${ofxEarliest}). Importe os dias intermediarios primeiro.`;
                            await supabase.from("email_import_log").insert(logRow);
                            summary.errors++;
                            continue;  // NÃO marca como lido
                        }
                    }
                }

                // Upsert transações (mesma lógica do uploadOFX no front)
                const toInsert = parsed.transactions.map(tx => ({
                    company_id: account.company_id,
                    bank_account_id: account.id,
                    fit_id: tx.fitId,
                    date: tx.date,
                    amount: tx.type === "debit" ? -Math.abs(tx.amount) : Math.abs(tx.amount),
                    description: (tx.description || "").substring(0, 255),
                    memo: (tx.memo || "").substring(0, 255),
                    status: "pending",
                    source: "email_ofx",
                }));

                let inserted = 0;
                const CHUNK = 500;
                for (let i = 0; i < toInsert.length; i += CHUNK) {
                    const chunk = toInsert.slice(i, i + CHUNK);
                    const { data, error } = await supabase
                        .from("bank_transactions")
                        .upsert(chunk, { onConflict: "bank_account_id,fit_id", ignoreDuplicates: true })
                        .select("id");
                    if (error) throw error;
                    inserted += data?.length || 0;
                }
                logRow.transactions_inserted = inserted;

                // Auto-conciliação só se a política da conta permite E houve novas tx
                let autoReconciled = 0;
                if (inserted > 0 && account.auto_conciliacao_policy === "rule_only") {
                    const { data: rpcData, error: rpcErr } = await supabase
                        .rpc("auto_conciliar_extrato", {
                            p_company_id: account.company_id,
                            p_bank_account_id: account.id,
                        });
                    if (rpcErr) {
                        // Não falha o import inteiro — só registra
                        logRow.error_detail = `auto_conciliar_extrato: ${rpcErr.message}`;
                    } else {
                        autoReconciled = (rpcData as { auto_reconciled?: number })?.auto_reconciled ?? 0;
                    }
                }
                logRow.transactions_auto_reconciled = autoReconciled;
                logRow.status = "ok";

                await supabase.from("email_import_log").insert(logRow);
                await markAsRead(accessToken, msg.id);

                summary.imported += inserted;
                summary.auto_reconciled += autoReconciled;
                summary.details.push({
                    id: msg.id,
                    bank_account: account.id,
                    inserted,
                    auto_reconciled: autoReconciled,
                });
            } catch (e) {
                summary.errors++;
                logRow.status = "error";
                logRow.error_detail = String(e);
                await supabase.from("email_import_log").insert(logRow).then(() => {}, () => {});
                summary.details.push({ id: msg.id, error: String(e) });
            }
        }

        return new Response(JSON.stringify(summary), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(
            JSON.stringify({ error: String(e), summary }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
