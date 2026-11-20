// Event months: March(2), April(3), June(5), September(8), November(10)
// The Event plan ("Pay only in event months") is charged only when a renewal lands in one of these.
// scripts/event-plan-overcharges.mjs keeps its own copy of this list: change both together.
const EVENT_MONTHS = [2, 3, 5, 8, 10]; // 0-indexed

export function isEventMonth(date: Date = new Date()): boolean {
  return EVENT_MONTHS.includes(date.getMonth());
}

export function getNextEventMonth(fromDate: Date = new Date()): Date {
  const currentMonth = fromDate.getMonth();
  const currentYear = fromDate.getFullYear();

  const nextMonth = EVENT_MONTHS.find(m => m > currentMonth);

  if (nextMonth !== undefined) {
    return new Date(currentYear, nextMonth, 1, 0, 0, 0, 0);
  }

  return new Date(currentYear + 1, EVENT_MONTHS[0], 1, 0, 0, 0, 0);
}

/**
 * Should the Event plan renewal due at `nextBill` be charged? Only when it falls in an event
 * month (UTC, like Stripe's timestamps). The cron pauses collection (invoice voided) otherwise.
 * Deciding on the renewal date, not today's date, means a subscription that renews mid-month is
 * paused before its quiet-month invoice, and any daily run before the renewal catches it.
 */
export function shouldCollectRenewal(nextBill: Date): boolean {
  return EVENT_MONTHS.includes(nextBill.getUTCMonth());
}
