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

export interface DaySummary {
  date: Date;
  incomeCents: number;
  expenseCents: number;
  km: number | null;
  onlineMinutes: number | null;
  rides: number | null;
  grossPerHourCents: number | null;
}

export interface WeekSummary {
  weekStart: Date;
  weekEnd: Date;
  incomeCents: number;
  expenseCents: number;
  profitCents: number;
  incomeByPlatform: PlatformIncome[];
  effortSource: "week" | "days" | "none";
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

interface PairedTotals {
  incomeCents: number;
  expenseCents: number;
  km: number;
  onlineMinutes: number;
  rides: number;
}

const DAYS_IN_WEEK = 7;

export function summarizeWeek(inputs: WeekInputs): WeekSummary {
  const days = buildDays(inputs);
  const incomeCents = sum(days.map((d) => d.incomeCents));
  const expenseCents = sum(days.map((d) => d.expenseCents));
  const weekLogs = inputs.workLogs.filter((log) => log.period === "week");
  const weekEffort = weekLogs.length > 0 ? sumEffort(weekLogs) : null;
  const dayEffort = sumEffort(days);
  const effort = weekEffort ?? dayEffort;
  const effortSource = weekEffort ? "week" : hasAny(dayEffort) ? "days" : "none";

  const paired = (measures: Measure[]): PairedTotals =>
    weekEffort ? weekPairing(weekEffort, incomeCents, expenseCents) : dayPairing(days, measures);

  const perHour = paired(["onlineMinutes"]);
  const perKm = paired(["km"]);
  const perRide = paired(["rides"]);
  const rideTime = paired(["rides", "onlineMinutes"]);
  const rideKm = paired(["rides", "km"]);

  return {
    weekStart: inputs.weekStart,
    weekEnd: addDaysUtc(inputs.weekStart, DAYS_IN_WEEK - 1),
    incomeCents,
    expenseCents,
    profitCents: incomeCents - expenseCents,
    incomeByPlatform: [...inputs.incomeByPlatform].sort((a, b) => b.amountCents - a.amountCents),
    effortSource,
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

function buildDays(inputs: WeekInputs): DaySummary[] {
  return Array.from({ length: DAYS_IN_WEEK }, (_, offset) => {
    const date = addDaysUtc(inputs.weekStart, offset);
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

function sumEffort(entries: Effort[]): Effort {
  return {
    km: sumNullable(entries.map((e) => e.km)),
    onlineMinutes: sumNullable(entries.map((e) => e.onlineMinutes)),
    rides: sumNullable(entries.map((e) => e.rides)),
  };
}

function weekPairing(effort: Effort, incomeCents: number, expenseCents: number): PairedTotals {
  return {
    incomeCents,
    expenseCents,
    km: effort.km ?? 0,
    onlineMinutes: effort.onlineMinutes ?? 0,
    rides: effort.rides ?? 0,
  };
}

function dayPairing(days: DaySummary[], measures: Measure[]): PairedTotals {
  const paired = days.filter((d) => measures.every((m) => (d[m] ?? 0) > 0));
  return {
    incomeCents: sum(paired.map((d) => d.incomeCents)),
    expenseCents: sum(paired.map((d) => d.expenseCents)),
    km: sum(paired.map((d) => d.km ?? 0)),
    onlineMinutes: sum(paired.map((d) => d.onlineMinutes ?? 0)),
    rides: sum(paired.map((d) => d.rides ?? 0)),
  };
}

function bestDayOf(days: DaySummary[]): WeekSummary["bestDay"] {
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
