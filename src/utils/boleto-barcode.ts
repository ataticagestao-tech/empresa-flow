export type LinhaTipo = 'boleto' | 'arrecadacao' | 'barcode';

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
  const raw = input || '';
  const c = raw.replace(/\D/g, '');

  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[linhaDigitavelToBarcode] input chars:', raw.length, '| digits:', c.length, '| value:', c);
  }

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

  if (c.length === 44) {
    return { ok: true, tipo: 'barcode', barcode: c };
  }

  const preview = c.length > 0 ? ` ("${c.substring(0, 8)}...${c.substring(Math.max(0, c.length - 4))}")` : '';
  return {
    ok: false,
    error: `Linha digitavel deve ter 47 ou 48 digitos (tem ${c.length}${preview}). Cole apenas a linha digitavel completa do boleto.`,
  };
}
