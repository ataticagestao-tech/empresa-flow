// cadastro-processor
// Processa mensagens recebidas via WhatsApp em solicitacoes ativas de cadastro.
//
// Wave 2.1: suporte a TEXTO (mensagens de texto puro).
// Wave 2.2: vai adicionar suporte a IMAGEM/PDF (vision).
//
// Chamado por: agente-orquestrador (quando detecta sender com solicitacao ativa)
//              OU diretamente pra testes/replay.
//
// Pipeline:
//   1. Carrega solicitacao + contexto (mensagens recentes, estado)
//   2. Insere mensagem recebida em cadastro_mensagens
//   3. Extrai dados via Claude API (texto -> JSON estruturado)
//   4. Valida cada campo
//   5. Decide proximo passo (perguntar / aceitar / escalar)
//   6. Envia resposta via enviar-whatsapp
//   7. Atualiza estado da solicitacao

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
    validarCPF,
    validarCNPJ,
    validarCEP,
    validarEmail,
    validarDataNascimento,
    detectarTipoPix,
} from "../_shared/validators.ts";
import {
    perguntaPorCampo,
    mensagemConclusaoSucesso,
    mensagemRequerRevisao,
    mensagemCampoObrigatorio,
} from "../_shared/templates-cadastro.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const CLAUDE_MODEL = Deno.env.get("CLAUDE_MODEL_CADASTRO") ?? "claude-haiku-4-5-20251001";

const MAX_TENTATIVAS_POR_CAMPO = 2;

interface ProcessorRequest {
    solicitacao_id: string;
    message: {
        type: "text" | "image" | "document" | "audio" | "video";
        text?: string;
        media_base64?: string;
        media_url?: string;
        mime?: string;
        evolution_message_id?: string;
    };
}

// =====================================================================
// Helpers
// =====================================================================

function montarPromptExtracao(args: {
    tipo: "funcionario" | "fornecedor";
    campos_faltando: string[];
    dados_extraidos: Record<string, any>;
    ultima_pergunta: string | null;
    texto_mensagem: string;
}): string {
    const camposEsperados = args.tipo === "funcionario"
        ? "nome_completo, cpf, rg, data_nascimento, endereco, pix, banco, email, pis"
        : "cnpj, razao_social, nome_fantasia, endereco, email, telefone, pix, banco";

    return `Você é um extrator de dados cadastrais brasileiro. Analise a mensagem do WhatsApp (texto E/OU documento anexo: foto do RG/CNH/comprovante de residência/cartão CNPJ, ou PDF) e extraia APENAS os campos pedidos. Retorne JSON estrito (sem markdown, sem comentários, sem explicações).

CONTEXTO:
- Tipo de cadastro: ${args.tipo}
- Campos esperados: ${camposEsperados}
- Campos que ainda faltam: ${args.campos_faltando.join(", ") || "nenhum"}
- Dados já coletados: ${JSON.stringify(args.dados_extraidos)}
- Última pergunta que enviei: ${args.ultima_pergunta ? `"${args.ultima_pergunta}"` : "(nenhuma — esta é a 1ª resposta após template inicial)"}

MENSAGEM DO DESTINATÁRIO:
"""
${args.texto_mensagem}
"""

SE HOUVER DOCUMENTO ANEXO (imagem/PDF):
- Combine informações do texto E do documento (texto tem prioridade quando conflita)
- RG/CNH: extraia nome_completo, cpf, rg, data_nascimento, e (se houver) endereco
- Comprovante de residência: extraia endereco completo
- Cartão CNPJ: extraia cnpj, razao_social, nome_fantasia, endereco
- Cartão do banco / extrato: extraia banco

REGRAS:
- CPF: 11 dígitos, retorne APENAS dígitos (sem pontos/traços)
- CNPJ: 14 dígitos, retorne APENAS dígitos
- RG: como está na mensagem (formato livre)
- data_nascimento: formato ISO YYYY-MM-DD (converta de qualquer formato)
- endereco: objeto {logradouro, numero, complemento, bairro, cidade, uf, cep}
- pix: objeto {tipo, chave} onde tipo ∈ {cpf, cnpj, email, telefone, aleatoria}
- banco: objeto {codigo, nome, agencia, conta, tipo} onde tipo ∈ {corrente, poupanca}
- telefone: apenas dígitos
- email: minúsculo, sem espaços
- Se a pessoa disse "não sei", "pular", "skip", "passar", "não tenho", retorne "SKIP" para o campo correspondente
- Se a mensagem é uma resposta direta à última pergunta, atribua o conteúdo ao campo da pergunta (mesmo sem label)
- Se a mensagem NÃO menciona um campo, retorne null (NÃO invente/infira)
- Tente extrair o máximo possível de uma única mensagem (se vier o template completo preenchido)

RETORNE APENAS ESTE JSON (omita chaves que vierem null se preferir):

{
  "nome_completo": null,
  "cpf": null,
  "rg": null,
  "data_nascimento": null,
  "endereco": null,
  "pix": null,
  "banco": null,
  "email": null,
  "telefone": null,
  "pis": null,
  "cnpj": null,
  "razao_social": null,
  "nome_fantasia": null
}`;
}

