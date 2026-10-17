import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ACTIVE_ENTRY_PATH = "/assets/index-68ba9cfa461f.js";
export const ACTIVE_ENTRY_SHA256 = "68ba9cfa461f9ec3b1f9899651289e8a3bd40c9347600fc4a6cc161c4037113f";

const ASSET_RECOVERY_HELPER = 'function $strbxClaimAutomaticAssetRecovery(n){if(!n)return null;try{if(n.getItem($strbxAssetRecoveryAttemptKey))return false;n.setItem($strbxAssetRecoveryAttemptKey,"1");return true}catch{return null}}';
const APP_RECOVERY_HELPER = 'const $strbxStartupRenderRecoveryAttemptKey="strbx-startup-render-recovery-attempted";function $strbxShouldRecoverStartupRenderError(n,{pathname:a,elapsedMs:s,userInteracted:r}){const o=String(a||"");if(UA(n)||r||!Number.isFinite(s)||s<0||s>12e3)return!1;return o==="/admin"||o.startsWith("/admin/")||o==="/codes"||o==="/support"}function $strbxClaimAutomaticAssetRecovery(n,a=$strbxAssetRecoveryAttemptKey){if(!n)return null;try{if(n.getItem(a))return false;n.setItem(a,"1");return true}catch{return null}}';

function digest(value) {
    return createHash("sha256").update(value).digest("hex");
}

function replaceExactlyOnce(value, search, replacement, label) {
    const count = value.split(search).length - 1;
    if (count !== 1) throw new Error(`Expected one ${label} marker, found ${count}.`);
    return value.replace(search, replacement);
}

function extractBoundary(bundle, stateMarker, label) {
    if (bundle.split(stateMarker).length - 1 !== 1) {
        throw new Error(`Expected one ${label} state marker.`);
    }
    const stateIndex = bundle.indexOf(stateMarker);
    const start = bundle.lastIndexOf("class ", stateIndex);
    const end = bundle.indexOf("function ", stateIndex);
    if (start < 0 || end < 0) throw new Error(`Could not locate the ${label} boundary.`);
    return { source: bundle.slice(start, end), start, end };
}

function matchAlias(source, expression, label) {
    const match = source.match(expression);
    if (!match) throw new Error(`Could not identify the ${label} symbol in the rebuilt boundary.`);
    return match[1];
}

function replaceIdentifier(source, from, to) {
    if (from === to) return source;
    return source.replace(new RegExp(`\\b${from}\\b`, "g"), to);
}

