// solicitar-cadastro
// Cria uma solicitacao de cadastro automatico e dispara mensagem inicial via WhatsApp.
//
// Fluxo:
// 1. Valida payload + auth do usuario (JWT)
// 2. Verifica que usuario tem acesso a company_id informado
// 3. Carrega registro existente (se employee_id/supplier_id) pra computar campos faltando
// 4. Insere row em cadastro_solicitacoes (status=aguardando_envio)
// 5. Renderiza template e dispara via enviar-whatsapp
// 6. Registra mensagem em cadastro_mensagens (direcao=enviada)
// 7. Atualiza status -> enviado

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { normalizePhone } from "../_shared/phone.ts";
import {
    renderTemplateInicial,
    camposObrigatoriosDefault,
    camposPedidosDefault,
    camposFaltandoDoRegistro,
} from "../_shared/templates-cadastro.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

interface SolicitarCadastroRequest {
    company_id: string;
    tipo: "funcionario" | "fornecedor";
    employee_id?: string | null;
    supplier_id?: string | null;
    nome: string;
    telefone: string;
    /** Override dos campos a pedir (default: todos os do tipo) */
    campos_pedidos?: string[];
    /** Override dos campos obrigatorios (default: cpf ou cnpj) */
    campos_obrigatorios?: string[];
    /** Pre-valida que numero existe no WhatsApp antes de enviar (default: true) */
    pre_validar_whatsapp?: boolean;
    /** Permite destinatario pular campos opcionais (default: true) */
    permite_skip?: boolean;
    /** Template customizado (sobrescreve o default) */
    template_customizado?: string;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get("authorization");
        if (!authHeader) return jsonResponse({ error: "Authorization header obrigatorio" }, 401);

        const payload = (await req.json()) as SolicitarCadastroRequest;
        const {
            company_id,
            tipo,
            employee_id,
            supplier_id,
            nome,
            telefone,
            campos_pedidos,
            campos_obrigatorios,
            pre_validar_whatsapp = true,
            permite_skip = true,
            template_customizado,
        } = payload;

        // ---- Validacao basica ----
        if (!company_id) return jsonResponse({ error: "company_id obrigatorio" }, 400);
        if (!tipo || !["funcionario", "fornecedor"].includes(tipo)) {
            return jsonResponse({ error: "tipo deve ser 'funcionario' ou 'fornecedor'" }, 400);
        }
        if (!nome || nome.trim().length === 0) return jsonResponse({ error: "nome obrigatorio" }, 400);
        if (!telefone) return jsonResponse({ error: "telefone obrigatorio" }, 400);

        if (tipo === "funcionario" && supplier_id) {
            return jsonResponse({ error: "supplier_id nao permitido com tipo=funcionario" }, 400);
        }
        if (tipo === "fornecedor" && employee_id) {
            return jsonResponse({ error: "employee_id nao permitido com tipo=fornecedor" }, 400);
        }

        // ---- Normaliza telefone ----
        const telefoneNormalizado = normalizePhone(telefone);
        if (!telefoneNormalizado) {
            return jsonResponse(
                { error: `Telefone invalido: ${telefone}. Use DDD + numero (ex: 11999998888).` },
                400,
            );
        }

