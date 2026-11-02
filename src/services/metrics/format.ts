import { addDaysUtc, formatDayMonth } from "@/services/dates";
import { formatReais } from "@/services/money";
import type { WeekSummary, WorkLogEntry } from "@/services/metrics/weekly-summary";

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const WORK_LOG_HINT =
  'Pra ver R$/hora e R$/km, me conte sua jornada: "rodei 200km, 9h online, 18 corridas".';

export function formatWeekSummary(summary: WeekSummary): string {
  const header = `📊 Semana ${weekRange(summary.weekStart)}`;
  const hasEffort = summary.effortSource !== "none";
  if (summary.incomeCents === 0 && summary.expenseCents === 0 && !hasEffort) {
    return `${header}\n\nNada registrado nesta semana ainda.`;
  }

  const lines = [header, ""];
  const platforms = summary.incomeByPlatform
    .map((p) => `${p.label} ${formatReais(p.amountCents)}`)
    .join(" · ");
  lines.push(`Receita ${formatReais(summary.incomeCents)}${platforms ? ` (${platforms})` : ""}`);
  lines.push(`Gastos ${formatReais(summary.expenseCents)}`);
  lines.push(`Lucro ${formatReais(summary.profitCents)}`);

  const productivity = joinPresent([
    perUnit(summary.grossPerHourCents, "h"),
    perUnit(summary.grossPerKmCents, "km"),
  ]);
  if (productivity) {
    const profit = joinPresent([perUnit(summary.profitPerHourCents, "h"), perUnit(summary.profitPerKmCents, "km")]);
    lines.push("", `⏱ ${productivity}${profit ? `  (lucro ${profit})` : ""}`);
  }

  const effort = effortParts(summary);
  if (effort) lines.push(`🚗 ${effort}`);

  const perRide = joinPresent([
    summary.avgRideMinutes !== null ? `${summary.avgRideMinutes} min/corrida` : null,
    summary.avgRideValueCents !== null ? `${formatReais(summary.avgRideValueCents)}/corrida` : null,
    summary.avgRideKm !== null ? `${decimal(summary.avgRideKm)} km/corrida` : null,
  ]);
  if (perRide) lines.push(`🧭 ${perRide}`);

  if (summary.bestDay) {
    lines.push(`🏆 Melhor dia: ${dayLabel(summary.bestDay.date)} (${formatReais(summary.bestDay.incomeCents)})`);
  }
  if (!hasEffort && summary.incomeCents > 0) lines.push("", WORK_LOG_HINT);

  lines.push("", "📈 Painel: /dashboard");
  return lines.join("\n");
}

export function formatWorkLog(log: WorkLogEntry): string {
  const when = log.period === "week" ? `da semana ${weekRange(log.periodStart)}` : `de ${dayLabel(log.periodStart)}`;
  return `🚗 Jornada ${when} — ${effortParts(log)}`;
}

export function formatDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

export function formatKm(km: number): string {
  return `${decimal(km)} km`;
}

function effortParts(effort: Pick<WorkLogEntry, "km" | "onlineMinutes" | "rides">): string {
  return joinPresent([
    effort.km !== null ? formatKm(effort.km) : null,
    effort.onlineMinutes !== null ? `${formatDuration(effort.onlineMinutes)} online` : null,
    effort.rides !== null ? `${effort.rides} ${effort.rides === 1 ? "corrida" : "corridas"}` : null,
  ]);
}

function perUnit(cents: number | null, unit: string): string | null {
  return cents === null ? null : `${formatReais(cents)}/${unit}`;
}

function weekRange(weekStart: Date): string {
  return `${formatDayMonth(weekStart)} – ${formatDayMonth(addDaysUtc(weekStart, 6))}`;
}

function dayLabel(date: Date): string {
  return `${WEEKDAYS[date.getUTCDay()]} ${formatDayMonth(date)}`;
}

function decimal(value: number): string {
  return String(Math.round(value * 10) / 10).replace(".", ",");
}

function joinPresent(parts: (string | null)[]): string {
  return parts.filter((p): p is string => p !== null).join(" · ");
}
