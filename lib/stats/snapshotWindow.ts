export const BUSINESS_TIME_ZONE = "Europe/Paris";

export type SnapshotWindow = {
  days: number;
  snapshotDate: string | null;
  live: boolean;
  start: Date;
  end: Date;
  startDateYmd: string;
  endDateYmd: string;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const tzName = parts.find((part) => part.type === "timeZoneName")?.value || "GMT+00:00";
  const match = tzName.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  timeZone: string,
): Date {
  let utcTs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  for (let i = 0; i < 3; i += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcTs), timeZone);
    const nextUtcTs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - offsetMinutes * 60_000;
    if (nextUtcTs === utcTs) break;
    utcTs = nextUtcTs;
  }
  return new Date(utcTs);
}

export function isValidSnapshotDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

export function formatDateInTimeZone(date: Date, timeZone = BUSINESS_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

export function addDaysToYmd(ymd: string, deltaDays: number): string {
  const match = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid YMD date: ${ymd}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcNoon = new Date(Date.UTC(year, month - 1, day + deltaDays, 12, 0, 0, 0));
  return `${utcNoon.getUTCFullYear()}-${pad2(utcNoon.getUTCMonth() + 1)}-${pad2(utcNoon.getUTCDate())}`;
}

export function getDefaultSnapshotDate(now = new Date(), timeZone = BUSINESS_TIME_ZONE): string {
  return addDaysToYmd(formatDateInTimeZone(now, timeZone), -1);
}

export function snapshotDayBounds(snapshotDate: string, timeZone = BUSINESS_TIME_ZONE): {
  start: Date;
  endExclusive: Date;
} {
  if (!isValidSnapshotDate(snapshotDate)) throw new Error(`Invalid snapshotDate: ${snapshotDate}`);
  const [yearStr, monthStr, dayStr] = snapshotDate.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const start = zonedDateTimeToUtc(year, month, day, 0, 0, 0, 0, timeZone);
  const endDate = addDaysToYmd(snapshotDate, 1);
  const [endYearStr, endMonthStr, endDayStr] = endDate.split("-");
  const endExclusive = zonedDateTimeToUtc(Number(endYearStr), Number(endMonthStr), Number(endDayStr), 0, 0, 0, 0, timeZone);
  return { start, endExclusive };
}

export function buildSnapshotWindow(args: {
  days: number;
  snapshotDate?: string | null;
  fresh?: boolean;
  now?: Date;
  timeZone?: string;
}): SnapshotWindow {
  const days = Math.max(1, Math.floor(Number(args.days) || 1));
  const now = args.now instanceof Date ? args.now : new Date();
  const timeZone = args.timeZone || BUSINESS_TIME_ZONE;
  const explicitSnapshotDate = isValidSnapshotDate(args.snapshotDate) ? args.snapshotDate.trim() : "";
  const snapshotDate = explicitSnapshotDate || (!args.fresh ? getDefaultSnapshotDate(now, timeZone) : "");

  if (snapshotDate) {
    const endDateYmd = snapshotDate;
    const startDateYmd = addDaysToYmd(endDateYmd, -(days - 1));
    const { start } = snapshotDayBounds(startDateYmd, timeZone);
    const { endExclusive } = snapshotDayBounds(endDateYmd, timeZone);
    return {
      days,
      snapshotDate: endDateYmd,
      live: false,
      start,
      end: endExclusive,
      startDateYmd,
      endDateYmd,
    };
  }

  const end = now;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    days,
    snapshotDate: null,
    live: true,
    start,
    end,
    startDateYmd: start.toISOString().slice(0, 10),
    endDateYmd: end.toISOString().slice(0, 10),
  };
}
