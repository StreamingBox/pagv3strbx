import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";

export const ACTIVE_ENTRY_SHA256 = "d06aae51f6326d1091ce997229da02d666b65d23389b712804d1bc1c39823ee4";

const LEGACY_ERROR_DETECTOR = 'function UA(n){const a=String(n?.message||n||"").toLowerCase();return a.includes("dynamically imported module")||a.includes("loading chunk")||a.includes("failed to fetch")||a.includes("importing a module script failed")}';
const BOUNDARY_START = "class kA extends T.Component{";
const BOUNDARY_END = "function ju(){";
const RECOVERY_KEY = "$strbxAssetRecoveryAttemptKey";

function countOccurrences(value, search) {
    return value.split(search).length - 1;
}

function digest(value) {
    return createHash("sha256").update(value).digest("hex");
}

function replaceExactlyOnce(value, search, replacement, label) {
    const count = countOccurrences(value, search);
    if (count !== 1) throw new Error(`Expected one ${label} marker, found ${count}.`);
    return value.replace(search, replacement);
}

function patchErrorBoundary(bundle) {
    if (bundle.includes(RECOVERY_KEY)) throw new Error("The active bundle already contains this recovery patch.");
    if (!bundle.includes("Esta página tenía una versión anterior en memoria.")) {
        throw new Error("The active bundle does not contain the expected stale-view message.");
    }

    let output = replaceExactlyOnce(
        bundle,
        LEGACY_ERROR_DETECTOR,
        'function UA(n){const a=String(n?.message||n||"").toLowerCase();return a.includes("dynamically imported module")||a.includes("loading chunk")||a.includes("chunkloaderror")||a.includes("failed to fetch")||a.includes("importing a module script failed")}',
        "legacy asset-error detector"
    );

    const classStart = output.indexOf(BOUNDARY_START);
    const classEnd = output.indexOf(BOUNDARY_END, classStart);
    if (classStart < 0 || classEnd < 0 || output.indexOf(BOUNDARY_START, classStart + 1) >= 0) {
        throw new Error("The active bundle does not contain one recognizable application error boundary.");
    }

    const originalBoundary = output.slice(classStart, classEnd);
    if (!originalBoundary.includes("Actualizar aplicación") || !originalBoundary.includes("async refreshApplication()")) {
        throw new Error("The active error boundary differs from the expected production version.");
    }

    const recoveryHelpers = `const ${RECOVERY_KEY}="strbx-asset-recovery-attempted";function $strbxClaimAutomaticAssetRecovery(n){if(!n)return null;try{if(n.getItem(${RECOVERY_KEY}))return false;n.setItem(${RECOVERY_KEY},"1");return true}catch{return null}}async function $strbxRefreshApplicationAssets({cacheStorage:n,serviceWorkerContainer:a,origin:s}){if(n)try{const r=await n.keys();await Promise.all(r.filter(o=>o.startsWith("strbx-pwa-")).map(o=>n.delete(o)))}catch{}if(a&&s)try{const r=await a.getRegistrations(),o=\`${"${s}"}/\`;await Promise.all(r.filter(c=>c.scope===o).map(c=>c.update()))}catch{}}function $strbxReloadCurrentPage(){window.location.reload()}`;

    const updatedBoundary = `class kA extends T.Component{state={error:null,refreshing:!1,autoRecoveryAttempted:!1,automaticRecoveryUnavailable:!1};static getDerivedStateFromError(a){return{error:a}}componentDidCatch(a){console.error("Application render error",a);if(!UA(a))return;let s=null;try{s=$strbxClaimAutomaticAssetRecovery(window.sessionStorage)}catch{}if(s===true){void this.refreshApplication();return}this.setState({autoRecoveryAttempted:s===false,automaticRecoveryUnavailable:s===null})}async refreshApplication(){if(this.state.refreshing)return;this.setState({refreshing:!0});try{await $strbxRefreshApplicationAssets({cacheStorage:"caches"in window?window.caches:null,serviceWorkerContainer:"serviceWorker"in navigator?navigator.serviceWorker:null,origin:window.location.origin})}catch{}$strbxReloadCurrentPage()}render(){const{error:a}=this.state;if(!a)return this.props.children;const s=UA(a);return h.jsxs("div",{className:"page-shell app-error-boundary",children:[h.jsx("div",{className:"page-shell-bg","aria-hidden":"true",children:h.jsx("div",{className:"bg-grid"})}),h.jsxs("section",{className:"app-error-boundary__card",role:"alert","aria-labelledby":"app-error-title",children:[h.jsx("div",{className:"app-error-boundary__icon","aria-hidden":"true",children:h.jsx(y0,{size:22})}),h.jsx("p",{className:"app-error-boundary__eyebrow",children:"Actualización disponible"}),h.jsx("h1",{id:"app-error-title",className:"app-error-boundary__title",children:"No se pudo cargar esta vista"}),h.jsx("p",{className:"app-error-boundary__message",children:s?this.state.autoRecoveryAttempted?"La vista sigue sin cargar después del intento automático. Puedes volver a actualizar la aplicación.":this.state.automaticRecoveryUnavailable?"No pudimos iniciar la actualización automática. Pulsa el botón para volver a cargar la aplicación.":"Detectamos archivos desactualizados. Estamos actualizando la aplicación para volver a cargar esta vista.":"Ocurrió un error inesperado al abrir esta vista. Actualiza la aplicación para volver a intentarlo."}),h.jsxs("button",{className:"app-error-boundary__button",type:"button",onClick:()=>this.refreshApplication(),disabled:this.state.refreshing,"aria-busy":this.state.refreshing,children:[h.jsx(y0,{size:17,className:this.state.refreshing?"app-error-boundary__spin":void 0,"aria-hidden":"true"}),this.state.refreshing?"Actualizando aplicación…":(this.state.autoRecoveryAttempted||this.state.automaticRecoveryUnavailable)&&s?"Intentar de nuevo":"Actualizar aplicación"]})]})]})}}`;

    output = `${output.slice(0, classStart)}${recoveryHelpers}${updatedBoundary}${output.slice(classEnd)}`;
    return output;
}

