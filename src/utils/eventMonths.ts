// Event months: March(2), April(3), June(5), September(8), November(10)
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

export function shouldPauseSubscription(date: Date = new Date()): boolean {
  const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return !isEventMonth(nextMonth);
}

export function shouldResumeSubscription(date: Date = new Date()): boolean {
  return isEventMonth(date) && date.getDate() === 1;
}
