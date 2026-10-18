import { addMonths, todayMadrid } from './dates';
type Patient = { id: string; joined_on: string; kind: string; validated: boolean };
type Period = { patient_id: string; starts_on: string; ends_on: string | null };
export const targets = [
  { total: 12, nuevo: 4, propio: 8 },
  { total: 10, nuevo: 7, propio: 3 },
  { total: 10, nuevo: 9, propio: 1 },
  { total: 18, nuevo: 13, propio: 5 },
];
export function monthlyEvolution(
  anchor: string | null,
  patients: Patient[],
  periods: Period[],
  today = todayMadrid(),
) {
  if (!anchor) return [];
  const elapsedMonths =
    (Number(today.slice(0, 4)) - Number(anchor.slice(0, 4))) * 12 +
    Number(today.slice(5, 7)) -
    Number(anchor.slice(5, 7));
  const start = addMonths(anchor, Math.max(0, Math.floor(elapsedMonths / 12)) * 12);
  return Array.from({ length: 12 }, (_, i) => {
    const month = addMonths(start, i),
      next = addMonths(month, 1),
      future = month > today;
    const lastDay = new Date(Date.parse(next) - 86400000).toISOString().slice(0, 10),
      cutoff = today < lastDay ? today : lastDay;
    return {
      month,
      future,
      incorporations: future
        ? 0
        : patients.filter(
            (p) => p.validated && p.joined_on >= month && p.joined_on < next && p.joined_on <= today,
          ).length,
      departures: future
        ? 0
        : periods.filter((p) => p.ends_on && p.ends_on >= month && p.ends_on < next && p.ends_on <= today)
            .length,
      reactivations: future
        ? 0
        : periods.filter(
            (p) =>
              p.starts_on >= month &&
              p.starts_on < next &&
              p.starts_on <= today &&
              patients.some((patient) => patient.id === p.patient_id && patient.joined_on !== p.starts_on),
          ).length,
      active: future
        ? null
        : new Set(
            periods
              .filter((p) => p.starts_on <= cutoff && (!p.ends_on || p.ends_on >= cutoff))
              .map((p) => p.patient_id),
          ).size,
    };
  });
}
export function objectiveSummary(
  anchor: string | null,
  patients: Patient[],
  periods: Period[],
  today = todayMadrid(),
) {
  const active = new Set(
    periods
      .filter((p) => p.starts_on <= today && (!p.ends_on || p.ends_on >= today))
      .map((p) => p.patient_id),
  ).size;
  if (!anchor) return { active, anchor: null, quarters: [], current: null, deadline: null };
  const monthDifference =
    (Number(today.slice(0, 4)) - Number(anchor.slice(0, 4))) * 12 +
    Number(today.slice(5, 7)) -
    Number(anchor.slice(5, 7));
  const currentIndex = Math.max(0, Math.floor(monthDifference / 3));
  const quarters = targets.map((target, index) => {
    const start = addMonths(anchor, index * 3),
      endExclusive = addMonths(start, 3);
    const real = patients.filter(
      (p) => p.validated && p.joined_on >= start && p.joined_on < endExclusive && p.joined_on <= today,
    );
    const elapsed = Math.max(
      0,
      Math.min(
        1,
        (Date.parse(today) - Date.parse(start) + 86400000) / (Date.parse(endExclusive) - Date.parse(start)),
      ),
    );
    const expected = target.total * elapsed;
    const remainingDays = Math.max(0, Math.ceil((Date.parse(endExclusive) - Date.parse(today)) / 86400000));
    return {
      ...target,
      index,
      start,
      endExclusive,
      real: real.length,
      realNuevo: real.filter((p) => p.kind === 'NUEVO').length,
      realPropio: real.filter((p) => p.kind === 'PROPIO').length,
      expected,
      percentage: (real.length / target.total) * 100,
      remaining: Math.max(0, target.total - real.length),
      remainingDays,
    };
  });
  return {
    active,
    anchor,
    quarters,
    current: quarters[currentIndex] ?? null,
    deadline: addMonths(anchor, 24),
  };
}
