/** Normaliza telefone para o formato exigido pela Evolution API:
 *  - so digitos
 *  - prefixo 55 (Brasil) se nao houver
 *  - aceita celular (11 digitos) ou fixo (10 digitos) brasileiro
 *  - retorna null se invalido
 *
 *  Mesma logica usada em enviar-whatsapp e validar-whatsapp.
 */
export function normalizePhone(raw: string): string | null {
    if (!raw) return null;
    let digits = raw.replace(/\D/g, "");
    if (!digits) return null;

    if (digits.startsWith("0")) digits = digits.slice(1);

    if (!digits.startsWith("55")) {
        if (digits.length === 10 || digits.length === 11) {
            digits = "55" + digits;
        } else {
            return null;
        }
    }

    if (digits.length < 12 || digits.length > 13) return null;
    return digits;
}
