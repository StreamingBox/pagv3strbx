// BACKEND: pagv2strbx/src/config/codePlatforms.js
module.exports = {
    chatgpt: {
        gmail_from: "tm.openai.com",
        code_regex: "(?:Tu\\s+código\\s+de\\s+ChatGPT\\s+es|Your\\s+ChatGPT\\s+code\\s+is)\\s*([0-9]{6})",
        max_age_minutes: 15,
        is_active: 1,
    },

    // agrega aquí las otras si quieres
    netflix: {
        gmail_from: "netflix.com",
        code_regex: "([0-9]{4,8})",
        max_age_minutes: 15,
        is_active: 1,
    },
};