function patchCssRule(css, selector, edits) {
    const marker = `${selector}{`;
    const matches = [];
    let start = -1;
    while ((start = css.indexOf(marker, start + 1)) >= 0) {
        const bodyStart = start + marker.length;
        const end = css.indexOf("}", bodyStart);
        if (end < 0) throw new Error(`Unclosed ${selector} CSS rule.`);
        const body = css.slice(bodyStart, end);
        if (edits.every(([oldValue]) => body.includes(oldValue))) matches.push({ body, bodyStart, end });
    }
    if (matches.length !== 1) throw new Error(`Expected one editable ${selector} CSS rule, found ${matches.length}.`);

    const [{ body: originalBody, bodyStart, end }] = matches;
    let body = originalBody;
    for (const [oldValue, newValue] of edits) {
        body = replaceExactlyOnce(body, oldValue, newValue, `${selector} property`);
    }
    return `${css.slice(0, bodyStart)}${body}${css.slice(end)}`;
}

function patchStylesheet(css) {
    let output = patchCssRule(css, ".app-error-boundary__card", [
        ["border-radius:16px", "border-radius:12px"],
    ]);
    output = patchCssRule(output, ".app-error-boundary__button", [
        ["border:1px solid var(--accent-dark)", "border:1px solid #2563eb"],
        ["border-radius:10px", "border-radius:8px"],
        ["background:var(--accent-dark)", "background:#2563eb"],
        ["font-weight:800", "font-weight:800;text-shadow:none"],
    ]);
    return output;
}

