// BACKEND: pagv2strbx/src/config/codePlatforms.js
module.exports = {
    chatgpt: {
        gmail_from: "tm.openai.com",
        code_regex: "(?:Tu\\s+c[o\\u00f3]digo\\s+de\\s+ChatGPT\\s+es|Your\\s+ChatGPT\\s+code\\s+is|Introduce\\s+este\\s+c[o\\u00f3]digo\\s+de\\s+verificaci[o\\u00f3]n\\s+temporal\\s+para\\s+continuar:?|Enter\\s+this\\s+temporary\\s+verification\\s+code\\s+to\\s+continue:?|c[o\\u00f3]digo\\s+de\\s+verificaci[o\\u00f3]n(?:\\s+temporal)?)[^0-9]{0,120}([0-9]{6})",
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
