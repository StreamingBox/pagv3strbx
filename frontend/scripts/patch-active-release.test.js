import { describe, expect, it } from "vitest";
import { transformActiveReleaseAssets } from "./patch-active-release.mjs";

const legacyDetector = 'function UA(n){const a=String(n?.message||n||"").toLowerCase();return a.includes("dynamically imported module")||a.includes("loading chunk")||a.includes("failed to fetch")||a.includes("importing a module script failed")}';
const legacyBoundary = `class kA extends T.Component{state={error:null,refreshing:!1};static getDerivedStateFromError(a){return{error:a}}componentDidCatch(a){console.error("Application render error",a)}async refreshApplication(){if(!this.state.refreshing){this.setState({refreshing:!0});try{if("caches"in window){const a=await caches.keys();await Promise.all(a.map(s=>caches.delete(s)))}if("serviceWorker"in navigator){const a=await navigator.serviceWorker.getRegistrations();await Promise.all(a.map(s=>s.update()))}}catch{}window.location.reload()}}render(){const{error:a}=this.state;if(!a)return this.props.children;const s=UA(a);return h.jsx("p",{children:s?"Esta página tenía una versión anterior en memoria.":"Ocurrió un error inesperado"}),h.jsx("button",{children:"Actualizar aplicación"})}}`;

describe("active production release patch", () => {
    it("changes only the verified entry references and keeps scoped recovery", () => {
        const result = transformActiveReleaseAssets({
            html: '<script type="module" src="/assets/index-O9k4lJYH.js"></script><link rel="stylesheet" href="/assets/index-BhDo4yei.css">',
            bundle: `${legacyDetector}${legacyBoundary}function ju(){}`,
            css: ".app-error-boundary__card{border-radius:16px}.app-error-boundary__button{border:1px solid var(--accent-dark);border-radius:10px;background:var(--accent-dark);color:#fff;font-weight:800}",
        });

        expect(result.html).toContain(result.bundlePath);
        expect(result.html).toContain(result.cssPath);
        expect(result.bundle).toContain("chunkloaderror");
        expect(result.bundle).toContain('o.startsWith("strbx-pwa-")');
        expect(result.bundle).toContain("c.scope===o");
        expect(result.bundle).toContain("Detectamos archivos desactualizados.");
        expect(result.bundle).toContain("Actualizar aplicación");
        expect(result.bundle).not.toContain("Promise.all(a.map(s=>caches.delete(s)))");
        expect(result.css).toContain("border-radius:12px");
        expect(result.css).toContain("background:#2563eb");
        expect(result.css).toContain("text-shadow:none");
    });

    it("fails closed when the production boundary markers are not exact", () => {
        expect(() => transformActiveReleaseAssets({
            html: '<script src="/assets/index-O9k4lJYH.js"></script><link href="/assets/index-BhDo4yei.css">',
            bundle: "different production bundle",
            css: ".app-error-boundary__card{border-radius:16px}.app-error-boundary__button{border:1px solid var(--accent-dark);border-radius:10px;background:var(--accent-dark);font-weight:800}",
        })).toThrow(/stale-view message/);
    });
});
