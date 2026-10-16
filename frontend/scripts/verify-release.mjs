import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(process.argv[2] || path.join(scriptDir, "..", "dist"));
const indexPath = path.join(distDir, "index.html");

function fail(message) {
    console.error(`Frontend release validation failed: ${message}`);
    process.exit(1);
}

if (!fs.existsSync(indexPath)) fail(`missing ${indexPath}`);

const indexHtml = fs.readFileSync(indexPath, "utf8");
const entryScript = indexHtml.match(/<script\b[^>]*\bsrc="([^"]*\/assets\/index-[^"]+\.js)"/);
if (!entryScript) fail("index.html does not reference a hashed Vite entry script");
if (!fs.existsSync(path.join(distDir, entryScript[1].replace(/^\//, "")))) {
    fail(`entry asset is missing: ${entryScript[1]}`);
}
const entrySource = fs.readFileSync(path.join(distDir, entryScript[1].replace(/^\//, "")), "utf8");

const assetsDir = path.join(distDir, "assets");
const requiredChunks = [
    {
        prefix: "AdminAccounts-",
        features: ["Nombre del canal de YouTube *", "YouTube Music y YouTube 3 meses requieren la columna"],
    },
    {
        prefix: "Codes-",
        features: [
            "¿Solicitar el código?",
            "El código es válido por 30 segundos.",
            "Como administrador, puedes volver a solicitar el código cuando lo necesites.",
        ],
    },
    {
        prefix: "AdminProviders-",
        features: ["Top 5 proveedores", "Recordatorio de renovación"],
    },
];

if (!fs.existsSync(assetsDir)) fail("missing assets directory");
const assetNames = fs.readdirSync(assetsDir);
for (const chunk of requiredChunks) {
    const referencedChunks = [...new Set(entrySource.match(new RegExp(chunk.prefix + "[A-Za-z0-9_-]+\\.js", "g")) || [])];
    const filename = referencedChunks.find((name) => assetNames.includes(name));
    if (!filename) fail(`missing required chunk ${chunk.prefix}*.js`);

    const source = fs.readFileSync(path.join(assetsDir, filename), "utf8");
    const missing = chunk.features.filter((feature) => !source.includes(feature));
    if (missing.length) fail(`${filename} is missing: ${missing.join(", ")}`);
}

const youtubeLogo = path.join(distDir, "platform-logos", "youtube-music.png");
if (!fs.existsSync(youtubeLogo) || fs.statSync(youtubeLogo).size < 1000) {
    fail("missing or invalid platform-logos/youtube-music.png");
}

console.log(`Frontend release validated: ${path.basename(distDir)}`);
