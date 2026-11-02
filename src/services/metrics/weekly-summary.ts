import { addDaysUtc, toIsoDate } from "@/services/dates";

export interface WorkLogEntry {
  period: "day" | "week";
  periodStart: Date;
  km: number | null;
  onlineMinutes: number | null;
  rides: number | null;
}

export interface DayMoney {
  date: Date;
  incomeCents: number;
  expenseCents: number;
}

export interface PlatformIncome {
  label: string;
  amountCents: number;
}

export interface WeekInputs {
  weekStart: Date;
  days: DayMoney[];
  incomeByPlatform: PlatformIncome[];
  workLogs: WorkLogEntry[];
}

export interface PeriodInputs {
  start: Date;
  dayCount: number;
  days: DayMoney[];
  incomeByPlatform: PlatformIncome[];
  workLogs: WorkLogEntry[];
}

export interface DaySummary {
  date: Date;
  incomeCents: number;
  expenseCents: number;
  km: number | null;
  onlineMinutes: number | null;
  rides: number | null;
  grossPerHourCents: number | null;
}

export interface PeriodSummary {
  start: Date;
  end: Date;
  incomeCents: number;
  expenseCents: number;
  profitCents: number;
  incomeByPlatform: PlatformIncome[];
  effortSource: "week" | "days" | "mixed" | "none";
  km: number | null;
  onlineMinutes: number | null;
  rides: number | null;
  grossPerHourCents: number | null;
  grossPerKmCents: number | null;
  profitPerHourCents: number | null;
  profitPerKmCents: number | null;
  avgRideMinutes: number | null;
  avgRideValueCents: number | null;
  avgRideKm: number | null;
  bestDay: { date: Date; incomeCents: number } | null;
  days: DaySummary[];
}

type Measure = "km" | "onlineMinutes" | "rides";

interface Effort {
  km: number | null;
  onlineMinutes: number | null;
  rides: number | null;
}

interface EffortUnit extends Effort {
  incomeCents: number;
  expenseCents: number;
}

interface PairedTotals {
  incomeCents: number;
  expenseCents: number;
  km: number;
  onlineMinutes: number;
  rides: number;
}

const DAYS_IN_WEEK = 7;

export function summarizeWeek(inputs: WeekInputs): PeriodSummary {
  const { weekStart, ...rest } = inputs;
  return summarizePeriod({ start: weekStart, dayCount: DAYS_IN_WEEK, ...rest });
}

export function summarizePeriod(inputs: PeriodInputs): PeriodSummary {
  const days = buildDays(inputs);
  const incomeCents = sum(days.map((d) => d.incomeCents));
  const expenseCents = sum(days.map((d) => d.expenseCents));
  const weeks = loggedWeeks(inputs, days);
  const coveredDays = new Set(weeks.flatMap((w) => w.dayKeys));
  const looseDays = days.filter((d) => !coveredDays.has(toIsoDate(d.date)));
  const dayEffort = sumEffort(looseDays);
  const units: EffortUnit[] = [...weeks.map((w) => w.unit), ...looseDays];
  const effort = sumEffort(units);

  const perHour = pair(units, ["onlineMinutes"]);
  const perKm = pair(units, ["km"]);
  const perRide = pair(units, ["rides"]);
  const rideTime = pair(units, ["rides", "onlineMinutes"]);
  const rideKm = pair(units, ["rides", "km"]);

  return {
    start: inputs.start,
    end: addDaysUtc(inputs.start, inputs.dayCount - 1),
    incomeCents,
    expenseCents,
    profitCents: incomeCents - expenseCents,
    incomeByPlatform: [...inputs.incomeByPlatform].sort((a, b) => b.amountCents - a.amountCents),
    effortSource: effortSourceOf(weeks.length > 0, hasAny(dayEffort)),
    km: effort.km,
    onlineMinutes: effort.onlineMinutes,
    rides: effort.rides,
    grossPerHourCents: perHourCents(perHour.incomeCents, perHour.onlineMinutes),
    grossPerKmCents: ratio(perKm.incomeCents, perKm.km),
    profitPerHourCents: perHourCents(perHour.incomeCents - perHour.expenseCents, perHour.onlineMinutes),
    profitPerKmCents: ratio(perKm.incomeCents - perKm.expenseCents, perKm.km),
    avgRideMinutes: ratio(rideTime.onlineMinutes, rideTime.rides),
    avgRideValueCents: ratio(perRide.incomeCents, perRide.rides),
    avgRideKm: oneDecimal(rideKm.km, rideKm.rides),
    bestDay: bestDayOf(days),
    days,
  };
}