/** Bloco de conteudo Claude (text/image/document) */
type ClaudeContentBlock =
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
    | { type: "document"; source: { type: "base64"; media_type: string; data: string } };

async function chamarClaudeExtracao(content: string | ClaudeContentBlock[]): Promise<any> {
    const messageContent = typeof content === "string"
        ? [{ type: "text" as const, text: content }]
        : content;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: 2048,
            messages: [{ role: "user", content: messageContent }],
        }),
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Claude API ${resp.status}: ${errText}`);
    }

    const result = await resp.json();
    const text = result?.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Claude nao retornou JSON valido");

    return JSON.parse(jsonMatch[0]);
}

/** Baixa mídia da URL e converte para base64 (Evolution API serve via URL) */
async function baixarMediaBase64(url: string): Promise<{ base64: string; mime: string }> {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Falha ao baixar midia: ${resp.status}`);
    const mime = resp.headers.get("content-type") ?? "application/octet-stream";
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    // btoa nao suporta strings longas com chars >0xff — converte manualmente
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return { base64: btoa(binary), mime };
}

/** Faz upload do documento pro Storage e retorna o path */
async function uploadDocumento(
    service: any,
    companyId: string,
    solicitacaoId: string,
    base64: string,
    mime: string,
): Promise<string | null> {
    try {
        const ext = mimeToExt(mime);
        const ts = Date.now();
        const path = `${companyId}/cadastros/${solicitacaoId}/${ts}.${ext}`;

        // Converte base64 -> Uint8Array
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const { error } = await service.storage
            .from("documentos")
            .upload(path, bytes, { contentType: mime, upsert: false });

        if (error) {
            console.error("[cadastro-processor] upload falhou:", error.message);
            return null;
        }
        return path;
    } catch (e) {
        console.error("[cadastro-processor] erro upload:", e);
        return null;
    }
}

function mimeToExt(mime: string): string {
    if (mime.includes("pdf")) return "pdf";
    if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
    if (mime.includes("png")) return "png";
    if (mime.includes("webp")) return "webp";
    if (mime.includes("gif")) return "gif";
    return "bin";
}

interface ValidacaoResult {
    valido: boolean;
    valor_normalizado: any;
    mensagem_erro?: string;
}

