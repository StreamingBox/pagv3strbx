const { currentBogotaDateOnly, formatDateOnlyBogota } = require("./date");

function getRenewalEligibility({
    expiresAt,
    isRenewable,
    status,
    isAttended,
    renewalCount = 0,
    platformSlug = "",
    platformName = "",
    now = new Date(),
}) {
    const normalizedSlug = String(platformSlug || "").trim().toLowerCase();
    const normalizedName = String(platformName || "").trim().toLowerCase();
    const isYoutubeMusic =
        normalizedSlug === "youtube-music" ||
        normalizedSlug === "youtubemusic" ||
        (normalizedName.includes("youtube") && normalizedName.includes("music"));

    if (!isRenewable) {
        return {
            canRenew: false,
            expiresOnDate: formatDateOnlyBogota(expiresAt),
            reason: "Este plan no tiene renovación habilitada.",
        };
    }

    if (String(status || "").toLowerCase() === "cancelled") {
        return {
            canRenew: false,
            expiresOnDate: formatDateOnlyBogota(expiresAt),
            reason: "La suscripción está cancelada.",
        };
    }

    if (Number(isAttended) === 1) {
        return {
            canRenew: false,
            expiresOnDate: formatDateOnlyBogota(expiresAt),
            reason: "La suscripción ya fue atendida desde vencimientos.",
        };
    }

    if (isYoutubeMusic && Number(renewalCount || 0) >= 2) {
        return {
            canRenew: false,
            expiresOnDate: formatDateOnlyBogota(expiresAt),
            reason: "YouTube Music solo permite 2 renovaciones. Esta cuenta ya alcanzó el límite.",
        };
    }

    const expiresOnDate = formatDateOnlyBogota(expiresAt);
    if (!expiresOnDate || expiresOnDate === "-") {
        return {
            canRenew: false,
            expiresOnDate: "-",
            reason: "La suscripción no tiene una fecha de vencimiento válida.",
        };
    }

    const todayBogota = currentBogotaDateOnly(now);
    if (expiresOnDate < todayBogota) {
        return {
            canRenew: false,
            expiresOnDate,
            reason: "La renovación solo está permitida hasta las 11:59 p. m. del día de vencimiento en Colombia.",
        };
    }

    return {
        canRenew: true,
        expiresOnDate,
        reason: "",
    };
}

module.exports = { getRenewalEligibility };