function buildDays(inputs: PeriodInputs): DaySummary[] {
  return Array.from({ length: inputs.dayCount }, (_, offset) => {
    const date = addDaysUtc(inputs.start, offset);
    const key = toIsoDate(date);
    const money = inputs.days.filter((d) => toIsoDate(d.date) === key);
    const logs = inputs.workLogs.filter((log) => log.period === "day" && toIsoDate(log.periodStart) === key);
    const effort = sumEffort(logs);
    const incomeCents = sum(money.map((m) => m.incomeCents));
    return {
      date,
      incomeCents,
      expenseCents: sum(money.map((m) => m.expenseCents)),
      ...effort,
      grossPerHourCents: perHourCents(incomeCents, effort.onlineMinutes ?? 0),
    };
  });
}

function loggedWeeks(inputs: PeriodInputs, days: DaySummary[]): { dayKeys: string[]; unit: EffortUnit }[] {
  const dayKeys = days.map((d) => toIsoDate(d.date));
  const weekStarts = [
    ...new Set(inputs.workLogs.filter((log) => log.period === "week").map((log) => toIsoDate(log.periodStart))),
  ];
  return weekStarts.flatMap((weekKey) => {
    const firstIndex = dayKeys.indexOf(weekKey);
    if (firstIndex < 0 || firstIndex + DAYS_IN_WEEK > days.length) return [];
    const weekDays = days.slice(firstIndex, firstIndex + DAYS_IN_WEEK);
    const logs = inputs.workLogs.filter((log) => log.period === "week" && toIsoDate(log.periodStart) === weekKey);
    return [
      {
        dayKeys: dayKeys.slice(firstIndex, firstIndex + DAYS_IN_WEEK),
        unit: {
          incomeCents: sum(weekDays.map((d) => d.incomeCents)),
          expenseCents: sum(weekDays.map((d) => d.expenseCents)),
          ...sumEffort(logs),
        },
      },
    ];
  });
}

function effortSourceOf(hasWeeks: boolean, hasDays: boolean): PeriodSummary["effortSource"] {
  if (hasWeeks) return hasDays ? "mixed" : "week";
  return hasDays ? "days" : "none";
}

function sumEffort(entries: Effort[]): Effort {
  return {
    km: sumNullable(entries.map((e) => e.km)),
    onlineMinutes: sumNullable(entries.map((e) => e.onlineMinutes)),
    rides: sumNullable(entries.map((e) => e.rides)),
  };
}

function pair(units: EffortUnit[], measures: Measure[]): PairedTotals {
  const paired = units.filter((u) => measures.every((m) => (u[m] ?? 0) > 0));
  return {
    incomeCents: sum(paired.map((u) => u.incomeCents)),
    expenseCents: sum(paired.map((u) => u.expenseCents)),
    km: sum(paired.map((u) => u.km ?? 0)),
    onlineMinutes: sum(paired.map((u) => u.onlineMinutes ?? 0)),
    rides: sum(paired.map((u) => u.rides ?? 0)),
  };
}

function bestDayOf(days: DaySummary[]): PeriodSummary["bestDay"] {
  const best = days.reduce<DaySummary | null>(
    (top, d) => (d.incomeCents > (top?.incomeCents ?? 0) ? d : top),
    null,
  );
  return best ? { date: best.date, incomeCents: best.incomeCents } : null;
}

function perHourCents(cents: number, minutes: number): number | null {
  return minutes > 0 ? Math.round((cents * 60) / minutes) : null;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round(numerator / denominator) : null;
}

function oneDecimal(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 10) / 10 : null;
}

function hasAny(effort: Effort): boolean {
  return effort.km !== null || effort.onlineMinutes !== null || effort.rides !== null;
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

function sumNullable(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length > 0 ? sum(present) : null;
}