function validarCampo(campo: string, valor: any): ValidacaoResult {
    if (valor === null || valor === undefined) {
        return { valido: false, valor_normalizado: null, mensagem_erro: "vazio" };
    }
    if (valor === "SKIP") {
        return { valido: true, valor_normalizado: "__pulado__" };
    }

    switch (campo) {
        case "cpf": {
            const digits = String(valor).replace(/\D/g, "");
            if (validarCPF(digits)) return { valido: true, valor_normalizado: digits };
            return { valido: false, valor_normalizado: null, mensagem_erro: "CPF inválido" };
        }
        case "cnpj": {
            const digits = String(valor).replace(/\D/g, "");
            if (validarCNPJ(digits)) return { valido: true, valor_normalizado: digits };
            return { valido: false, valor_normalizado: null, mensagem_erro: "CNPJ inválido" };
        }
        case "data_nascimento": {
            const r = validarDataNascimento(String(valor));
            if (r.valido) return { valido: true, valor_normalizado: r.iso };
            return { valido: false, valor_normalizado: null, mensagem_erro: "data inválida" };
        }
        case "email": {
            if (validarEmail(String(valor))) {
                return { valido: true, valor_normalizado: String(valor).trim().toLowerCase() };
            }
            return { valido: false, valor_normalizado: null, mensagem_erro: "email inválido" };
        }
        case "endereco": {
            // Aceita se tem pelo menos logradouro + cidade
            const e = typeof valor === "object" ? valor : null;
            if (!e) return { valido: false, valor_normalizado: null, mensagem_erro: "endereço incompleto" };
            const temBasico = e.logradouro && e.cidade;
            if (!temBasico) {
                return { valido: false, valor_normalizado: null, mensagem_erro: "preciso pelo menos rua e cidade" };
            }
            // CEP opcional, mas se vier valida
            if (e.cep && !validarCEP(e.cep)) {
                return { valido: false, valor_normalizado: null, mensagem_erro: "CEP inválido" };
            }
            return { valido: true, valor_normalizado: e };
        }
        case "pix": {
            const p = typeof valor === "object" ? valor : null;
            if (!p?.chave) return { valido: false, valor_normalizado: null, mensagem_erro: "chave PIX vazia" };
            const det = detectarTipoPix(p.chave);
            if (!det.valido) {
                return { valido: false, valor_normalizado: null, mensagem_erro: "chave PIX em formato inválido" };
            }
            return {
                valido: true,
                valor_normalizado: { tipo: det.tipo, chave: det.chave_normalizada },
            };
        }
        case "banco": {
            const b = typeof valor === "object" ? valor : null;
            if (!b) return { valido: false, valor_normalizado: null, mensagem_erro: "dados bancários vazios" };
            // Aceita se tem agencia + conta (banco opcional)
            if (!b.agencia || !b.conta) {
                return { valido: false, valor_normalizado: null, mensagem_erro: "preciso agência e conta" };
            }
            return { valido: true, valor_normalizado: b };
        }
        case "telefone": {
            const digits = String(valor).replace(/\D/g, "");
            if (digits.length < 10 || digits.length > 13) {
                return { valido: false, valor_normalizado: null, mensagem_erro: "telefone inválido" };
            }
            return { valido: true, valor_normalizado: digits };
        }
        default: {
            // nome_completo, rg, razao_social, nome_fantasia, pis — aceita texto
            const s = String(valor).trim();
            if (s.length < 2) {
                return { valido: false, valor_normalizado: null, mensagem_erro: "muito curto" };
            }
            return { valido: true, valor_normalizado: s };
        }
    }
}

