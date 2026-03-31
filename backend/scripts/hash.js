const bcrypt = require("bcrypt");

async function run() {
    const password = "tmC-XO2*"; // <-- cámbiala
    const saltRounds = 12;

    const hash = await bcrypt.hash(password, saltRounds);

    console.log("PASSWORD:", password);
    console.log("BCRYPT HASH:", hash);
}

run();
