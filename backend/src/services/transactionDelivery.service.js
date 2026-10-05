function timestamp(value) {
    const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
}

function resolveDeliveredAccountId(currentAccountId, orderCreatedAt, events, orderId) {
    const orderTime = timestamp(orderCreatedAt);
    if (orderTime === null) return currentAccountId ?? null;

    const datedEvents = events
        .map((event) => ({ ...event, time: timestamp(event.created_at) }))
        .filter((event) => event.time !== null);
    const beforeOrder = datedEvents
        .filter((event) => event.time < orderTime
            || (event.source === "renewal" && Number(event.renewal_order_id) === Number(orderId)))
        .sort((left, right) => right.time - left.time || Number(right.id) - Number(left.id));

    if (beforeOrder[0]?.new_account_id) return Number(beforeOrder[0].new_account_id);

    const afterOrder = datedEvents
        .filter((event) => event.time > orderTime
            || (event.source === "replacement" && Number(event.order_id) === Number(orderId)))
        .sort((left, right) => left.time - right.time || Number(left.id) - Number(right.id));

    return Number(afterOrder[0]?.old_account_id) || currentAccountId || null;
}

module.exports = { resolveDeliveredAccountId };
