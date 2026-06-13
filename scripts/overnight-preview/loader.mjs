// Loader p/ rodar o render da edge function (Deno) dentro do Node.
// Mapeia o specifier Deno  npm:pdf-lib@1.17.1  ->  pdf-lib  e resolve o
// pacote a partir DESTA pasta (onde está o node_modules), e não da pasta
// do render.ts (que não tem node_modules).
import { registerHooks } from "node:module";

const aquiUrl = import.meta.url; // .../scripts/overnight-preview/loader.mjs

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("npm:")) {
      let pkg = specifier.slice(4);          // "pdf-lib@1.17.1"
      const at = pkg.lastIndexOf("@");
      if (at > 0) pkg = pkg.slice(0, at);    // "pdf-lib"
      return nextResolve(pkg, { ...context, parentURL: aquiUrl });
    }
    return nextResolve(specifier, context);
  },
});
