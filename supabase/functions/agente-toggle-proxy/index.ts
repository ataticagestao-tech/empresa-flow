// Liga/desliga proxy da instância Evolution.
// Usage:
//   POST .../agente-toggle-proxy?enabled=false  → desliga
//   POST .../agente-toggle-proxy?enabled=true   → liga (mantém config existente)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") ?? "https://api.ataticagestao.com";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") ?? "financeiro";

serve(async (req: Request) => {
    try {
        const u = new URL(req.url);
        const enabled = u.searchParams.get("enabled") !== "false"; // default = ligar

        const base = EVOLUTION_API_URL.replace(/\/$/, "");
        const headers = { apikey: EVOLUTION_API_KEY, "Content-Type": "application/json" };

        // Pega config atual pra preservar dados
        const cur = await fetch(`${base}/proxy/find/${EVOLUTION_INSTANCE}`, { headers }).then((r) => r.json()).catch(() => null);

        const payload = {
            enabled,
            host: cur?.host || "0.0.0.0",
            port: cur?.port || "1",
            protocol: cur?.protocol || "http",
            username: cur?.username || "",
            password: cur?.password || "",
        };

        const resp = await fetch(`${base}/proxy/set/${EVOLUTION_INSTANCE}`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });
        const data = await resp.json().catch(() => ({}));

        return new Response(
            JSON.stringify({ ok: resp.ok, http: resp.status, proxy_agora: payload, resposta: data }, null, 2),
            { headers: { "Content-Type": "application/json" } }
        );
    } catch (err: any) {
        return new Response(JSON.stringify({ erro: err?.message || String(err) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
});
