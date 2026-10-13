import { describe, expect, it } from 'vitest';
import { checkOperatorId, findOperatorIds, formatOperatorInput, looksLikeFlyerId, operatorCharsLeft, parseFlyerLines, splitForTwoLines } from '../../src/lib/ids';

describe('checkOperatorId', () => {
  it('accepts UK operator IDs and normalises case and spaces', () => {
    expect(checkOperatorId(' gbr-op-abcd1234efgh ')).toEqual({ ok: true, id: 'GBR-OP-ABCD1234EFGH' });
  });
  it('turns typographic dashes into hyphens', () => {
    expect(checkOperatorId('GBR–OP–ABCD1234EFGH').id).toBe('GBR-OP-ABCD1234EFGH');
  });
  it('rejects a flyer ID typed into the operator box', () => {
    const r = checkOperatorId('GBR-RP-ABCD1234EFGH');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/flyer ID/);
  });
  it('rejects malformed UK IDs', () => {
    expect(checkOperatorId('GBR-OP-SHORT').ok).toBe(false);
  });
  it('rejects IDs that are not in the UK format', () => {
    expect(checkOperatorId('FIN87astrdge12k8').ok).toBe(false);
    expect(checkOperatorId('GBR-OP-SAMPLE00TEST-ABC').ok).toBe(false);
  });
  it('rejects junk', () => {
    expect(checkOperatorId('hello!').ok).toBe(false);
    expect(checkOperatorId('').ok).toBe(false);
  });
});

describe('formatOperatorInput', () => {
  it.each([
    ['', ''],
    ['g', 'G'],
    ['gb', 'GB'],
    ['gbr', 'GBR-'],
    ['gbro', 'GBR-O'],
    ['gbrop', 'GBR-OP-'],
    ['gbropsample00test', 'GBR-OP-SAMPLE00TEST'],
    ['GBR-OP-SAMPLE00TEST', 'GBR-OP-SAMPLE00TEST'],
    [' gbr op sample 00 test ', 'GBR-OP-SAMPLE00TEST'],
    ['GBR–OP–SAMPLE00TEST', 'GBR-OP-SAMPLE00TEST'],
  ])('types or pastes %j as %j', (raw, out) => {
    expect(formatOperatorInput(raw)).toBe(out);
  });
  it('adds the prefix when only the 12 characters are given', () => {
    expect(formatOperatorInput('sample00test')).toBe('GBR-OP-SAMPLE00TEST');
    expect(formatOperatorInput('x')).toBe('GBR-OP-X');
  });
  it('drops unwanted characters and anything past 12 characters', () => {
    expect(formatOperatorInput('Operator ID: GBR-OP-SAMPLE00TEST (expires 2027)')).toBe('GBR-OP-SAMPLE00TEST');
    expect(formatOperatorInput('GBR-OP-SAMPLE00TEST-ABC')).toBe('GBR-OP-SAMPLE00TEST');
    expect(formatOperatorInput('@#!*')).toBe('');
  });
  it('leaves flyer IDs out', () => {
    expect(looksLikeFlyerId('gbr-rp-sampleALEX01')).toBe(true);
    expect(formatOperatorInput('GBR-RP-SAMPLEALEX01')).toBe('');
    expect(looksLikeFlyerId('GBR-OP-SAMPLE00TEST')).toBe(false);
  });
  it('counts the characters still missing', () => {
    expect(operatorCharsLeft('')).toBe(12);
    expect(operatorCharsLeft('GBR-')).toBe(12);
    expect(operatorCharsLeft('GBR-OP-SAMP')).toBe(8);
    expect(operatorCharsLeft('GBR-OP-SAMPLE00TEST')).toBe(0);
  });
});

describe('findOperatorIds', () => {
  it('ignores flyer IDs and removes duplicates', () => {
    expect(findOperatorIds('GBR-RP-AAAA1111BBBB GBR-OP-CCCC2222DDDD GBR-OP-CCCC2222DDDD')).toEqual(['GBR-OP-CCCC2222DDDD']);
  });
});

describe('parseFlyerLines', () => {
  it('reads the fields from a CAA flyer ID card', () => {
    const lines = ['UNITED KINGDOM', 'Drone and model aircraft', 'Flyer ID', 'GBR-RP-SAMPLEALEX01', 'First name: ALEX', 'Last name: EXAMPLE', 'Expiry date: 1 January 2031'];
    expect(parseFlyerLines(lines)).toEqual({
      flyerId: 'GBR-RP-SAMPLEALEX01', firstName: 'ALEX', lastName: 'EXAMPLE', expiry: '1 January 2031',
    });
  });
  it('reads the values when the labels are only in the background image', () => {
    // this is how the PDFs from register-drones.caa.co.uk come out
    expect(parseFlyerLines(['GBR-RP-SAMPLEALEX01', 'ALEX JO', 'EXAMPLE', '1 January 2031'])).toEqual({
      flyerId: 'GBR-RP-SAMPLEALEX01', firstName: 'ALEX JO', lastName: 'EXAMPLE', expiry: '1 January 2031',
    });
  });
  it('returns nothing for unrelated text', () => {
    expect(parseFlyerLines(['hello']).flyerId).toBeUndefined();
  });
});

describe('splitForTwoLines', () => {
  it('splits UK IDs after the prefix', () => {
    expect(splitForTwoLines('GBR-OP-SAMPLE00TEST')).toEqual(['GBR-OP-', 'SAMPLE00TEST']);
  });
  it('splits IDs without dashes in half', () => {
    expect(splitForTwoLines('FIN87ASTRDGE12K8')).toEqual(['FIN87AST', 'RDGE12K8']);
  });
});
