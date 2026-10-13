import { describe, expect, it } from 'vitest';
import { OPERATOR_MAX_LENGTH, checkOperatorId, findOperatorIds, formatOperatorInput, looksLikeFlyerId, operatorCharsLeft, parseFlyerLines, splitForTwoLines, unprintableLetters } from '../../src/lib/ids';

describe('checkOperatorId', () => {
  it('accepts UK operator IDs and normalises case and spaces', () => {
    expect(checkOperatorId(' gbr-op-abcd1234efgh ')).toEqual({ ok: true, id: 'GBR-OP-ABCD1234EFGH' });
  });
  it('turns typographic dashes into hyphens', () => {
    expect(checkOperatorId('GBR–OP–ABCD1234EFGH').id).toBe('GBR-OP-ABCD1234EFGH');
  });
  it('accepts operator IDs from other countries as written', () => {
    expect(checkOperatorId('FIN87astrdge12k8')).toEqual({ ok: true, id: 'FIN87astrdge12k8' });
    expect(checkOperatorId('FA3XXXXXXX')).toEqual({ ok: true, id: 'FA3XXXXXXX' });
    expect(checkOperatorId('  OP  12-345 ')).toEqual({ ok: true, id: 'OP 12-345' });
    expect(checkOperatorId('X'.repeat(OPERATOR_MAX_LENGTH)).ok).toBe(true);
  });
  it('rejects a flyer ID typed into the operator box', () => {
    const r = checkOperatorId('GBR-RP-ABCD1234EFGH');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/flyer ID/);
  });
  it('rejects incomplete UK IDs', () => {
    expect(checkOperatorId('GBR-OP-SHORT').ok).toBe(false);
    expect(checkOperatorId('GBR-OP-SAMPLE00TEST-ABC').ok).toBe(false);
  });
  it('rejects IDs too long to fit on a label', () => {
    const r = checkOperatorId('X'.repeat(OPERATOR_MAX_LENGTH + 1));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/too long/);
  });
  it('accepts the alphabets the label font has', () => {
    for (const id of ['ΑΒΓ-12345', 'ОПЕРАТОР-77', 'ÅÄÖ-ÉÈÇ-123', 'ŁÓDŹ-ĞŞİ-9', 'ԱԲԳ-12', 'აბგ-12']) {
      expect(checkOperatorId(id)).toEqual({ ok: true, id });
    }
  });
  it('rejects letters the label font cannot print, and names them', () => {
    const r = checkOperatorId('東京ドローン123');
    expect(r.ok).toBe(false);
    expect(r.message).toContain("can't be printed on the labels (東 京 ド ロ ー ン)");
    expect(checkOperatorId('드론-123').ok).toBe(false);
    expect(checkOperatorId('ड्रोन123').ok).toBe(false);
  });
  it('rejects right-to-left scripts, which the labels would print back to front', () => {
    expect(checkOperatorId('مشغل-123').ok).toBe(false);
    expect(checkOperatorId('מפעיל-123').ok).toBe(false);
  });
  it('rejects empty input and symbols', () => {
    expect(checkOperatorId('').ok).toBe(false);
    expect(checkOperatorId(' - ').ok).toBe(false);
    expect(checkOperatorId('<b>hi</b>').ok).toBe(false);
  });
});

describe('formatOperatorInput', () => {
  it.each([
    ['', ''],
    ['gbr', 'GBR-'],
    ['gbro', 'GBR-O'],
    ['gbrop', 'GBR-OP-'],
    ['gbropsample00test', 'GBR-OP-SAMPLE00TEST'],
    ['GBR-OP-SAMPLE00TEST', 'GBR-OP-SAMPLE00TEST'],
    [' gbr op sample 00 test ', 'GBR-OP-SAMPLE00TEST'],
    ['GBR–OP–SAMPLE00TEST', 'GBR-OP-SAMPLE00TEST'],
  ])('types or pastes the UK ID %j as %j', (raw, out) => {
    expect(formatOperatorInput(raw)).toBe(out);
  });
  it('keeps other IDs as typed, without symbols, up to the maximum length', () => {
    expect(formatOperatorInput('gb')).toBe('gb');
    expect(formatOperatorInput('FIN87astrdge12k8')).toBe('FIN87astrdge12k8');
    expect(formatOperatorInput('FA3X!XX*XXXX')).toBe('FA3XXXXXXX');
    expect(formatOperatorInput(' - FRA  12')).toBe('FRA 12');
    expect(formatOperatorInput('Z'.repeat(40))).toBe('Z'.repeat(OPERATOR_MAX_LENGTH));
    expect(formatOperatorInput('@#!*')).toBe('');
  });
  it('drops letters the label font cannot print', () => {
    expect(formatOperatorInput('FIN東87')).toBe('FIN87');
    expect(formatOperatorInput('ΑΒΓ-1')).toBe('ΑΒΓ-1');
  });
  it('lists the letters the label font cannot print', () => {
    expect(unprintableLetters('FIN東87東京!')).toEqual(['東', '京']);
    expect(unprintableLetters('ΑΒΓ-1 é')).toEqual([]);
  });
  it('drops text around a pasted UK ID and anything past 12 characters', () => {
    expect(formatOperatorInput('Operator ID: GBR-OP-SAMPLE00TEST (expires 2027)')).toBe('GBR-OP-SAMPLE00TEST');
    expect(formatOperatorInput('GBR-OP-SAMPLE00TEST-ABC')).toBe('GBR-OP-SAMPLE00TEST');
  });
  it('never repeats the prefix when an ID is pasted after typed text', () => {
    expect(formatOperatorInput('GBR-OP-GBR-OP-SAMPLE00TEST')).toBe('GBR-OP-SAMPLE00TEST');
    expect(formatOperatorInput('GBR-OP-SAGBR-OP-SAMPLE00TEST')).toBe('GBR-OP-SAMPLE00TEST');
    expect(formatOperatorInput('GBR-GBR-OP-SAMPLE00TEST')).toBe('GBR-OP-SAMPLE00TEST');
  });
  it('leaves flyer IDs out', () => {
    expect(looksLikeFlyerId('gbr-rp-sampleALEX01')).toBe(true);
    expect(formatOperatorInput('GBR-RP-SAMPLEALEX01')).toBe('');
    expect(looksLikeFlyerId('GBR-OP-SAMPLE00TEST')).toBe(false);
  });
  it('counts the characters still missing from a UK ID', () => {
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
  it('splits at a space as well', () => {
    expect(splitForTwoLines('OP 1234 5678')).toEqual(['OP 1234', '5678']);
  });
});
