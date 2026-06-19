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

function average(values = []) {
    const clean = values.map(number).filter((value) => Number.isFinite(value));
    return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function weightedAverage(values = []) {
    const clean = values.map(number);
    const weightSum = clean.reduce((sum, _value, index) => sum + index + 1, 0);
    if (!weightSum) return 0;
    return clean.reduce((sum, value, index) => sum + value * (index + 1), 0) / weightSum;
}

function clamp(value, min, max) {
    return Math.min(Math.max(number(value), min), max);
}

function getDailyRevenueMap(daily = []) {
    return daily.reduce((map, row) => {
        const day = number(row.day);
        if (day > 0) map[day] = number(row.revenue);
        return map;
    }, {});
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

export function buildMonthProjectionSeries(monthData, peerMonths = [], now = new Date()) {
    const year = number(monthData?.year);
    const month = number(monthData?.month);
    const total = number(monthData?.total);
    const today = getBogotaToday(now);
    const totalDays = daysInMonth(year, month);
    const lastSaleDay = latestDailyDay(monthData?.daily);
    const current = isCurrentMonth(year, month, today);
    if (!year || !month || !current || !totalDays) {
        return null;
    }

    const elapsedDays = Math.min(Math.max(today.day, lastSaleDay, 1), totalDays);
    const dailyMap = getDailyRevenueMap(monthData?.daily);
    const actualValues = Array.from({ length: elapsedDays }, (_item, index) => dailyMap[index + 1] ?? 0);
    const totalFromDaily = actualValues.reduce((sum, value) => sum + value, 0);
    const actualTotal = total || totalFromDaily;
    if (actualTotal <= 0) return null;

    // Today's revenue is still incomplete and must not create a false downward trend.
    const completedDays = Math.min(Math.max(today.day - 1, 0), elapsedDays);
    const trendValues = completedDays > 0
        ? actualValues.slice(0, completedDays)
        : actualValues;
    const trendTotal = trendValues.reduce((sum, value) => sum + value, 0);
    const currentPace = trendValues.length > 0
        ? (trendTotal || actualTotal) / trendValues.length
        : 0;
    const recentWindow = trendValues.slice(-7);
    const previousWindow = trendValues.slice(-14, -7);
    const recentAverage = weightedAverage(recentWindow) || currentPace;
    const previousAverage = average(previousWindow) || currentPace;
    const trendRatio = previousAverage > 0
        ? clamp(recentAverage / previousAverage, 0.75, 1.25)
        : 1;

    const peerDailyMaps = peerMonths
        .filter((peer) => !isCurrentMonth(number(peer?.year), number(peer?.month), today))
        .map((peer) => getDailyRevenueMap(peer?.daily))
        .filter((map) => Object.keys(map).length > 0);
    const peerValues = peerDailyMaps.flatMap((map) => Object.values(map).map(number));
    const peerPace = average(peerValues);
    const peerScale = peerPace > 0 && currentPace > 0 ? currentPace / peerPace : 1;
    const maxActual = Math.max(...actualValues, currentPace, recentAverage, 1);
    const forecastCap = Math.max(maxActual * 1.65, currentPace * 2.4, 1);
    const positiveRecent = recentWindow.filter((value) => value > 0);
    const forecastFloor = Math.max(
        currentPace * 0.22,
        average(positiveRecent) * 0.25,
        1
    );

    const series = [];
    for (let day = 1; day <= elapsedDays; day += 1) {
        const window = actualValues.slice(Math.max(0, day - 4), day);
        series.push({
            day,
            value: weightedAverage(window),
            phase: "history",
        });
    }

    const forecastValues = [];
    for (let day = elapsedDays + 1; day <= totalDays; day += 1) {
        const daysAhead = day - elapsedDays;
        const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
        const weekdayValues = trendValues.filter((_value, index) => (
            new Date(Date.UTC(year, month - 1, index + 1)).getUTCDay() === weekday
        ));
        const weekdayPattern = weightedAverage(weekdayValues.slice(-4)) || recentAverage;
        const peerDayValues = peerDailyMaps
            .map((map) => number(map[day]))
            .filter((value) => value > 0);
        const peerPattern = average(peerDayValues) * peerScale;
        const seasonalPattern = peerPattern > 0
            ? weekdayPattern * 0.55 + peerPattern * 0.45
            : weekdayPattern;
        const baseValue = recentAverage * 0.45 + currentPace * 0.2 + seasonalPattern * 0.35;
        // Recent growth or decline fades gradually instead of extending as a line to zero.
        const trendMultiplier = 1 + (trendRatio - 1) * Math.exp(-(daysAhead - 1) / 6);
        const forecastValue = clamp(baseValue * trendMultiplier, forecastFloor, forecastCap);
        forecastValues.push(forecastValue);
        series.push({
            day,
            value: forecastValue,
            phase: "forecast",
        });
    }

    const projectedTotal = actualTotal + forecastValues.reduce((sum, value) => sum + value, 0);
    return {
        value: projectedTotal,
        label: "Proyección por tendencia",
        detail: `${elapsedDays} reales · ${Math.max(totalDays - elapsedDays, 0)} estimados`,
        elapsedDays,
        totalDays,
        dailyAverage: elapsedDays > 0 ? actualTotal / elapsedDays : 0,
        series,
        isProjection: true,
    };
}

export function getMonthProjection(monthData, now = new Date(), options = {}) {
    const year = number(monthData?.year);
    const month = number(monthData?.month);
    const total = number(monthData?.total);
    const today = getBogotaToday(now);
    const totalDays = daysInMonth(year, month);
    const closed = isBeforeMonth(year, month, today);

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

    const adaptiveProjection = buildMonthProjectionSeries(monthData, options.peerMonths || [], now);
    if (adaptiveProjection) return adaptiveProjection;

    return {
        value: total,
        label: "Corte actual",
        detail: `${totalDays || 0} días`,
        elapsedDays: totalDays || 0,
        totalDays: totalDays || 0,
        dailyAverage: totalDays > 0 ? total / totalDays : 0,
        isProjection: false,
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
