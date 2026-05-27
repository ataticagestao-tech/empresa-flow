// ============================================================
// disparar-overnight-agendado — Edge Function (Deno)
// Chamada periodicamente (pg_cron a cada 5 min, ou trigger externo).
// Para cada empresa com whatsapp_ativo=true cujo horario_envio caiu
// na janela atual e que ainda nao recebeu o envio hoje (timezone
// America/Sao_Paulo), gera o PDF do Overnight e envia via Evolution
// API para cada destinatario configurado.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
    getCloudConfig,
    isCloudEnabled,
    uploadMedia,
} from "../_shared/whatsapp-cloud.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TZ = "America/Sao_Paulo";
const JANELA_MINUTOS = 5; // tolera atraso de até 5 minutos do cron

interface OvernightConfigRow {
    id: string;
    company_id: string;
    whatsapp_ativo: boolean;
    whatsapp_destinos: string[];
    horario_envio: string; // 'HH:MM:SS'
    whatsapp_mensagem: string | null;
    whatsapp_ultimo_envio_em: string | null;
}

interface DispararRequest {
    /** Força execução para uma empresa específica (botão "enviar teste agora") */
    empresa_id?: string;
    /** Quando true, ignora a checagem de horário/duplicidade do dia */
    forcar?: boolean;
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
        return jsonError("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configuradas", 500);
    }

    let body: DispararRequest = {};
    try {
        body = (await req.json()) as DispararRequest;
    } catch {
        // GET / chamada sem body é válida (cron)
    }

    const service = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
    });

    try {
        // 1. carrega configs candidatas
        let query = service
            .from("overnight_config")
            .select("id, company_id, whatsapp_ativo, whatsapp_destinos, horario_envio, whatsapp_mensagem, whatsapp_ultimo_envio_em")
            .eq("whatsapp_ativo", true)
            .eq("ativa", true);

        if (body.empresa_id) {
            query = query.eq("company_id", body.empresa_id);
        }

        const { data: configs, error: errCfg } = await query;
        if (errCfg) throw errCfg;
        if (!configs || configs.length === 0) {
            return jsonOk({ disparados: 0, motivo: "Nenhuma config elegivel" });
        }

        const agora = nowInTz(TZ);
        const horaAgora = agora.getHours() * 60 + agora.getMinutes();
        const hojeStr = formatYMD(agora);

        const resultados: Array<{
            company_id: string;
            status: "sucesso" | "erro" | "parcial" | "pulado";
            motivo?: string;
            destinos_ok?: string[];
            destinos_erro?: Array<{ phone: string; erro: string }>;
        }> = [];

        for (const cfg of configs as OvernightConfigRow[]) {
            // valida elegibilidade temporal (a menos que forçado)
            if (!body.forcar) {
                const [hh, mm] = cfg.horario_envio.split(":").map(Number);
                const minutoAgendado = hh * 60 + mm;
                const diff = horaAgora - minutoAgendado;
                if (diff < 0 || diff > JANELA_MINUTOS) {
                    resultados.push({ company_id: cfg.company_id, status: "pulado", motivo: `Fora da janela (agendado ${cfg.horario_envio}, agora ${pad(agora.getHours())}:${pad(agora.getMinutes())})` });
                    continue;
                }
                if (cfg.whatsapp_ultimo_envio_em && formatYMD(new Date(cfg.whatsapp_ultimo_envio_em)) === hojeStr) {
                    resultados.push({ company_id: cfg.company_id, status: "pulado", motivo: "Já enviado hoje" });
                    continue;
                }
            }

            const destinos = (cfg.whatsapp_destinos || []).filter((d) => d && d.trim().length > 0);
            if (destinos.length === 0) {
                resultados.push({ company_id: cfg.company_id, status: "pulado", motivo: "Sem destinatários" });
                continue;
            }

            // 2. gera o PDF
            const gerar = await fetch(`${supabaseUrl}/functions/v1/gerar-overnight-pdf`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${serviceRoleKey}`,
                    apikey: serviceRoleKey,
                },
                body: JSON.stringify({ empresa_id: cfg.company_id, origem: "agendado" }),
            });
            const gerarBody: any = await gerar.json();
            if (!gerar.ok || !gerarBody?.pdfBase64) {
                const erro = gerarBody?.erro || `Falha ao gerar PDF (${gerar.status})`;
                await marcarFalha(service, cfg, erro);
                resultados.push({ company_id: cfg.company_id, status: "erro", motivo: erro });
                continue;
            }

            const fileName = `overnight-${hojeStr}.pdf`;
            const legendaPadrao = cfg.whatsapp_mensagem?.trim() ||
                `Bom fechamento de dia. Segue o Overnight de ${formatBR(agora)}.`;

            // 3. nome da empresa (pro template Cloud)
            const { data: companyData } = await service
                .from("companies")
                .select("nome_fantasia, razao_social")
                .eq("id", cfg.company_id)
                .maybeSingle();
            const nomeEmpresa =
                (companyData as any)?.nome_fantasia ||
                (companyData as any)?.razao_social ||
                "sua empresa";

            // 4. Se Cloud ativado, faz upload do PDF uma vez e reusa media_id
            //    (a Meta exige template + DOCUMENT header pra mensagens proativas)
            let cloudMediaId: string | null = null;
            let cloudUploadError: string | null = null;
            if (isCloudEnabled()) {
                const cfgCloud = getCloudConfig();
                if (!cfgCloud) {
                    cloudUploadError = "WhatsApp Cloud nao configurado (secrets faltando)";
                } else {
                    const up = await uploadMedia(
                        cfgCloud,
                        gerarBody.pdfBase64,
                        fileName,
                        "application/pdf",
                    );
                    if (!up.ok) cloudUploadError = up.error ?? "Upload PDF falhou";
                    else cloudMediaId = up.mediaId ?? null;
                }
            }

            // 5. envia para cada destinatário
            const okList: string[] = [];
            const errList: Array<{ phone: string; erro: string }> = [];

            for (const phone of destinos) {
                if (cloudUploadError) {
                    errList.push({ phone, erro: cloudUploadError });
                    continue;
                }

                const reqBody: Record<string, unknown> = isCloudEnabled() && cloudMediaId
                    ? {
                          phone,
                          template: {
                              name: "overnight_diario",
                              languageCode: "pt_BR",
                              bodyParams: [nomeEmpresa, formatBR(agora)],
                              headerDocumentMediaId: cloudMediaId,
                              headerDocumentFilename: fileName,
                          },
                      }
                    : {
                          phone,
                          mediaBase64: gerarBody.pdfBase64,
                          fileName,
                          mimeType: "application/pdf",
                          caption: legendaPadrao,
                      };

                const r = await fetch(`${supabaseUrl}/functions/v1/enviar-whatsapp`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${serviceRoleKey}`,
                        apikey: serviceRoleKey,
                    },
                    body: JSON.stringify(reqBody),
                });
                const rBody: any = await r.json().catch(() => ({}));
                if (r.ok && rBody?.ok !== false) {
                    okList.push(rBody?.phone || phone);
                } else {
                    errList.push({ phone, erro: rBody?.error || `HTTP ${r.status}` });
                }
            }

            // 4. atualiza status + log
            const status: "sucesso" | "erro" | "parcial" =
                okList.length === destinos.length ? "sucesso" :
                okList.length === 0 ? "erro" : "parcial";

            await service.from("overnight_config").update({
                whatsapp_ultimo_envio_em: new Date().toISOString(),
                whatsapp_ultimo_envio_status: status,
                whatsapp_ultimo_envio_erro: errList.length > 0 ? errList.map(e => `${e.phone}: ${e.erro}`).join(" | ").slice(0, 500) : null,
            }).eq("id", cfg.id);

            await service.from("overnight_logs").insert({
                company_id: cfg.company_id,
                status: status === "sucesso" ? "sucesso" : "erro",
                origem: "whatsapp",
                destinos_enviados: okList,
                erro_descricao: errList.length > 0 ? errList.map(e => `${e.phone}: ${e.erro}`).join(" | ").slice(0, 500) : null,
            });

            resultados.push({
                company_id: cfg.company_id,
                status,
                destinos_ok: okList,
                destinos_erro: errList,
            });
        }

        return jsonOk({ disparados: resultados.length, resultados });
    } catch (err: any) {
        return jsonError(err?.message || String(err), 500);
    }
});

