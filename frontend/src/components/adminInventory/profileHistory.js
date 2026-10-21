function recency(profile = {}) {
    const timestamp = Date.parse(profile.updated_at || profile.created_at || "");
    if (Number.isFinite(timestamp)) return timestamp;

    const id = Number(profile.id);
    return Number.isFinite(id) ? id : 0;
}

function profileKey(profile = {}) {
    // The API already scopes these rows to one platform and email. Legacy rows
    // can lack an identity even when they refer to the same numbered screen.
    const number = String(profile.profile_number ?? "").trim();
    if (number) return `profile:${number.toLowerCase()}`;

    if (profile.identity_id !== null && profile.identity_id !== undefined && String(profile.identity_id).trim()) {
        return `identity:${profile.identity_id}`;
    }

    return `account:${profile.id}`;
}

function profileOrder(a = {}, b = {}) {
    const aNumber = String(a.profile_number ?? "").trim();
    const bNumber = String(b.profile_number ?? "").trim();
    if (Boolean(aNumber) !== Boolean(bNumber)) return aNumber ? -1 : 1;

    return aNumber.localeCompare(bNumber, undefined, { numeric: true })
        || Number(a.id || 0) - Number(b.id || 0);
}

export function splitProfileHistory(profiles = []) {
    const latestByProfile = new Map();
    const history = [];

    for (const profile of profiles) {
        const key = profileKey(profile);
        const previous = latestByProfile.get(key);
        if (!previous) {
            latestByProfile.set(key, profile);
            continue;
        }

        if (recency(profile) > recency(previous)) {
            history.push(previous);
            latestByProfile.set(key, profile);
        } else {
            history.push(profile);
        }
    }

    return {
        latest: [...latestByProfile.values()].sort(profileOrder),
        history: history.sort((a, b) => recency(b) - recency(a) || profileOrder(a, b)),
    };
}
