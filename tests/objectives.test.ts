import { test } from 'node:test';
import assert from 'node:assert/strict';
import { objectiveSummary, monthlyEvolution } from '../src/lib/objectives';
import { csv } from '../src/lib/csv';
import { todayMadrid } from '../src/lib/dates';
test('El programa cruza el año natural y no inventa metas para el segundo año', () => {
  const patients = [{ id: '1', joined_on: '2026-12-31', kind: 'NUEVO', validated: true }];
  const result = objectiveSummary(
    '2026-11-01',
    patients,
    [{ patient_id: '1', starts_on: '2026-12-31', ends_on: null }],
    '2027-01-15',
  );
  assert.equal(result.current?.start, '2026-11-01');
  assert.equal(result.current?.endExclusive, '2027-02-01');
  assert.equal(result.current?.real, 1);
  assert.equal(result.deadline, '2028-11-01');
  assert.equal(objectiveSummary('2026-11-01', patients, [], '2027-11-10').current, null);
});
test('Sin ventas no hay calendario iniciado y las bajas afectan a activos', () => {
  assert.equal(objectiveSummary(null, [], []).current, null);
  assert.equal(
    objectiveSummary(
      '2024-01-01',
      [],
      [{ patient_id: 'p', starts_on: '2024-01-01', ends_on: '2024-02-01' }],
      '2024-02-02',
    ).active,
    0,
  );
});
test('CSV protege fórmulas, comillas y separadores y conserva números negativos', () => {
  assert.equal(csv([['=1+1', 'a";b', -2]]), '\uFEFF"\'=1+1";"a"";b";"-2"');
});
test('CSV usa separador decimal de España para importes numéricos', () => {
  assert.equal(csv([[71.11, -5.5]]), '\uFEFF"71,11";"-5,5"');
});
test('La fecha administrativa usa Madrid al cambiar de día', () => {
  assert.equal(todayMadrid(new Date('2026-10-18T23:30:00Z')), '2026-10-19');
});
test('La evolución mensual separa nuevas altas de reactivaciones y no presenta el futuro como resultado', () => {
  const patients = [{ id: '1', joined_on: '2026-11-10', kind: 'NUEVO', validated: true }];
  const periods = [
    { patient_id: '1', starts_on: '2026-11-10', ends_on: '2026-12-10' },
    { patient_id: '1', starts_on: '2027-01-02', ends_on: null },
  ];
  const series = monthlyEvolution('2026-11-01', patients, periods, '2027-01-10');
  assert.equal(series[0].incorporations, 1);
  assert.equal(series[1].departures, 1);
  assert.equal(series[1].active, 0);
  assert.equal(series[2].reactivations, 1);
  assert.equal(series[2].incorporations, 0);
  assert.equal(series[2].active, 1);
  assert.equal(series[3].future, true);
  assert.equal(series[3].active, null);
});
