import { civilDateInTimeZone } from "@/services/dates";

export interface Clock {
  now(): Date;
  today(timeZone: string): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  today(timeZone: string): Date {
    return civilDateInTimeZone(this.now(), timeZone);
  }
}

export class FixedClock implements Clock {
  constructor(private readonly instant: Date) {}

  now(): Date {
    return this.instant;
  }

  today(timeZone: string): Date {
    return civilDateInTimeZone(this.instant, timeZone);
  }
}
