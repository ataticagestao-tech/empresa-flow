/** Validadores de dados cadastrais (port do src/lib/validators.ts pra Deno).
 *  Reusados pelas Edge Functions de cadastro automatico via WhatsApp.
 */

export function validarCPF(cpf: string): boolean {
    const limpo = cpf.replace(/\D/g, "");
    if (limpo.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(limpo)) return false;

    let soma = 0;
    for (let i = 0; i < 9; i++) soma += parseInt(limpo.charAt(i)) * (10 - i);
    let resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(limpo.charAt(9))) return false;

    soma = 0;
    for (let i = 0; i < 10; i++) soma += parseInt(limpo.charAt(i)) * (11 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    return resto === parseInt(limpo.charAt(10));
}

export function validarCNPJ(cnpj: string): boolean {
    const limpo = cnpj.replace(/\D/g, "");
    if (limpo.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(limpo)) return false;

    const calcDigito = (base: string, pesos: number[]): number => {
        const soma = base
            .split("")
            .reduce((acc, d, i) => acc + parseInt(d) * pesos[i], 0);
        const resto = soma % 11;
        return resto < 2 ? 0 : 11 - resto;
    };

    const d1 = calcDigito(limpo.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    if (d1 !== parseInt(limpo.charAt(12))) return false;

    const d2 = calcDigito(limpo.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return d2 === parseInt(limpo.charAt(13));
}

export function validarDocumento(doc: string | null | undefined): boolean {
    if (!doc) return false;
    const limpo = doc.replace(/\D/g, "");
    if (limpo.length === 11) return validarCPF(doc);
    if (limpo.length === 14) return validarCNPJ(doc);
    return false;
}

export function validarCEP(cep: string | null | undefined): boolean {
    if (!cep) return false;
    const limpo = cep.replace(/\D/g, "");
    return limpo.length === 8;
}

export function validarEmail(email: string | null | undefined): boolean {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function validarDataNascimento(data: string | null | undefined): { valido: boolean; iso: string | null } {
    if (!data) return { valido: false, iso: null };
    const s = data.trim();

    let d: Date | null = null;

    // ISO YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        d = new Date(s);
    }
    // DD/MM/YYYY ou DD-MM-YYYY
    else if (/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(s)) {
        const [dia, mes, ano] = s.split(/[/-]/).map(Number);
        d = new Date(ano, mes - 1, dia);
    }
    // DD/MM/YY ou DD-MM-YY (assume 19XX se >30, 20XX se <=30)
    else if (/^\d{2}[/-]\d{2}[/-]\d{2}$/.test(s)) {
        const [dia, mes, ano2] = s.split(/[/-]/).map(Number);
        const ano = ano2 > 30 ? 1900 + ano2 : 2000 + ano2;
        d = new Date(ano, mes - 1, dia);
    }

    if (!d || isNaN(d.getTime())) return { valido: false, iso: null };

    const hoje = new Date();
    const idade = hoje.getFullYear() - d.getFullYear();
    if (idade < 14 || idade > 100) return { valido: false, iso: null };

    const iso = d.toISOString().slice(0, 10);
    return { valido: true, iso };
}

/** Detecta tipo de chave PIX a partir do valor bruto */
export function detectarTipoPix(chave: string | null | undefined): {
    tipo: "cpf" | "cnpj" | "email" | "telefone" | "aleatoria" | null;
    chave_normalizada: string;
    valido: boolean;
} {
    if (!chave) return { tipo: null, chave_normalizada: "", valido: false };
    const c = chave.trim();

    if (validarEmail(c)) {
        return { tipo: "email", chave_normalizada: c.toLowerCase(), valido: true };
    }

    const digits = c.replace(/\D/g, "");

    if (digits.length === 11 && validarCPF(digits)) {
        return { tipo: "cpf", chave_normalizada: digits, valido: true };
    }
    if (digits.length === 14 && validarCNPJ(digits)) {
        return { tipo: "cnpj", chave_normalizada: digits, valido: true };
    }
    if (digits.length === 10 || digits.length === 11 || digits.length === 12 || digits.length === 13) {
        // telefone BR (10-13 digitos com/sem DDI)
        if (digits.length >= 10 && digits.length <= 13) {
            return { tipo: "telefone", chave_normalizada: digits, valido: true };
        }
    }

    // chave aleatoria (UUID)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) {
        return { tipo: "aleatoria", chave_normalizada: c.toLowerCase(), valido: true };
    }

    return { tipo: null, chave_normalizada: c, valido: false };
}

/** Resultado padronizado de validacao por campo */
export interface ValidacaoCampo {
    campo: string;
    valor_recebido: string | null;
    valor_normalizado: string | null;
    valido: boolean;
    mensagem_erro?: string;
}
