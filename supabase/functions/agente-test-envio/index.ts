// Testa envio igual o orquestrador faz e retorna o erro exato.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") ?? "https://api.ataticagestao.com";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") ?? "financeiro";

serve(async () => {
    const debug: any = {
        url_configurada: EVOLUTION_API_URL,
        key_existe: !!EVOLUTION_API_KEY,
        key_tamanho: EVOLUTION_API_KEY?.length ?? 0,
        instance: EVOLUTION_INSTANCE,
    };

    if (!EVOLUTION_API_KEY) {
        debug.erro = "EVOLUTION_API_KEY não está nos secrets!";
        return new Response(JSON.stringify(debug, null, 2), {
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/message/sendText/${EVOLUTION_INSTANCE}`;
        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: EVOLUTION_API_KEY,
            },
            body: JSON.stringify({ number: "553599905768", text: "teste do orquestrador interno" }),
        });
        debug.http_status = resp.status;
        debug.resposta = await resp.text();
    } catch (err: any) {
        debug.erro_fetch = err?.message;
        debug.erro_full = String(err);
    }

    return new Response(JSON.stringify(debug, null, 2), {
        headers: { "Content-Type": "application/json" },
    });
});
