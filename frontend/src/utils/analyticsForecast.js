const BOGOTA_TZ = "America/Bogota";
const WEEK_BUCKETS = [
    { week: 1, label: "Semana 1", startDay: 1, endDay: 7 },
    { week: 2, label: "Semana 2", startDay: 8, endDay: 14 },
    { week: 3, label: "Semana 3", startDay: 15, endDay: 21 },
    { week: 4, label: "Semana 4", startDay: 22, endDay: 31 },
];

function number(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function getBogotaToday(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: BOGOTA_TZ,
        year: "numeric",
        month: "numeric",
        day: "numeric",
    }).formatToParts(now);

    const find = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
    return { year: find("year"), month: find("month"), day: find("day") };
}

export function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

export function latestDailyDay(daily = []) {
    return daily.reduce((max, row) => Math.max(max, number(row.day)), 0);
}

function isBeforeMonth(year, month, today) {
    return year < today.year || (year === today.year && month < today.month);
}

function isCurrentMonth(year, month, today) {
    return year === today.year && month === today.month;
}

export function formatCurrency(value) {
    return `$${Math.round(number(value)).toLocaleString("es-CO")}`;
}

export function getAverageTicket(total, orders) {
    const count = number(orders);
    return count > 0 ? number(total) / count : 0;
}

export function getMonthProjection(monthData, now = new Date()) {
    const year = number(monthData?.year);
    const month = number(monthData?.month);
    const total = number(monthData?.total);
    const today = getBogotaToday(now);
    const totalDays = daysInMonth(year, month);
    const lastSaleDay = latestDailyDay(monthData?.daily);
    const closed = isBeforeMonth(year, month, today);
    const current = isCurrentMonth(year, month, today);

    if (!year || !month || closed) {
        return {
            value: total,
            label: "Cierre mensual",
            detail: `${totalDays || 0} días`,
            elapsedDays: totalDays || 0,
            totalDays: totalDays || 0,
            dailyAverage: totalDays > 0 ? total / totalDays : 0,
            isProjection: false,
        };
    }

    const elapsedDays = current
        ? Math.min(Math.max(today.day, lastSaleDay, 1), totalDays)
        : Math.max(lastSaleDay, 1);

    const projected = elapsedDays > 0 ? (total / elapsedDays) * totalDays : total;
    return {
        value: projected,
        label: "Proyección mensual",
        detail: `${elapsedDays}/${totalDays} días`,
        elapsedDays,
        totalDays,
        dailyAverage: elapsedDays > 0 ? total / elapsedDays : 0,
        isProjection: true,
    };
}

export function getWeeklyProjection(monthData, now = new Date()) {
    const year = number(monthData?.year);
    const month = number(monthData?.month);
    const total = number(monthData?.total);
    const weeks = Array.isArray(monthData?.weeks) ? monthData.weeks : [];
    const today = getBogotaToday(now);
    const totalDays = daysInMonth(year, month);
    const current = isCurrentMonth(year, month, today);

    if (current) {
        const bucket = WEEK_BUCKETS.find((week) => today.day >= week.startDay && today.day <= week.endDay) || WEEK_BUCKETS[0];
        const endDay = Math.min(bucket.endDay, totalDays);
        const elapsedDays = Math.min(Math.max(today.day - bucket.startDay + 1, 1), endDay - bucket.startDay + 1);
        const weekLength = Math.max(endDay - bucket.startDay + 1, 1);
        const currentWeek = weeks.find((week) => number(week.week) === bucket.week) || {};
        const revenue = number(currentWeek.revenue);

        return {
            value: elapsedDays > 0 ? (revenue / elapsedDays) * weekLength : revenue,
            label: "Proyección semanal",
            detail: `${bucket.label} · ${elapsedDays}/${weekLength} días`,
            isProjection: true,
        };
    }

    const activeWeeks = weeks.filter((week) => number(week.revenue) > 0 || number(week.orders) > 0);
    const divisor = activeWeeks.length || weeks.length || 1;

    return {
        value: divisor > 0 ? total / divisor : total,
        label: "Promedio semanal",
        detail: `${divisor} semana${divisor === 1 ? "" : "s"}`,
        isProjection: false,
    };
}
