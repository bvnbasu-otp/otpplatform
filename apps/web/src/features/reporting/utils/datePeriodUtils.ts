import type { DateRange, PeriodType } from '../types/reporting';

export function calculateDateRange(
  periodType: PeriodType,
  customStart?: string,
  customEnd?: string
): DateRange {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  switch (periodType) {
    case 'DAILY': {
      return {
        startDate: todayStart,
        endDate: todayEnd,
        label: `Today (${now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })})`,
      };
    }

    case 'WEEKLY': {
      // Current week (Monday to Sunday)
      const day = now.getDay();
      const diffToMonday = (day + 6) % 7;
      const weekStart = new Date(todayStart);
      weekStart.setDate(todayStart.getDate() - diffToMonday);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      return {
        startDate: weekStart,
        endDate: weekEnd,
        label: `This Week (${weekStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - ${weekEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })})`,
      };
    }

    case 'MONTHLY': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      return {
        startDate: monthStart,
        endDate: monthEnd,
        label: `${now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} (MTD)`,
      };
    }

    case 'QUARTERLY': {
      // Indian Financial Year Quarters (Q1: Apr-Jun, Q2: Jul-Sep, Q3: Oct-Dec, Q4: Jan-Mar)
      const currentMonth = now.getMonth(); // 0-indexed (0=Jan, 3=Apr, 6=Jul, 9=Oct)
      let qStartMonth = 0;
      let qEndMonth = 2;
      let qName = 'Q4';

      if (currentMonth >= 3 && currentMonth <= 5) {
        qStartMonth = 3;
        qEndMonth = 5;
        qName = 'Q1 (Apr - Jun)';
      } else if (currentMonth >= 6 && currentMonth <= 8) {
        qStartMonth = 6;
        qEndMonth = 8;
        qName = 'Q2 (Jul - Sep)';
      } else if (currentMonth >= 9 && currentMonth <= 11) {
        qStartMonth = 9;
        qEndMonth = 11;
        qName = 'Q3 (Oct - Dec)';
      } else {
        qStartMonth = 0;
        qEndMonth = 2;
        qName = 'Q4 (Jan - Mar)';
      }

      const qStart = new Date(now.getFullYear(), qStartMonth, 1, 0, 0, 0, 0);
      const qEnd = new Date(now.getFullYear(), qEndMonth + 1, 0, 23, 59, 59, 999);

      return {
        startDate: qStart,
        endDate: qEnd,
        label: `Current Quarter: ${qName} ${now.getFullYear()}`,
      };
    }

    case 'YEARLY': {
      // Indian Financial Year: Apr 1 of current or previous year to Mar 31
      const currentYear = now.getFullYear();
      const isPostMarch = now.getMonth() >= 3;
      const fyStartYear = isPostMarch ? currentYear : currentYear - 1;
      const fyEndYear = fyStartYear + 1;

      const yearStart = new Date(fyStartYear, 3, 1, 0, 0, 0, 0);
      const yearEnd = new Date(fyEndYear, 2, 31, 23, 59, 59, 999);

      return {
        startDate: yearStart,
        endDate: yearEnd,
        label: `Financial Year FY ${fyStartYear}-${String(fyEndYear).slice(-2)}`,
      };
    }

    case 'CUSTOM': {
      const start = customStart ? new Date(customStart) : new Date(todayStart.getTime() - 30 * 86400000);
      const end = customEnd ? new Date(customEnd) : todayEnd;
      end.setHours(23, 59, 59, 999);

      return {
        startDate: start,
        endDate: end,
        label: `Custom Period: ${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} to ${end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
      };
    }
  }
}

export function isDateWithinRange(dateStr: string, range: DateRange): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getTime() >= range.startDate.getTime() && d.getTime() <= range.endDate.getTime();
}
