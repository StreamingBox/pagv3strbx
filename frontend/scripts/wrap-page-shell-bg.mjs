import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.join(__dirname, "../src/pages");

const patternA = `        <div className="page-shell">
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />

            <div className="page-inner">`;
const replaceA = `        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden>
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            <div className="bg-grid" />
            </div>

            <div className="page-inner">`;

const patternB = `        <div className="page-shell">
            <div className="bg-grid" />
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />

            <div className="page-inner">`;
const replaceB = `        <div className="page-shell">
            <div className="page-shell-bg" aria-hidden>
            <div className="bg-grid" />
            <div className="bg-orb orb-1" />
            <div className="bg-orb orb-2" />
            </div>

            <div className="page-inner">`;

let nA = 0;
let nB = 0;
const files = fs.readdirSync(pagesDir).filter((f) => f.endsWith(".jsx"));
for (const f of files) {
    const p = path.join(pagesDir, f);
    let s = fs.readFileSync(p, "utf8");
    const orig = s;
    const n = s.replace(/\r\n/g, "\n");
    let t = n;
    if (n.includes(patternA)) {
        t = n.replace(patternA, replaceA);
        nA++;
    } else if (n.includes(patternB)) {
        t = n.replace(patternB, replaceB);
        nB++;
    }
    if (t !== n) {
        fs.writeFileSync(p, t.replace(/\n/g, "\r\n"));
    }
}
console.log("patternA", nA, "patternB", nB, "files", files.length);
