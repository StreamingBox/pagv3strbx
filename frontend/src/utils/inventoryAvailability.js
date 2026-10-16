export const PROFILE_LABELS = {
    free: "Libre", occupied: "Ocupado", missing: "Sin cargar", replaced: "Reemplazado", unavailable: "No disponible", review: "Por revisar",
};

export function filterAvailabilityRows(rows, { providerFilter = "all", platformFilter = "all", search = "", availability = "all" } = {}) {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
        if (!row.accountActive) return false;
        if (providerFilter !== "all" && String(row.providerId || "none") !== providerFilter) return false;
        if (platformFilter !== "all" && String(row.platformId) !== platformFilter) return false;
        if (availability === "with_free" && !row.freeProfiles.length) return false;
        if (availability === "full" && row.availability !== "full") return false;
        if (availability === "review" && !row.reviewProfiles.length && row.classification !== "exception") return false;
        return !query || [row.accountEmail, row.platformName, row.providerName, row.providerAccountId, ...row.accountIds].join(" ").toLowerCase().includes(query);
    });
}

export function availabilityTotals(rows) {
    return rows.reduce((totals, row) => {
        if (!row.accountActive) return totals;
        totals.accounts += 1;
        totals.withFree += Number(row.freeProfiles.length > 0);
        totals.full += Number(row.availability === "full");
        totals.review += Number(row.reviewProfiles.length > 0 || row.classification === "exception");
        totals.free += row.freeProfiles.length;
        totals.occupied += row.occupiedProfiles.length;
        return totals;
    }, { accounts: 0, withFree: 0, full: 0, review: 0, free: 0, occupied: 0 });
}

export function availabilitySheets(rows) {
    const active = rows.filter((row) => row.accountActive);
    return {
        Cuentas: active.map((row) => ({
            Proveedor: row.providerName,
            "ID proveedor cuenta": row.providerAccountId || "",
            Plataforma: row.platformName,
            "Correo de cuenta": row.accountEmail,
            "Cantidad de perfiles": row.expectedProfiles,
            "Cantidad libres": row.freeProfiles.length,
            "Perfiles libres": row.freeProfiles.join(", "),
            "Cantidad ocupados": row.occupiedProfiles.length,
            "Perfiles ocupados": row.occupiedProfiles.join(", "),
            "Perfiles por revisar": row.reviewProfiles.join(", "),
            "Vencimiento proveedor": row.providerExpiresAt || "",
            "Renovación tarjeta": row.cardRenewalDate || "",
            Estado: "Activa",
        })),
        Perfiles: active.flatMap((row) => row.profiles.map((profile) => ({
            Proveedor: row.providerName,
            Plataforma: row.platformName,
            "Correo de cuenta": row.accountEmail,
            Perfil: profile.number,
            Estado: PROFILE_LABELS[profile.state],
            "IDs de inventario": profile.accountIds.join(", "),
            "Correo de cliente": profile.buyerEmails.join(", "),
            "Fecha del perfil": profile.expiresAt || "",
        }))),
    };
}
