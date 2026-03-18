// Map bank codes to brand colors for generated avatars
// Uses first letters as fallback when no logo is available

const BANK_COLORS: Record<string, string> = {
    "1": "#FAEA1E",     // Banco do Brasil
    "33": "#EE3124",    // Santander (was Banespa)
    "104": "#005CA9",   // Caixa Econômica
    "237": "#CC2229",   // Bradesco
    "341": "#FF6600",   // Itaú
    "745": "#003882",   // Citibank
    "356": "#003882",   // Real/Santander
    "399": "#003E6B",   // HSBC
    "422": "#007A33",   // Safra
    "453": "#003882",   // Rural
    "633": "#7B2D8E",   // Rendimento
    "652": "#003882",   // Itaú Unibanco
    "41": "#004B87",    // Banrisul
    "756": "#003882",   // Bancoob/Sicoob
    "748": "#003882",   // Sicredi
    "85": "#003882",    // CECRED/Ailos
    "260": "#9C27B0",   // Nu Pagamentos (Nubank)
    "77": "#FF5722",    // Inter
    "336": "#FF5722",   // C6 Bank
    "212": "#FF5722",   // Banco Original
    "290": "#FF5722",   // PagSeguro
    "380": "#FF5722",   // PicPay
    "323": "#FF5722",   // Mercado Pago
    "403": "#004B87",   // Cora
    "197": "#FF5722",   // Stone
    "3": "#004B87",     // BASA
    "47": "#003882",    // Banese
    "21": "#004B87",    // Banestes
    "70": "#004B87",    // BRB
    "37": "#004B87",    // Banpará
};

// Known bank initials for better display
const BANK_INITIALS: Record<string, string> = {
    "1": "BB",
    "33": "SAN",
    "104": "CX",
    "237": "BR",
    "341": "IT",
    "745": "CT",
    "422": "SF",
    "41": "BRS",
    "756": "SC",
    "748": "SI",
    "260": "NU",
    "77": "IN",
    "336": "C6",
    "212": "OR",
    "290": "PS",
    "380": "PP",
    "323": "MP",
    "403": "CO",
    "197": "ST",
    "3": "BA",
    "47": "BN",
    "21": "BE",
    "70": "BRB",
    "37": "BP",
};

export function getBankColor(code: string): string {
    return BANK_COLORS[code] || "#64748b";
}

export function getBankInitials(code: string, name: string): string {
    if (BANK_INITIALS[code]) return BANK_INITIALS[code];
    // Generate from name: take first 2 chars of meaningful words
    const words = name.replace(/^(Banco|Bank)\s+/i, "").split(/\s+/);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
}