        // ---- Verifica que usuario tem acesso a company_id ----
        const userClient = createClient(SUPABASE_URL, ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
            auth: { persistSession: false },
        });

        const { data: userData, error: userErr } = await userClient.auth.getUser();
        if (userErr || !userData?.user) {
            return jsonResponse({ error: "Token invalido ou expirado" }, 401);
        }
        const userId = userData.user.id;

        const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

        const { data: acesso } = await service
            .from("user_companies")
            .select("company_id")
            .eq("user_id", userId)
            .eq("company_id", company_id)
            .maybeSingle();

        if (!acesso) {
            return jsonResponse({ error: "Sem acesso a essa empresa" }, 403);
        }

        // ---- Carrega registro existente (se houver) pra computar campos faltando ----
        let registroExistente: Record<string, any> | null = null;
        if (employee_id) {
            const { data } = await service
                .from("employees")
                .select("*")
                .eq("id", employee_id)
                .eq("company_id", company_id)
                .maybeSingle();
            registroExistente = data;
            if (!registroExistente) {
                return jsonResponse({ error: `Funcionario ${employee_id} nao encontrado` }, 404);
            }
        } else if (supplier_id) {
            const { data } = await service
                .from("suppliers")
                .select("*")
                .eq("id", supplier_id)
                .eq("company_id", company_id)
                .maybeSingle();
            registroExistente = data;
            if (!registroExistente) {
                return jsonResponse({ error: `Fornecedor ${supplier_id} nao encontrado` }, 404);
            }
        }

        // ---- Carrega nome da empresa pra usar no template ----
        const { data: companyData } = await service
            .from("companies")
            .select("nome_fantasia, razao_social")
            .eq("id", company_id)
            .maybeSingle();
        const nomeEmpresa =
            companyData?.nome_fantasia || companyData?.razao_social || "sua empresa";

        // ---- Computa campos faltando ----
        const camposParaPedir = campos_pedidos ?? camposPedidosDefault(tipo);
        const obrigatorios = campos_obrigatorios ?? camposObrigatoriosDefault(tipo);

        let camposFaltando: string[];
        if (registroExistente) {
            // Atualizar: pede so o que falta
            const faltandoNoRegistro = camposFaltandoDoRegistro(tipo, registroExistente);
            camposFaltando = camposParaPedir.filter((c) => faltandoNoRegistro.includes(c));
            // Se nao falta nada, ainda assim respeita override de campos_pedidos
            if (camposFaltando.length === 0) {
                return jsonResponse(
                    {
                        error: "Cadastro ja esta completo, nada para solicitar",
                        registro_atual: { id: employee_id ?? supplier_id, ...registroExistente },
                    },
                    400,
                );
            }
        } else {
            // Novo cadastro: pede tudo
            camposFaltando = camposParaPedir;
        }

        // ---- Verifica que nao tem solicitacao ativa duplicada ----
        const { data: existente } = await service
            .from("cadastro_solicitacoes")
            .select("id, status")
            .eq("company_id", company_id)
            .eq("telefone", telefoneNormalizado)
            .in("status", ["aguardando_envio", "enviado", "em_conversa"])
            .maybeSingle();

        if (existente) {
            return jsonResponse(
                {
                    error: "Ja existe solicitacao ativa para esse telefone nesta empresa",
                    solicitacao_id: existente.id,
                    status: existente.status,
                },
                409,
            );
        }

        // ---- (Opcional) Pre-valida que numero existe no WhatsApp ----
        if (pre_validar_whatsapp) {
            try {
                const validarResp = await fetch(
                    `${SUPABASE_URL}/functions/v1/validar-whatsapp`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${SERVICE_KEY}`,
                        },
                        body: JSON.stringify({ phone: telefoneNormalizado }),
                    },
                );
                const validacao = await validarResp.json();
                if (validacao?.ok && validacao?.exists === false) {
                    return jsonResponse(
                        {
                            error: "Numero nao tem WhatsApp ativo",
                            telefone: telefoneNormalizado,
                            detalhes: validacao,
                        },
                        400,
                    );
                }
                // Se a validacao falhar (api_error), prossegue mesmo assim (fail-open)
            } catch (e) {
                console.warn("[solicitar-cadastro] validar-whatsapp falhou, prosseguindo:", e);
            }
        }

        // ---- Insere solicitacao ----
        const { data: solicitacao, error: insertErr } = await service
            .from("cadastro_solicitacoes")
            .insert({
                company_id,
                tipo,
                employee_id: employee_id ?? null,
                supplier_id: supplier_id ?? null,
                nome_destinatario: nome.trim(),
                telefone: telefoneNormalizado,
                status: "aguardando_envio",
                campos_obrigatorios: obrigatorios,
                campos_faltando: camposFaltando,
                permite_skip,
                criado_por: userId,
            })
            .select()
            .single();

        if (insertErr || !solicitacao) {
            return jsonResponse(
                { error: "Falha ao criar solicitacao", details: insertErr?.message },
                500,
            );
        }

        // ---- Renderiza template ----
        const mensagemTexto = template_customizado ?? renderTemplateInicial({
            tipo,
            nome_destinatario: nome.trim(),
            nome_empresa: nomeEmpresa,
            campos_faltando: camposFaltando,
            permite_skip,
        });

        // ---- Dispara via enviar-whatsapp ----
        const sendResp = await fetch(`${SUPABASE_URL}/functions/v1/enviar-whatsapp`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SERVICE_KEY}`,
            },
            body: JSON.stringify({
                phone: telefoneNormalizado,
                text: mensagemTexto,
            }),
        });

        const sendData = await sendResp.json();

        if (!sendResp.ok) {
            // Rollback: deleta a solicitacao se nao conseguimos enviar
            await service.from("cadastro_solicitacoes").delete().eq("id", solicitacao.id);
            return jsonResponse(
                {
                    error: "Falha ao enviar WhatsApp",
                    details: sendData?.error || sendData,
                },
                502,
            );
        }

        // ---- Registra mensagem enviada ----
        await service.from("cadastro_mensagens").insert({
            solicitacao_id: solicitacao.id,
            direcao: "enviada",
            conteudo: mensagemTexto,
            evolution_message_id: sendData?.response?.key?.id ?? null,
        });

        // ---- Atualiza status -> enviado ----
        const { data: solicitacaoFinal } = await service
            .from("cadastro_solicitacoes")
            .update({ status: "enviado" })
            .eq("id", solicitacao.id)
            .select()
            .single();

        return jsonResponse({
            ok: true,
            solicitacao: solicitacaoFinal ?? solicitacao,
            telefone: telefoneNormalizado,
            campos_faltando: camposFaltando,
            mensagem_enviada: mensagemTexto,
        });
    } catch (err: any) {
        console.error("[solicitar-cadastro] erro:", err);
        return jsonResponse({ error: err?.message || String(err) }, 500);
    }
});