// =====================================================================
// Server
// =====================================================================

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        if (!ANTHROPIC_API_KEY) {
            return jsonResponse({ error: "ANTHROPIC_API_KEY nao configurado" }, 500);
        }

        const { solicitacao_id, message } = (await req.json()) as ProcessorRequest;

        if (!solicitacao_id || !message) {
            return jsonResponse({ error: "solicitacao_id e message obrigatorios" }, 400);
        }

        const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

        // ---- Carrega solicitacao ----
        const { data: solicitacao, error: solErr } = await service
            .from("cadastro_solicitacoes")
            .select("*")
            .eq("id", solicitacao_id)
            .maybeSingle();

        if (solErr || !solicitacao) {
            return jsonResponse({ error: "Solicitacao nao encontrada" }, 404);
        }

        if (!["enviado", "em_conversa"].includes(solicitacao.status)) {
            return jsonResponse(
                {
                    error: `Solicitacao em status ${solicitacao.status}, nao aceita mais mensagens`,
                    solicitacao_id,
                },
                409,
            );
        }

        // ---- Rejeita tipos nao suportados (audio, video) ----
        if (message.type === "audio" || message.type === "video") {
            const fallback = "Recebi seu áudio/vídeo, mas no momento só processo *texto*, *fotos* (do RG/CNH/comprovante) ou *PDF* de documentos. Pode me mandar nesses formatos?";
            await enviarReplyEArquivar(service, solicitacao, fallback);
            await service.from("cadastro_mensagens").insert({
                solicitacao_id,
                direcao: "recebida",
                media_mime: message.mime ?? null,
                media_tipo: message.type,
                evolution_message_id: message.evolution_message_id ?? null,
            });
            return jsonResponse({ ok: true, action: "rejected_unsupported_media" });
        }

        // ---- Para mensagens com mídia (imagem/document): baixa + faz upload ----
        let mediaBase64: string | null = null;
        let mediaMime: string | null = null;
        let mediaPath: string | null = null;

        if (message.type === "image" || message.type === "document") {
            try {
                if (message.media_base64) {
                    mediaBase64 = message.media_base64;
                    mediaMime = message.mime ?? "application/octet-stream";
                } else if (message.media_url) {
                    const dl = await baixarMediaBase64(message.media_url);
                    mediaBase64 = dl.base64;
                    mediaMime = message.mime ?? dl.mime;
                } else {
                    throw new Error("media sem base64 nem url");
                }

                mediaPath = await uploadDocumento(
                    service,
                    solicitacao.company_id,
                    solicitacao_id,
                    mediaBase64!,
                    mediaMime!,
                );
            } catch (e: any) {
                console.error("[cadastro-processor] falha mídia:", e);
                const fallback = "Não consegui abrir o arquivo que você enviou. Pode tentar enviar de novo, ou responder por texto?";
                await enviarReplyEArquivar(service, solicitacao, fallback);
                return jsonResponse({ ok: true, action: "media_failed", error: e?.message });
            }
        }

        // ---- Registra mensagem recebida ----
        await service.from("cadastro_mensagens").insert({
            solicitacao_id,
            direcao: "recebida",
            conteudo: message.text ?? null,
            media_path: mediaPath,
            media_mime: mediaMime,
            media_tipo: message.type === "text" ? null : message.type,
            evolution_message_id: message.evolution_message_id ?? null,
        });

        // Mensagem totalmente vazia (sem texto e sem mídia) — ignora
        const semTexto = !message.text || message.text.trim().length === 0;
        const semMedia = !mediaBase64;
        if (semTexto && semMedia) {
            return jsonResponse({ ok: true, action: "ignored_empty" });
        }

        // ---- Marca status em_conversa se ainda nao estava ----
        if (solicitacao.status === "enviado") {
            await service
                .from("cadastro_solicitacoes")
                .update({ status: "em_conversa" })
                .eq("id", solicitacao_id);
            solicitacao.status = "em_conversa";
        }

        // ---- Monta prompt + content blocks para Claude ----
        const prompt = montarPromptExtracao({
            tipo: solicitacao.tipo,
            campos_faltando: solicitacao.campos_faltando ?? [],
            dados_extraidos: solicitacao.dados_extraidos ?? {},
            ultima_pergunta: solicitacao.ultima_pergunta,
            texto_mensagem: message.text ?? "(o destinatário enviou apenas o documento abaixo, sem texto)",
        });

        const claudeContent: ClaudeContentBlock[] = [];

        if (mediaBase64 && mediaMime) {
            const isPdf = mediaMime.includes("pdf");
            if (isPdf) {
                claudeContent.push({
                    type: "document",
                    source: { type: "base64", media_type: "application/pdf", data: mediaBase64 },
                });
            } else {
                // Imagem (jpeg/png/webp/gif)
                const imgMime = mediaMime.startsWith("image/") ? mediaMime : "image/jpeg";
                claudeContent.push({
                    type: "image",
                    source: { type: "base64", media_type: imgMime, data: mediaBase64 },
                });
            }
        }
        claudeContent.push({ type: "text", text: prompt });

        // ---- Claude extrai dados ----
        let extracao: Record<string, any>;
        try {
            extracao = await chamarClaudeExtracao(claudeContent);
        } catch (err: any) {
            console.error("[cadastro-processor] Claude falhou:", err);
            // Nao para o fluxo — apenas registra
            await service.from("cadastro_mensagens").update({
                dados_extraidos_msg: { erro_claude: err?.message || String(err) },
            }).eq("solicitacao_id", solicitacao_id)
              .eq("direcao", "recebida")
              .order("criado_em", { ascending: false })
              .limit(1);
            return jsonResponse({ ok: false, error: "Falha ao extrair com Claude" }, 502);
        }

        // ---- Valida cada campo e atualiza estado ----
        const dadosAtuais = { ...(solicitacao.dados_extraidos ?? {}) };
        const tentativas = { ...(solicitacao.tentativas_por_campo ?? {}) };
        let camposFaltando = [...(solicitacao.campos_faltando ?? [])];
        const camposObrigatorios = solicitacao.campos_obrigatorios ?? ["cpf"];
        const errosValidacao: Record<string, string> = {};

        for (const [campo, valorBruto] of Object.entries(extracao)) {
            if (valorBruto === null || valorBruto === undefined) continue;
            if (!camposFaltando.includes(campo)) continue; // ja temos

            const r = validarCampo(campo, valorBruto);

            if (r.valor_normalizado === "__pulado__") {
                // Tentou pular: so aceita se nao for obrigatorio
                if (camposObrigatorios.includes(campo)) {
                    // ignora skip — vai pedir de novo abaixo
                    continue;
                }
                dadosAtuais[campo] = "__pulado__";
                camposFaltando = camposFaltando.filter((c) => c !== campo);
                continue;
            }

            if (r.valido) {
                dadosAtuais[campo] = r.valor_normalizado;
                camposFaltando = camposFaltando.filter((c) => c !== campo);
                delete tentativas[campo];
            } else {
                tentativas[campo] = (tentativas[campo] ?? 0) + 1;
                errosValidacao[campo] = r.mensagem_erro ?? "inválido";
            }
        }

        // ---- Decide proximo passo ----
        let proximaMensagem = "";
        let novoStatus: string = solicitacao.status;
        let novaUltimaPergunta: string | null = solicitacao.ultima_pergunta;

        const algumObrigatorioFaltando = camposFaltando.some((c) => camposObrigatorios.includes(c));

        if (camposFaltando.length === 0) {
            // Todos os campos coletados (ou pulados pros opcionais)
            novoStatus = "pronto_aprovacao";
            const { data: companyData } = await service
                .from("companies")
                .select("nome_fantasia, razao_social")
                .eq("id", solicitacao.company_id)
                .maybeSingle();
            const nomeEmpresa = companyData?.nome_fantasia || companyData?.razao_social || "sua empresa";
            proximaMensagem = mensagemConclusaoSucesso(nomeEmpresa);
            novaUltimaPergunta = null;
        } else {
            // Decide qual campo perguntar
            // Prioridade: obrigatorios primeiro, depois opcionais por ordem
            const proximoCampo = camposFaltando.find((c) => camposObrigatorios.includes(c))
                ?? camposFaltando[0];

            const tentativasNoCampo = tentativas[proximoCampo] ?? 0;

            // Se obrigatorio e tentaram pular → reforca
            if (camposObrigatorios.includes(proximoCampo) && extracao[proximoCampo] === "SKIP") {
                proximaMensagem = mensagemCampoObrigatorio(proximoCampo, solicitacao.tipo);
                novaUltimaPergunta = proximoCampo;
            } else if (tentativasNoCampo >= MAX_TENTATIVAS_POR_CAMPO) {
                // Estourou tentativas
                if (camposObrigatorios.includes(proximoCampo)) {
                    // Obrigatorio falhou demais — escala
                    novoStatus = "requer_revisao";
                    const { data: companyData } = await service
                        .from("companies")
                        .select("nome_fantasia, razao_social")
                        .eq("id", solicitacao.company_id)
                        .maybeSingle();
                    const nomeEmpresa = companyData?.nome_fantasia || companyData?.razao_social || "sua empresa";
                    proximaMensagem = mensagemRequerRevisao(nomeEmpresa);
                    novaUltimaPergunta = null;
                } else {
                    // Opcional falhou demais — marca como pulado e segue
                    dadosAtuais[proximoCampo] = "__falhou__";
                    camposFaltando = camposFaltando.filter((c) => c !== proximoCampo);
                    // Continua perguntando o proximo (recursao simples: dispara outra rodada nao,
                    // vamos so perguntar o proximo agora)
                    const seguinte = camposFaltando.find((c) => camposObrigatorios.includes(c))
                        ?? camposFaltando[0];
                    if (seguinte) {
                        proximaMensagem = perguntaPorCampo(seguinte, solicitacao.tipo);
                        novaUltimaPergunta = seguinte;
                    } else {
                        novoStatus = "pronto_aprovacao";
                        const { data: companyData } = await service
                            .from("companies")
                            .select("nome_fantasia, razao_social")
                            .eq("id", solicitacao.company_id)
                            .maybeSingle();
                        const nomeEmpresa = companyData?.nome_fantasia || companyData?.razao_social || "sua empresa";
                        proximaMensagem = mensagemConclusaoSucesso(nomeEmpresa);
                        novaUltimaPergunta = null;
                    }
                }
            } else if (errosValidacao[proximoCampo]) {
                // Tentativa falhou na validacao
                proximaMensagem = perguntaPorCampo(
                    proximoCampo,
                    solicitacao.tipo,
                    String(extracao[proximoCampo]),
                    errosValidacao[proximoCampo],
                );
                novaUltimaPergunta = proximoCampo;
            } else {
                // Pergunta normal pelo proximo campo faltando
                proximaMensagem = perguntaPorCampo(proximoCampo, solicitacao.tipo);
                novaUltimaPergunta = proximoCampo;
            }
        }

        // ---- Atualiza solicitacao ----
        await service
            .from("cadastro_solicitacoes")
            .update({
                dados_extraidos: dadosAtuais,
                campos_faltando: camposFaltando,
                tentativas_por_campo: tentativas,
                ultima_pergunta: novaUltimaPergunta,
                status: novoStatus,
            })
            .eq("id", solicitacao_id);

        // ---- Envia resposta + registra ----
        if (proximaMensagem) {
            await enviarReplyEArquivar(service, solicitacao, proximaMensagem);
        }

        // ---- Atualiza extracao na mensagem recebida (auditoria) ----
        const { data: ultimaMsg } = await service
            .from("cadastro_mensagens")
            .select("id")
            .eq("solicitacao_id", solicitacao_id)
            .eq("direcao", "recebida")
            .order("criado_em", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (ultimaMsg) {
            await service
                .from("cadastro_mensagens")
                .update({ dados_extraidos_msg: extracao })
                .eq("id", ultimaMsg.id);
        }

        return jsonResponse({
            ok: true,
            solicitacao_id,
            novo_status: novoStatus,
            campos_extraidos: Object.keys(extracao).filter((k) => extracao[k] !== null),
            campos_faltando: camposFaltando,
            mensagem_enviada: proximaMensagem || null,
            erros_validacao: errosValidacao,
        });
    } catch (err: any) {
        console.error("[cadastro-processor] erro:", err);
        return jsonResponse({ error: err?.message || String(err) }, 500);
    }
});

// =====================================================================
// Helper: envia reply e arquiva em cadastro_mensagens
// =====================================================================
async function enviarReplyEArquivar(
    service: any,
    solicitacao: any,
    texto: string,
): Promise<void> {
    try {
        const sendResp = await fetch(`${SUPABASE_URL}/functions/v1/enviar-whatsapp`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SERVICE_KEY}`,
            },
            body: JSON.stringify({ phone: solicitacao.telefone, text: texto }),
        });
        const sendData = await sendResp.json();

        await service.from("cadastro_mensagens").insert({
            solicitacao_id: solicitacao.id,
            direcao: "enviada",
            conteudo: texto,
            evolution_message_id: sendData?.response?.key?.id ?? null,
        });
    } catch (e) {
        console.error("[cadastro-processor] falha ao enviar reply:", e);
    }
}