// ── helpers ───────────────────────────────────────────────────

function jsonOk(payload: Record<string, unknown>) {
    return new Response(JSON.stringify({ ok: true, ...payload }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}
function jsonError(msg: string, status: number) {
    return new Response(JSON.stringify({ ok: false, erro: msg }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

async function marcarFalha(
    service: ReturnType<typeof createClient>,
    cfg: OvernightConfigRow,
    erro: string,
) {
    await service.from("overnight_config").update({
        whatsapp_ultimo_envio_em: new Date().toISOString(),
        whatsapp_ultimo_envio_status: "erro",
        whatsapp_ultimo_envio_erro: erro.slice(0, 500),
    }).eq("id", cfg.id);
    await service.from("overnight_logs").insert({
        company_id: cfg.company_id,
        status: "erro",
        origem: "whatsapp",
        erro_descricao: erro.slice(0, 500),
    });
}

/** Retorna um Date cujos getters (getHours, getDate, ...) refletem a hora local no TZ informado */
function nowInTz(tz: string): Date {
    const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz, hour12: false,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const parts = fmt.formatToParts(new Date()).reduce<Record<string, string>>((acc, p) => {
        if (p.type !== "literal") acc[p.type] = p.value;
        return acc;
    }, {});
    return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`);
}

function formatYMD(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function formatBR(d: Date): string {
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function pad(n: number): string {
    return String(n).padStart(2, "0");
}
