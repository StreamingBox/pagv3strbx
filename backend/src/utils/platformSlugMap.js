// BACKEND: src/utils/platformSlugMap.js

function normalizeKey(s) {
    return String(s || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[^a-z0-9 ]/g, "");
}

const ALIASES = {
    netflix: "netflix",
    spotify: "spotify",
    chatgpt: "chatgpt",
    prime: "prime",
};

function toCodeSlug(platformSlugFromDBOrRequest) {
    const key = normalizeKey(platformSlugFromDBOrRequest);

    // ✅ CHATGPT
    if (key.includes("chatgpt") || key.includes("chat gpt")) return "chatgpt";

    // ✅ SPOTIFY (spotify-3m, spotify premium, etc)
    if (key.includes("spotify")) return "spotify";

    // ✅ PRIME VIDEO (prime video, amazon prime, primevideo, etc)
    if (key.includes("prime")) return "prime";

    // ✅ NETFLIX
    if (key.includes("netflix")) return "netflix";

    return ALIASES[key] || key.replace(/\s/g, "");
}

module.exports = { toCodeSlug };
