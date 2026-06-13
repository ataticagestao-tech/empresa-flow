# Preview local do Overnight (PDF)

Gera um **PDF de exemplo** do Overnight usando exatamente o mesmo código de
desenho da edge function (`supabase/functions/gerar-overnight-pdf/render.ts`),
sem precisar de Supabase, Deno nem deploy. Serve pra conferir o **layout** antes
de publicar.

## Como rodar

```bash
cd empresa-flow/scripts/overnight-preview
npm install        # só na 1ª vez (instala pdf-lib)
npm run preview    # gera overnight-preview.pdf nesta pasta
```

Abra o `overnight-preview.pdf` que aparece aqui na pasta.

## Como funciona

- `preview.mjs` — dados de exemplo + chama `renderizarPdf()` do render real.
- `loader.mjs` — hook do Node que mapeia o import estilo Deno
  `npm:pdf-lib@1.17.1` para o `pdf-lib` instalado aqui no `node_modules`.
- O Node 24 lê o `render.ts` (TypeScript) direto, removendo os tipos.

> Para testar **com dados reais** de uma empresa é preciso rodar a função no
> Supabase (`supabase functions deploy gerar-overnight-pdf` + invocar com o
> `empresa_id`). Este preview é só do layout, com números fictícios.

## Editar os dados do exemplo

Mexa no objeto `dados` dentro de `preview.mjs` (formas de pagamento, produtos,
valores das seções) e rode `npm run preview` de novo.
