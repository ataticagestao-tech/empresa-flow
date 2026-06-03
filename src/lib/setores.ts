/**
 * Mapa CNAE → setor (fonte única de verdade pra segmentação por área da empresa).
 *
 * Resolve por PREFIXO de CNAE (mais específico → mais genérico), então a parte de
 * saúde é fina: medicina, odontologia, terapias/profissionais, laboratório,
 * veterinária e farmácia caem em perfis distintos (com termos de notícia próprios).
 * Os demais setores resolvem pela divisão (2 primeiros dígitos).
 * activity_profile (servico|comercio|mista) é só fallback quando não há CNAE.
 *
 * Temas da Câmara: 40 Economia, 58 Trabalho, 52 Previdência, 56 Saúde,
 * 66 Indústria/Comércio/Serviços, 67 Defesa do Consumidor, 70 Finanças Públicas.
 */

export interface SetorPerfil {
    key: string;
    label: string;
    temas: number[];
    termos: string[];
}

const ECONOMIA = 40;
const TRABALHO = 58;
const SAUDE = 56;
const PREV = 52;
const COMERCIO = 66;
const CONSUMIDOR = 67;
const FINANCAS = 70;

const PERFIS: Record<string, SetorPerfil> = {
    // ── Saúde (fino) ──
    medicina: {
        key: "medicina", label: "Medicina / Clínicas",
        temas: [SAUDE, ECONOMIA, PREV],
        termos: ["CFM", '"plano de saúde"', '"ato médico"', "telemedicina", "Anvisa", '"rol da ANS"'],
    },
    odontologia: {
        key: "odontologia", label: "Odontologia",
        temas: [SAUDE, ECONOMIA],
        termos: ["odontologia", "dentista", "CFO", '"plano odontológico"', '"saúde bucal"'],
    },
    saude_prof: {
        key: "saude_prof", label: "Saúde — Terapias e Profissionais",
        temas: [SAUDE, ECONOMIA, TRABALHO],
        termos: ["fisioterapia", "psicologia", "nutricionista", "fonoaudiologia", '"profissões da saúde"'],
    },
    laboratorio: {
        key: "laboratorio", label: "Laboratório / Diagnóstico",
        temas: [SAUDE, ECONOMIA],
        termos: ['"análises clínicas"', '"diagnóstico por imagem"', "laboratório Anvisa", "exames"],
    },
    veterinaria: {
        key: "veterinaria", label: "Veterinária / Pet",
        temas: [SAUDE, ECONOMIA, COMERCIO],
        termos: ["veterinária", "pet", '"saúde animal"', "CRMV", '"clínica veterinária"'],
    },
    farmacia: {
        key: "farmacia", label: "Farmácia",
        temas: [SAUDE, CONSUMIDOR, COMERCIO, ECONOMIA],
        termos: ["farmácia", "medicamentos preço", "Anvisa", "CMED", "genéricos"],
    },
    // ── Beleza / estética ──
    beleza: {
        key: "beleza", label: "Beleza / Estética",
        temas: [COMERCIO, ECONOMIA, TRABALHO],
        termos: ['"salão de beleza"', "estética", "cosméticos Anvisa", '"profissional autônomo" beleza', "MEI"],
    },
    // ── Comércio / indústria / serviços ──
    varejo: {
        key: "varejo", label: "Varejo / Comércio",
        temas: [COMERCIO, CONSUMIDOR, ECONOMIA],
        termos: ['"comércio varejista"', "ICMS varejo", '"código de defesa do consumidor"', "Sefaz"],
    },
    industria: {
        key: "industria", label: "Indústria",
        temas: [COMERCIO, ECONOMIA, TRABALHO],
        termos: ["indústria tributação", "ICMS industrial", '"desoneração da folha"', "insumos importação"],
    },
    construcao: {
        key: "construcao", label: "Construção",
        temas: [COMERCIO, ECONOMIA],
        termos: ['"construção civil"', "habitação", "obras públicas", "Minha Casa Minha Vida"],
    },
    alimentacao: {
        key: "alimentacao", label: "Alimentação / Bares e Restaurantes",
        temas: [COMERCIO, SAUDE, ECONOMIA],
        termos: ["restaurante", "bar", '"alimentação fora do lar"', "Perse", "vigilância sanitária alimentos"],
    },
    educacao: {
        key: "educacao", label: "Educação",
        temas: [ECONOMIA, TRABALHO],
        termos: ['"escola particular"', "educação", "FIES", "ensino"],
    },
    tecnologia: {
        key: "tecnologia", label: "Tecnologia / TI",
        temas: [ECONOMIA, COMERCIO],
        termos: ["tecnologia software", "LGPD", "startup", '"marco legal" internet'],
    },
    transporte: {
        key: "transporte", label: "Transporte / Logística",
        temas: [COMERCIO, ECONOMIA, FINANCAS],
        termos: ["transporte de cargas", "frete", "logística", "combustível ICMS"],
    },
    servicos: {
        key: "servicos", label: "Serviços Profissionais",
        temas: [COMERCIO, ECONOMIA, TRABALHO],
        termos: ['"serviços"', "ISS", '"Simples Nacional"', '"prestação de serviços"'],
    },
    geral: {
        key: "geral", label: "Geral (PMEs)",
        temas: [ECONOMIA, TRABALHO, COMERCIO],
        termos: ['"Simples Nacional"', "MEI", '"pequena empresa"', "tributação PME"],
    },
};

