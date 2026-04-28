export type LinhaTipo = 'boleto' | 'arrecadacao';

export interface LinhaParseResult {
  ok: true;
  tipo: LinhaTipo;
  barcode: string;
}

export interface LinhaParseError {
  ok: false;
  error: string;
}

export function linhaDigitavelToBarcode(input: string): LinhaParseResult | LinhaParseError {
  const c = (input || '').replace(/\D/g, '');

  if (c.length === 47) {
    const barcode =
      c.substring(0, 4) +
      c.substring(32, 33) +
      c.substring(33, 47) +
      c.substring(4, 9) +
      c.substring(10, 20) +
      c.substring(21, 31);
    return { ok: true, tipo: 'boleto', barcode };
  }

  if (c.length === 48) {
    const barcode =
      c.substring(0, 11) +
      c.substring(12, 23) +
      c.substring(24, 35) +
      c.substring(36, 47);
    if (barcode[0] !== '8') {
      return { ok: false, error: 'Linha de arrecadacao deve comecar com 8' };
    }
    return { ok: true, tipo: 'arrecadacao', barcode };
  }

  return { ok: false, error: `Linha digitavel deve ter 47 ou 48 digitos (tem ${c.length})` };
}
