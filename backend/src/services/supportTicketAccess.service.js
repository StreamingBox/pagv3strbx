function getSupportSubscriptionLookup(user, subscriptionId) {
    const isAdmin = String(user?.role || "").trim().toLowerCase() === "admin";
    return {
        isAdmin,
        where: `s.id = ?${isAdmin ? "" : " AND s.user_id = ?"}`,
        params: isAdmin ? [subscriptionId] : [subscriptionId, Number(user?.id)],
    };
}

module.exports = { getSupportSubscriptionLookup };
