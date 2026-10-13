import { describe, expect, it } from 'vitest';
import { checkOperatorId, findOperatorIds, parseFlyerLines, splitForTwoLines, splitOperatorInput } from '../../src/lib/ids';

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
  it('accepts other formats with a warning', () => {
    const r = checkOperatorId('FIN87astrdge12k8');
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/UK format/);
  });
  it('rejects junk', () => {
    expect(checkOperatorId('hello!').ok).toBe(false);
    expect(checkOperatorId('').ok).toBe(false);
  });
});

describe('splitOperatorInput', () => {
  it('finds UK IDs in pasted text', () => {
    expect(splitOperatorInput('mine: GBR-OP-AAAA1111BBBB, dad GBR-OP-CCCC2222DDDD')).toEqual(['GBR-OP-AAAA1111BBBB', 'GBR-OP-CCCC2222DDDD']);
  });
  it('splits other input on commas and spaces', () => {
    expect(splitOperatorInput('abc123def, xyz987654')).toEqual(['ABC123DEF', 'XYZ987654']);
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
