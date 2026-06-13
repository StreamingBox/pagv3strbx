function isInventoryTrackedPlatform(platform) {
    return String(platform?.platform_type ?? platform?.type ?? "normal")
        .trim()
        .toLowerCase() !== "correo";
}

function calculateStockAlertTransitions(stockRows, stateRows) {
    const states = new Map(
        (stateRows || []).map(row => [Number(row.platform_id), Boolean(Number(row.is_out_of_stock))])
    );
    const outOfStock = [];
    const recovered = [];

    for (const row of (stockRows || []).filter(isInventoryTrackedPlatform)) {
        const platformId = Number(row.platform_id ?? row.id);
        const stock = Math.max(0, Number(row.effective_stock ?? row.stock ?? 0));
        const wasOutOfStock = states.get(platformId) === true;

        if (stock === 0 && !wasOutOfStock) outOfStock.push({ ...row, platformId, stock });
        if (stock > 0 && wasOutOfStock) recovered.push({ ...row, platformId, stock });
    }

    return { outOfStock, recovered };
}

module.exports = { calculateStockAlertTransitions, isInventoryTrackedPlatform };
