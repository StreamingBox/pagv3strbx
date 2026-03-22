import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import StreamingBoxLogo from "../StreamingBoxLogo.jsx";

function getTheme() {
    try {
        return localStorage.getItem("sb-theme") || "dark";
    } catch {
        return "dark";
    }
}

export default function StandaloneAuthLayout({ title, subtitle, children, footer }) {
    const [theme, setTheme] = useState(getTheme);
    const dark = theme === "dark";

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        try {
            localStorage.setItem("sb-theme", theme);
        } catch { }
    }, [theme]);

    const C = {
        text: dark ? "#ffffff" : "#0f172a",
        muted: dark ? "rgba(200,215,245,.7)" : "#64748b",
        cardBg: dark ? "rgba(7,14,40,.92)" : "rgba(255,255,255,.96)",
        shell: dark
            ? "radial-gradient(900px 700px at 15% 10%, rgba(37,99,235,.18), transparent 55%), radial-gradient(900px 700px at 90% 80%, rgba(139,92,246,.14), transparent 55%), linear-gradient(180deg, #050816, #0A0F29)"
            : "radial-gradient(900px 700px at 15% 10%, rgba(191,219,254,.5), transparent 55%), radial-gradient(900px 700px at 90% 80%, rgba(196,181,253,.3), transparent 55%), linear-gradient(180deg, #e8f0fe, #f0f4ff)",
        stroke: dark ? "rgba(255,255,255,.08)" : "rgba(37,99,235,.14)",
    };

    const S = {
        shell: {
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "32px 16px",
            background: C.shell,
            position: "relative",
            overflow: "hidden",
            fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
        },
        orb1: {
            position: "absolute",
            width: 520,
            height: 520,
            borderRadius: "50%",
            left: -160,
            top: -120,
            background: "radial-gradient(circle, rgba(37,99,235,.35), transparent 70%)",
            filter: "blur(70px)",
            opacity: dark ? 0.4 : 0.16,
            pointerEvents: "none",
        },
        orb2: {
            position: "absolute",
            width: 520,
            height: 520,
            borderRadius: "50%",
            right: -180,
            bottom: -180,
            background: "radial-gradient(circle, rgba(14,165,233,.28), transparent 70%)",
            filter: "blur(70px)",
            opacity: dark ? 0.35 : 0.14,
            pointerEvents: "none",
        },
        card: {
            width: "min(480px, 100%)",
            borderRadius: 28,
            background: C.cardBg,
            border: `1px solid ${C.stroke}`,
            boxShadow: dark
                ? "0 30px 80px rgba(0,0,0,.55)"
                : "0 24px 60px rgba(37,99,235,.12)",
            backdropFilter: "blur(18px)",
            padding: "32px 26px",
            position: "relative",
            zIndex: 2,
        },
        themeBtn: {
            position: "fixed",
            top: 20,
            right: 20,
            width: 44,
            height: 44,
            borderRadius: 12,
            border: `1px solid ${C.stroke}`,
            background: dark ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.85)",
            color: dark ? "#fff" : "#1d4ed8",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 3,
        },
        header: {
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 28,
        },
        title: {
            margin: 0,
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: -0.5,
            color: C.text,
        },
        subtitle: {
            margin: "6px 0 0",
            fontSize: 14,
            lineHeight: 1.6,
            color: C.muted,
        },
        footer: {
            marginTop: 18,
            textAlign: "center",
            fontSize: 13,
            color: C.muted,
        },
    };

    return (
        <div style={S.shell}>
            <div style={S.orb1} />
            <div style={S.orb2} />
            <button type="button" style={S.themeBtn} onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>
                {dark ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            <div style={S.card}>
                <div style={S.header}>
                    <StreamingBoxLogo size={42} showText={true} onDark={dark} textColor={C.text} />
                </div>
                <h1 style={S.title}>{title}</h1>
                {subtitle ? <p style={S.subtitle}>{subtitle}</p> : null}
                <div>{children}</div>
                {footer ? <div style={S.footer}>{footer}</div> : null}
            </div>
        </div>
    );
}