function transplantBoundary(activeBundle, rebuiltBundle) {
    const activeMarker = "class kA extends T.Component{";
    const activeState = "state={error:null,refreshing:!1,autoRecoveryAttempted:!1,automaticRecoveryUnavailable:!1};";
    if (!activeBundle.includes(activeState)) throw new Error("The active production boundary differs from the reviewed version.");
    if (activeBundle.includes("$strbxStartupRenderRecoveryAttemptKey")) throw new Error("The active bundle already has startup recovery.");

    const activeStart = activeBundle.indexOf(activeMarker);
    const activeEnd = activeBundle.indexOf("function ", activeStart);
    if (activeStart < 0 || activeEnd < 0 || activeBundle.indexOf(activeMarker, activeStart + 1) >= 0) {
        throw new Error("Could not locate one reviewed production error boundary.");
    }

    const stateMarker = "state={error:null,refreshing:!1,autoRecoveryAttempted:!1,automaticRecoveryUnavailable:!1,automaticRecoveryKind:null,errorHandled:!0};";
    const rebuilt = extractBoundary(rebuiltBundle, stateMarker, "rebuilt");
    const activeBoundary = activeBundle.slice(activeStart, activeEnd);
    let nextBoundary = rebuilt.source;

    const sourceClass = nextBoundary.match(/^class ([A-Za-z_$][\w$]*) extends ([A-Za-z_$][\w$]*)\.Component\{/);
    if (!sourceClass) throw new Error("The rebuilt error boundary has an unsupported React class signature.");
    const sourceJsx = matchAlias(nextBoundary, /(?:return |,)([A-Za-z_$][\w$]*)\.jsxs\("div",\{className:"page-shell app-error-boundary"/, "JSX runtime");
    const activeJsx = matchAlias(activeBoundary, /return ([A-Za-z_$][\w$]*)\.jsxs\("div",\{className:"page-shell app-error-boundary"/, "active JSX runtime");
    const sourceIcon = matchAlias(nextBoundary, new RegExp(`${sourceJsx}\\.jsx\\(([A-Za-z_$][\\w$]*),\\{size:22,className:`), "refresh icon");
    const activeIcon = matchAlias(activeBoundary, new RegExp(`${activeJsx}\\.jsx\\(([A-Za-z_$][\\w$]*),\\{size:22`), "active refresh icon");
    const sourceDetector = matchAlias(nextBoundary, /const \w+=([A-Za-z_$][\w$]*)\(a\),\w+=!\w+&&this\.isStartupRenderRecovery/, "asset error detector");
    const sourceStartupCheck = matchAlias(nextBoundary, /return ([A-Za-z_$][\w$]*)\(a,\{pathname:/, "startup recovery check");
    const claimMatch = nextBoundary.match(/\w+=([A-Za-z_$][\w$]*)\(window\.sessionStorage,\w+\?([A-Za-z_$][\w$]*):void 0\)/);
    if (!claimMatch) throw new Error("Could not identify the recovery claim symbols in the rebuilt boundary.");
    const [, sourceClaim, sourceRecoveryKey] = claimMatch;
    const sourceRefresh = matchAlias(nextBoundary, /await ([A-Za-z_$][\w$]*)\(\{cacheStorage:/, "asset refresh");
    const sourceReload = matchAlias(nextBoundary, /catch\{\}([A-Za-z_$][\w$]*)\(\)\}\}/, "page reload");

    nextBoundary = replaceIdentifier(nextBoundary, sourceClass[1], "kA");
    nextBoundary = replaceIdentifier(nextBoundary, sourceClass[2], "T");
    nextBoundary = replaceIdentifier(nextBoundary, sourceJsx, activeJsx);
    nextBoundary = replaceIdentifier(nextBoundary, sourceIcon, activeIcon);
    nextBoundary = replaceIdentifier(nextBoundary, sourceDetector, "UA");
    nextBoundary = replaceIdentifier(nextBoundary, sourceStartupCheck, "$strbxShouldRecoverStartupRenderError");
    nextBoundary = replaceIdentifier(nextBoundary, sourceClaim, "$strbxClaimAutomaticAssetRecovery");
    nextBoundary = replaceIdentifier(nextBoundary, sourceRecoveryKey, "$strbxStartupRenderRecoveryAttemptKey");
    nextBoundary = replaceIdentifier(nextBoundary, sourceRefresh, "$strbxRefreshApplicationAssets");
    nextBoundary = replaceIdentifier(nextBoundary, sourceReload, "$strbxReloadCurrentPage");

    const oldClass = activeBundle.slice(activeStart, activeEnd);
    let output = activeBundle.slice(0, activeStart) + nextBoundary + activeBundle.slice(activeEnd);
    output = replaceExactlyOnce(output, ASSET_RECOVERY_HELPER, APP_RECOVERY_HELPER, "automatic recovery helper");
    if (output.includes(oldClass) || !output.includes("$strbxStartupRenderRecoveryAttemptKey")) {
        throw new Error("The startup recovery boundary was not transplanted completely.");
    }
    return output;
}

export function transformActiveRelease({ html, activeBundle, rebuiltBundle }) {
    if (digest(activeBundle) !== ACTIVE_ENTRY_SHA256) throw new Error("The active production entry hash has changed.");
    const entryMatch = html.match(/<script\b[^>]*\bsrc="([^\"]*\/assets\/index-[^\"]+\.js)"/);
    if (!entryMatch || entryMatch[1] !== ACTIVE_ENTRY_PATH) throw new Error("The active HTML references an unexpected entry asset.");

    let bundle = transplantBoundary(activeBundle, rebuiltBundle);
    const bundlePath = `/assets/index-${digest(bundle).slice(0, 12)}.js`;
    const nextHtml = replaceExactlyOnce(html, ACTIVE_ENTRY_PATH, bundlePath, "active entry reference");
    return { bundlePath, bundle, html: nextHtml, sha256: digest(bundle) };
}

export function prepareActiveRelease(activeReleaseDirectory, rebuiltEntryPath, outputDirectory) {
    const source = fs.realpathSync(activeReleaseDirectory);
    const rebuiltBundle = fs.readFileSync(rebuiltEntryPath, "utf8");
    const output = path.resolve(outputDirectory);
    if (fs.existsSync(output)) throw new Error(`Output already exists: ${output}`);
    const relativeOutput = path.relative(source, output);
    if (relativeOutput === "" || (!relativeOutput.startsWith(`..${path.sep}`) && relativeOutput !== ".." && !path.isAbsolute(relativeOutput))) {
        throw new Error("The output directory must be outside the active release.");
    }

    const html = fs.readFileSync(path.join(source, "index.html"), "utf8");
    const entryMatch = html.match(/<script\b[^>]*\bsrc="([^\"]*\/assets\/index-[^\"]+\.js)"/);
    if (!entryMatch || entryMatch[1] !== ACTIVE_ENTRY_PATH) throw new Error("The active HTML references an unexpected entry asset.");
    const activeBundle = fs.readFileSync(path.join(source, entryMatch[1].slice(1)), "utf8");
    const result = transformActiveRelease({ html, activeBundle, rebuiltBundle });

    fs.cpSync(source, output, { recursive: true, force: false, errorOnExist: true });
    const newEntry = path.join(output, result.bundlePath.slice(1));
    if (fs.existsSync(newEntry)) throw new Error(`New entry path already exists: ${newEntry}`);
    fs.writeFileSync(newEntry, result.bundle, "utf8");
    fs.writeFileSync(path.join(output, "index.html"), result.html, "utf8");
    return { outputDirectory: output, bundlePath: result.bundlePath, sha256: result.sha256 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [activeReleaseDirectory, rebuiltEntryPath, outputDirectory] = process.argv.slice(2);
    if (!activeReleaseDirectory || !rebuiltEntryPath || !outputDirectory) {
        throw new Error("Usage: node patch-active-startup-recovery.mjs <active-release> <rebuilt-entry.js> <new-release-source>");
    }
    console.log(JSON.stringify(prepareActiveRelease(activeReleaseDirectory, rebuiltEntryPath, outputDirectory)));
}