export function transformActiveReleaseAssets({ html, bundle, css }) {
    const patchedBundle = patchErrorBoundary(bundle);
    const patchedCss = patchStylesheet(css);
    const bundlePath = "/assets/index-O9k4lJYH.js";
    const cssPath = "/assets/index-BhDo4yei.css";
    const newBundlePath = `/assets/index-${digest(patchedBundle).slice(0, 8)}.js`;
    const newCssPath = `/assets/index-${digest(patchedCss).slice(0, 8)}.css`;

    let patchedHtml = replaceExactlyOnce(html, bundlePath, newBundlePath, "entry JavaScript path");
    patchedHtml = replaceExactlyOnce(patchedHtml, cssPath, newCssPath, "entry stylesheet path");

    return { bundlePath: newBundlePath, cssPath: newCssPath, bundle: patchedBundle, css: patchedCss, html: patchedHtml };
}

export function prepareActiveRelease(sourceDirectory, outputDirectory) {
    const source = fs.realpathSync(sourceDirectory);
    const output = path.resolve(outputDirectory);
    if (fs.existsSync(output)) throw new Error(`Output already exists: ${output}`);
    const relativeOutput = path.relative(source, output);
    if (relativeOutput === "" || (!relativeOutput.startsWith(`..${path.sep}`) && relativeOutput !== ".." && !path.isAbsolute(relativeOutput))) {
        throw new Error("The output directory must be outside the active release.");
    }

    const html = fs.readFileSync(path.join(source, "index.html"), "utf8");
    const entryMatch = html.match(/<script\b[^>]*\bsrc="(\/assets\/index-[^"]+\.js)"/);
    const cssMatch = html.match(/<link\b[^>]*\bhref="(\/assets\/index-[^"]+\.css)"/);
    if (!entryMatch || entryMatch[1] !== "/assets/index-O9k4lJYH.js" || !cssMatch || cssMatch[1] !== "/assets/index-BhDo4yei.css") {
        throw new Error("The active release HTML differs from the verified production release.");
    }

    const entryFile = path.join(source, entryMatch[1].slice(1));
    const cssFile = path.join(source, cssMatch[1].slice(1));
    const bundle = fs.readFileSync(entryFile, "utf8");
    if (digest(bundle) !== ACTIVE_ENTRY_SHA256) throw new Error("The active production entry bundle hash has changed.");

    const result = transformActiveReleaseAssets({
        html,
        bundle,
        css: fs.readFileSync(cssFile, "utf8"),
    });

    fs.cpSync(source, output, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
    const assets = path.join(output, "assets");
    fs.writeFileSync(path.join(assets, path.basename(result.bundlePath)), result.bundle);
    fs.writeFileSync(path.join(assets, path.basename(result.cssPath)), result.css);
    fs.writeFileSync(path.join(output, "index.html"), result.html);

    const brotliOptions = { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } };
    if (fs.existsSync(`${entryFile}.br`)) {
        fs.writeFileSync(path.join(assets, `${path.basename(result.bundlePath)}.br`), brotliCompressSync(result.bundle, brotliOptions));
    }
    if (fs.existsSync(`${cssFile}.br`)) {
        fs.writeFileSync(path.join(assets, `${path.basename(result.cssPath)}.br`), brotliCompressSync(result.css, brotliOptions));
    }
    const htmlBrotli = path.join(source, "index.html.br");
    if (fs.existsSync(htmlBrotli)) {
        fs.writeFileSync(path.join(output, "index.html.br"), brotliCompressSync(result.html, brotliOptions));
    }

    return { output, bundlePath: result.bundlePath, cssPath: result.cssPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [, , sourceDirectory, outputDirectory] = process.argv;
    if (!sourceDirectory || !outputDirectory) {
        console.error("Usage: node patch-active-release.mjs /path/to/active-release /path/to/new-candidate");
        process.exitCode = 2;
    } else {
        try {
            console.log(JSON.stringify(prepareActiveRelease(sourceDirectory, outputDirectory)));
        } catch (error) {
            console.error(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    }
}
