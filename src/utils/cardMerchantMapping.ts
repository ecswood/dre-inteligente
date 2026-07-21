export type CardMerchantMapping = Record<string, { planoDeContas: string; updatedAt: string }>;

const STORAGE_KEY = 'isp_card_merchant_mapping';

export function normalizeDescricao(descricao: string): string {
  return descricao.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function loadCardMerchantMapping(): CardMerchantMapping {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveCardMerchantMapping(mapping: CardMerchantMapping): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping));
}

export function sugerirPlanoDeContas(descricao: string, mapping: CardMerchantMapping): string | null {
  const chave = normalizeDescricao(descricao);

  if (mapping[chave]) {
    return mapping[chave].planoDeContas;
  }

  if (chave.includes('IOF')) {
    return 'DÉB.IOF : 02.03.09';
  }

  if (chave.includes('JUROS') || chave.includes('MORA') || chave.includes('MULTA') || chave.includes('ENCARGOS')) {
    return '02.03.03.10 : JUROS UTILIZ.CH.ESPECIAL';
  }

  return null;
}
