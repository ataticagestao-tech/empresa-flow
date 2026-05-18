// cadastro-aprovar
// Aplica os dados de uma solicitacao aprovada em employees ou suppliers.
//
// Fluxo:
//   1. Valida que solicitacao esta em pronto_aprovacao ou requer_revisao
//   2. Funde dados_extraidos + dados_editados (admin pode editar antes)
//   3. Se employee_id/supplier_id existe -> UPDATE
//      Senao -> INSERT (cadastro novo)
//   4. Move documentos do storage de cadastros/{id}/ pra funcionarios/{id}/ ou fornecedores/{id}/
//   5. Marca solicitacao como aprovado + auditoria
//   6. (Opcional) Envia confirmacao WhatsApp pro destinatario

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

interface AprovarRequest {
    solicitacao_id: string;
    /** Override de campos antes de aplicar (admin pode editar) */
    dados_editados?: Record<string, any>;
    /** Confirma criacao se cadastro novo (sem employee_id/supplier_id) */
    confirmar_criacao?: boolean;
    /** Envia mensagem de confirmacao no WhatsApp (default true) */
    notificar_destinatario?: boolean;
    observacao?: string;
}

// Mapeia campos do "dominio cadastro" para colunas das tabelas alvo
function mapearParaEmployee(dados: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    if (isValid(dados.nome_completo)) out.name = dados.nome_completo;
    if (isValid(dados.cpf)) out.cpf = dados.cpf;
    if (isValid(dados.rg)) out.rg = dados.rg;
    if (isValid(dados.data_nascimento)) out.data_nascimento = dados.data_nascimento;
    if (isValid(dados.email)) out.email = dados.email;
    if (isValid(dados.telefone)) out.phone = dados.telefone;
    if (isValid(dados.pis)) out.pis = dados.pis;

    if (isValidObj(dados.pix)) {
        out.chave_pix_folha = dados.pix.chave;
    }
    if (isValidObj(dados.banco)) {
        if (dados.banco.codigo || dados.banco.nome) out.banco_folha = dados.banco.nome ?? dados.banco.codigo;
        if (dados.banco.agencia) out.agencia_folha = dados.banco.agencia;
        if (dados.banco.conta) out.conta_folha = dados.banco.conta;
        if (dados.banco.tipo) out.tipo_conta_folha = dados.banco.tipo;
    }
    return out;
}

function mapearParaSupplier(dados: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    if (isValid(dados.cnpj) || isValid(dados.cpf)) {
        out.cpf_cnpj = (dados.cnpj || dados.cpf);
        out.tipo_pessoa = isValid(dados.cnpj) ? "PJ" : "PF";
    }
    if (isValid(dados.razao_social)) out.razao_social = dados.razao_social;
    if (isValid(dados.nome_fantasia)) out.nome_fantasia = dados.nome_fantasia;
    if (isValid(dados.email)) out.email = dados.email;
    if (isValid(dados.telefone)) out.telefone = dados.telefone;

    if (isValidObj(dados.endereco)) {
        const e = dados.endereco;
        if (e.cep) out.endereco_cep = String(e.cep).replace(/\D/g, "");
        if (e.logradouro) out.endereco_logradouro = e.logradouro;
        if (e.numero) out.endereco_numero = String(e.numero);
        if (e.complemento) out.endereco_complemento = e.complemento;
        if (e.bairro) out.endereco_bairro = e.bairro;
        if (e.cidade) out.endereco_cidade = e.cidade;
        if (e.uf) out.endereco_estado = e.uf;
    }
    if (isValidObj(dados.pix)) {
        out.dados_bancarios_pix = dados.pix.chave;
    }
    if (isValidObj(dados.banco)) {
        if (dados.banco.codigo || dados.banco.nome) out.dados_bancarios_banco = dados.banco.nome ?? dados.banco.codigo;
        if (dados.banco.agencia) out.dados_bancarios_agencia = dados.banco.agencia;
        if (dados.banco.conta) out.dados_bancarios_conta = dados.banco.conta;
        if (dados.banco.tipo) out.dados_bancarios_tipo = dados.banco.tipo;
    }
    return out;
}

