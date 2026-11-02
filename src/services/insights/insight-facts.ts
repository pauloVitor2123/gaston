import { toIsoDate } from "@/services/dates";
import type { PeriodSummary } from "@/services/metrics/weekly-summary";

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export interface DayFacts {
  dia: string;
  receita: number;
  gastos: number;
  horas_online: number | null;
  km: number | null;
  corridas: number | null;
  ganho_por_hora: number | null;
}

export interface WeekFacts {
  semana: string;
  receita: number;
  gastos: number;
  lucro: number;
  receita_por_plataforma: Record<string, number>;
  horas_online: number | null;
  km: number | null;
  corridas: number | null;
  ganho_por_hora: number | null;
  ganho_por_km: number | null;
  lucro_por_hora: number | null;
  minutos_por_corrida: number | null;
  valor_por_corrida: number | null;
  km_por_corrida: number | null;
  melhor_dia: string | null;
}

export interface InsightFacts {
  semana_atual: WeekFacts & { dias: DayFacts[] };
  semanas_anteriores: WeekFacts[];
}

export function hasEnoughData(summary: PeriodSummary): boolean {
  return summary.incomeCents > 0 && summary.effortSource !== "none";
}

export function buildInsightFacts(current: PeriodSummary, previous: PeriodSummary[]): InsightFacts {
  return {
    semana_atual: {
      ...weekFacts(current),
      dias: current.days.map((day) => ({
        dia: `${WEEKDAYS[day.date.getUTCDay()]} ${toIsoDate(day.date)}`,
        receita: reais(day.incomeCents),
        gastos: reais(day.expenseCents),
        horas_online: hours(day.onlineMinutes),
        km: day.km,
        corridas: day.rides,
        ganho_por_hora: nullableReais(day.grossPerHourCents),
      })),
    },
    semanas_anteriores: previous.map(weekFacts),
  };
}

function weekFacts(summary: PeriodSummary): WeekFacts {
  return {
    semana: toIsoDate(summary.start),
    receita: reais(summary.incomeCents),
    gastos: reais(summary.expenseCents),
    lucro: reais(summary.profitCents),
    receita_por_plataforma: Object.fromEntries(summary.incomeByPlatform.map((p) => [p.label, reais(p.amountCents)])),
    horas_online: hours(summary.onlineMinutes),
    km: summary.km,
    corridas: summary.rides,
    ganho_por_hora: nullableReais(summary.grossPerHourCents),
    ganho_por_km: nullableReais(summary.grossPerKmCents),
    lucro_por_hora: nullableReais(summary.profitPerHourCents),
    minutos_por_corrida: summary.avgRideMinutes,
    valor_por_corrida: nullableReais(summary.avgRideValueCents),
    km_por_corrida: summary.avgRideKm,
    melhor_dia: summary.bestDay ? WEEKDAYS[summary.bestDay.date.getUTCDay()]! : null,
  };
}

function reais(cents: number): number {
  return cents / 100;
}

function nullableReais(cents: number | null): number | null {
  return cents === null ? null : reais(cents);
}

function hours(minutes: number | null): number | null {
  return minutes === null ? null : Math.round((minutes / 60) * 10) / 10;
}