/**
 * Regras por prefixo de CNAE (dígitos, sem separadores), avaliadas EM ORDEM —
 * as mais específicas primeiro. Ex.: 8630-5/04 (odonto) antes de 863 (clínicas);
 * 4771 (farmácia) antes de 47 (varejo).
 */
const REGRAS: Array<{ pre: string[]; setor: string }> = [
    { pre: ["75"], setor: "veterinaria" },                         // div. 75 — veterinária
    { pre: ["4771"], setor: "farmacia" },                          // 4771 — varejo farmacêutico
    { pre: ["8630504"], setor: "odontologia" },                    // 8630-5/04 — consultório odontológico
    { pre: ["861", "8621", "8622"], setor: "medicina" },           // hospitais + urgência
    { pre: ["863"], setor: "medicina" },                           // demais consultórios/clínicas médicas
    { pre: ["864"], setor: "laboratorio" },                        // 8640 — laboratórios/diagnóstico
    { pre: ["865", "869"], setor: "saude_prof" },                  // 8650/8690 — terapias e outras
    { pre: ["9602", "4772"], setor: "beleza" },                    // salão/estética + varejo de cosméticos
    { pre: ["55", "56"], setor: "alimentacao" },                   // alojamento/alimentação
    { pre: ["41", "42", "43"], setor: "construcao" },
    { pre: ["85"], setor: "educacao" },
    { pre: ["49", "50", "51", "52", "53"], setor: "transporte" },
    { pre: ["58", "59", "60", "61", "62", "63"], setor: "tecnologia" },
    { pre: ["45", "46", "47"], setor: "varejo" },                  // comércio (após farmácia/cosmético)
    { pre: ["10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33"], setor: "industria" },
    { pre: ["69", "70", "71", "72", "73", "74", "75", "77", "78", "79", "80", "81", "82", "94"], setor: "servicos" },
];

/** Resolve o perfil de setor a partir do CNAE (e activity_profile como fallback). */
export function resolveSetor(
    cnae?: string | null,
    activityProfile?: "servico" | "comercio" | "mista" | null,
): SetorPerfil {
    const d = (cnae ?? "").replace(/\D/g, "");
    if (d.length >= 2) {
        for (const regra of REGRAS) {
            if (regra.pre.some((p) => d.startsWith(p))) return PERFIS[regra.setor];
        }
    }
    if (activityProfile === "comercio") return PERFIS.varejo;
    if (activityProfile === "servico") return PERFIS.servicos;
    return PERFIS.geral;
}

/** Monta a query do Google News RSS pro setor (recência 30 dias). */
export function newsQuery(perfil: SetorPerfil): string {
    return `(${perfil.termos.join(" OR ")}) when:30d`;
}

export const SETORES = PERFIS;
