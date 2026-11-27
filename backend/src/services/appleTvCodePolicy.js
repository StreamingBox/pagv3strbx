const cheerio = require("cheerio");

const APPLE_TV_CODE_WINDOW_MINUTES = 30;

function isAppleSender(value) {
    const addresses = String(value || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi) || [];
    return addresses.some((address) => /@(?:[a-z0-9-]+\.)*apple\.com$/i.test(address));
}

function isAppleTvOtpSubject(subject) {
    return /your\s+sign-in\s+code\s+for\s+apple\s+tv/i.test(String(subject || ""));
}

function extractAppleTvOtpCode(parsed) {
    const bodies = [String(parsed?.text || "")];
    if (parsed?.html) {
        try {
            const $ = cheerio.load(String(parsed.html));
            bodies.push($("body").text() || $.text() || "");
        } catch {
            bodies.push("");
        }
    }

    for (const body of bodies) {
        const heading = /your\s+sign-in\s+code\s+for\s+apple\s+tv/i.exec(body);
        if (!heading) continue;
        const context = body.slice(heading.index + heading[0].length, heading.index + heading[0].length + 180);
        const match = context.match(/((?:\d[\s\u00a0-]*){5}\d)(?!\d)/);
        if (match) return match[1].replace(/\D/g, "");
    }

    return null;
}

module.exports = {
    APPLE_TV_CODE_WINDOW_MINUTES,
    extractAppleTvOtpCode,
    isAppleSender,
    isAppleTvOtpSubject,
};
