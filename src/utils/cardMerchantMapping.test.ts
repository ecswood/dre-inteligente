import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  normalizeDescricao,
  loadCardMerchantMapping,
  saveCardMerchantMapping,
  sugerirPlanoDeContas,
  type CardMerchantMapping
} from './cardMerchantMapping';

beforeEach(() => {
  const store: Record<string, string> = {};
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; }
  });
});

describe('normalizeDescricao', () => {
  it('remove espaços extras e coloca em maiúsculas', () => {
    expect(normalizeDescricao('  Starlink   Internet  ')).toBe('STARLINK INTERNET');
  });
});

describe('loadCardMerchantMapping / saveCardMerchantMapping', () => {
  it('retorna objeto vazio quando não há nada salvo', () => {
    expect(loadCardMerchantMapping()).toEqual({});
  });

  it('salva e recupera o mapeamento', () => {
    const mapping: CardMerchantMapping = {
      'STARLINK INTERNET': { planoDeContas: '02.03.02.24 : Custo do Link', updatedAt: '2026-07-20' }
    };
    saveCardMerchantMapping(mapping);
    expect(loadCardMerchantMapping()).toEqual(mapping);
  });
});

describe('sugerirPlanoDeContas', () => {
  it('sugere o plano de contas já aprendido pro comerciante', () => {
    const mapping: CardMerchantMapping = {
      'STARLINK INTERNET': { planoDeContas: '02.03.02.24 : Custo do Link', updatedAt: '2026-07-20' }
    };
    expect(sugerirPlanoDeContas('Starlink Internet', mapping)).toBe('02.03.02.24 : Custo do Link');
  });

  it('sugere o plano de IOF nativo quando a descrição contém IOF, mesmo sem aprendizado prévio', () => {
    expect(sugerirPlanoDeContas('IOF Compra Internacional', {})).toBe('DÉB.IOF : 02.03.09');
  });

  it('sugere o plano de juros/encargos nativo quando a descrição contém JUROS, MORA ou MULTA', () => {
    expect(sugerirPlanoDeContas('Juros De Mora - Multa', {})).toBe('02.03.03.10 : JUROS UTILIZ.CH.ESPECIAL');
  });

  it('retorna null quando não há aprendizado nem padrão nativo', () => {
    expect(sugerirPlanoDeContas('ZP OLX MNICA DA088', {})).toBeNull();
  });
});
