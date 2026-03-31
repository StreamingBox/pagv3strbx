function makeOrderCode() {
    const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `ORD-${Date.now().toString(36).toUpperCase()}-${rnd}`;
}

module.exports = { makeOrderCode };