function isValid(v: any): boolean {
    return v !== null && v !== undefined && v !== "" && v !== "__pulado__" && v !== "__falhou__";
}

function isValidObj(v: any): boolean {
    return v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length > 0
        && v !== "__pulado__" && v !== "__falhou__";
}

async function moverDocumentos(
    service: any,
    companyId: string,
    solicitacaoId: string,
    tipoAlvo: "funcionarios" | "fornecedores",
    targetId: string,
): Promise<string[]> {
    const movedPaths: string[] = [];
    try {
        const srcPrefix = `${companyId}/cadastros/${solicitacaoId}`;
        const { data: files } = await service.storage
            .from("documentos")
            .list(srcPrefix, { limit: 100 });

        if (!files || files.length === 0) return [];

        for (const f of files) {
            const srcPath = `${srcPrefix}/${f.name}`;
            const destPath = `${companyId}/${tipoAlvo}/${targetId}/${f.name}`;
            const { error } = await service.storage
                .from("documentos")
                .move(srcPath, destPath);
            if (!error) {
                movedPaths.push(destPath);
                // Atualiza referencia em cadastro_mensagens
                await service
                    .from("cadastro_mensagens")
                    .update({ media_path: destPath })
                    .eq("solicitacao_id", solicitacaoId)
                    .eq("media_path", srcPath);
            } else {
                console.error("[cadastro-aprovar] move falhou:", srcPath, error.message);
            }
        }
    } catch (e: any) {
        console.error("[cadastro-aprovar] erro moverDocumentos:", e?.message);
    }
    return movedPaths;
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const authHeader = req.headers.get("authorization");
        if (!authHeader) return jsonResponse({ error: "Authorization header obrigatorio" }, 401);

        const {
            solicitacao_id,
            dados_editados,
            confirmar_criacao = false,
            notificar_destinatario = true,
            observacao,
        } = (await req.json()) as AprovarRequest;

        if (!solicitacao_id) return jsonResponse({ error: "solicitacao_id obrigatorio" }, 400);

        const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

        // ---- Valida user + acesso ----
        const userClient = createClient(SUPABASE_URL, ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
            auth: { persistSession: false },
        });
        const { data: userData } = await userClient.auth.getUser();
        if (!userData?.user) return jsonResponse({ error: "Token invalido" }, 401);
        const userId = userData.user.id;

        // ---- Carrega solicitacao ----
        const { data: solicitacao, error: solErr } = await service
            .from("cadastro_solicitacoes")
            .select("*")
            .eq("id", solicitacao_id)
            .maybeSingle();

        if (solErr || !solicitacao) {
            return jsonResponse({ error: "Solicitacao nao encontrada" }, 404);
        }

        // ---- Valida acesso a company ----
        const { data: acesso } = await service
            .from("user_companies")
            .select("company_id")
            .eq("user_id", userId)
            .eq("company_id", solicitacao.company_id)
            .maybeSingle();
        if (!acesso) return jsonResponse({ error: "Sem acesso a essa empresa" }, 403);

        // ---- Valida status ----
        if (!["pronto_aprovacao", "requer_revisao", "em_conversa", "enviado"].includes(solicitacao.status)) {
            return jsonResponse(
                { error: `Status ${solicitacao.status} nao permite aprovacao` },
                409,
            );
        }

        // ---- Funde dados ----
        const dadosFinais = { ...(solicitacao.dados_extraidos ?? {}), ...(dados_editados ?? {}) };

        // ---- Decide INSERT vs UPDATE ----
        let alvoId: string | null = solicitacao.employee_id ?? solicitacao.supplier_id ?? null;
        let acaoRealizada: "insert" | "update";

        if (solicitacao.tipo === "funcionario") {
            const colunas = mapearParaEmployee(dadosFinais);
            if (!colunas.cpf && !solicitacao.employee_id) {
                return jsonResponse({ error: "CPF obrigatorio para criar funcionario" }, 400);
            }

            if (solicitacao.employee_id) {
                const { error } = await service
                    .from("employees")
                    .update(colunas)
                    .eq("id", solicitacao.employee_id)
                    .eq("company_id", solicitacao.company_id);
                if (error) return jsonResponse({ error: "Falha ao atualizar funcionario", details: error.message }, 500);
                acaoRealizada = "update";
            } else {
                if (!confirmar_criacao) {
                    return jsonResponse({ error: "confirmar_criacao=true obrigatorio para criar funcionario novo" }, 400);
                }
                const { data: novo, error } = await service
                    .from("employees")
                    .insert({
                        company_id: solicitacao.company_id,
                        name: colunas.name ?? solicitacao.nome_destinatario,
                        ...colunas,
                        status: "ativo",
                    })
                    .select()
                    .single();
                if (error || !novo) return jsonResponse({ error: "Falha ao criar funcionario", details: error?.message }, 500);
                alvoId = novo.id;
                acaoRealizada = "insert";
            }

            // Move documentos
            if (alvoId) {
                await moverDocumentos(service, solicitacao.company_id, solicitacao_id, "funcionarios", alvoId);
            }
        } else {
            // FORNECEDOR
            const colunas = mapearParaSupplier(dadosFinais);
            if (!colunas.cpf_cnpj && !solicitacao.supplier_id) {
                return jsonResponse({ error: "CNPJ obrigatorio para criar fornecedor" }, 400);
            }

            if (solicitacao.supplier_id) {
                const { error } = await service
                    .from("suppliers")
                    .update(colunas)
                    .eq("id", solicitacao.supplier_id)
                    .eq("company_id", solicitacao.company_id);
                if (error) return jsonResponse({ error: "Falha ao atualizar fornecedor", details: error.message }, 500);
                acaoRealizada = "update";
            } else {
                if (!confirmar_criacao) {
                    return jsonResponse({ error: "confirmar_criacao=true obrigatorio para criar fornecedor novo" }, 400);
                }
                const { data: novo, error } = await service
                    .from("suppliers")
                    .insert({
                        company_id: solicitacao.company_id,
                        razao_social: colunas.razao_social ?? solicitacao.nome_destinatario,
                        ...colunas,
                        is_active: true,
                    })
                    .select()
                    .single();
                if (error || !novo) return jsonResponse({ error: "Falha ao criar fornecedor", details: error?.message }, 500);
                alvoId = novo.id;
                acaoRealizada = "insert";
            }

            if (alvoId) {
                await moverDocumentos(service, solicitacao.company_id, solicitacao_id, "fornecedores", alvoId);
            }
        }

        // ---- Marca solicitacao como aprovada ----
        const updates: Record<string, any> = {
            status: "aprovado",
            aprovado_por: userId,
            aprovado_em: new Date().toISOString(),
        };
        if (observacao) updates.observacao_admin = observacao;
        if (solicitacao.tipo === "funcionario" && !solicitacao.employee_id && alvoId) {
            updates.employee_id = alvoId;
        }
        if (solicitacao.tipo === "fornecedor" && !solicitacao.supplier_id && alvoId) {
            updates.supplier_id = alvoId;
        }

        await service.from("cadastro_solicitacoes").update(updates).eq("id", solicitacao_id);

        // ---- Notifica destinatario via WhatsApp ----
        if (notificar_destinatario) {
            try {
                await fetch(`${SUPABASE_URL}/functions/v1/enviar-whatsapp`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${SERVICE_KEY}`,
                    },
                    body: JSON.stringify({
                        phone: solicitacao.telefone,
                        text: "✅ Seu cadastro foi confirmado. Obrigado!",
                    }),
                });
                await service.from("cadastro_mensagens").insert({
                    solicitacao_id,
                    direcao: "enviada",
                    conteudo: "✅ Seu cadastro foi confirmado. Obrigado!",
                });
            } catch (e) {
                console.error("[cadastro-aprovar] falha notificar:", e);
            }
        }

        return jsonResponse({
            ok: true,
            solicitacao_id,
            acao: acaoRealizada,
            alvo_id: alvoId,
            tipo: solicitacao.tipo,
        });
    } catch (err: any) {
        console.error("[cadastro-aprovar] erro:", err);
        return jsonResponse({ error: err?.message || String(err) }, 500);
    }
});
