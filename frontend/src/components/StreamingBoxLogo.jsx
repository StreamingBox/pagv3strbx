/**
 * StreamingBoxLogo — Adaptive logo component
 * Works on both dark and light backgrounds.
 *
 * Props:
 *  - size: number (default 36) — size of the icon square
 *  - showText: boolean (default true) — show "Streaming Box" wordmark
 *  - onDark: boolean (default true) — true = white icon for dark bg, false = colored for light bg
 *  - textColor: string — override text color
 *  - subtitle: string — optional subtitle below brand name
 */
export default function StreamingBoxLogo({
    size = 36,
    showText = true,
    textColor,
    subtitle,
    style = {},
}) {
    // Everything reactive via CSS variables
    const textMain = textColor || "var(--text)";
    const textSub  = "var(--muted)";
    const accentColor = "var(--accent)";

    return (
        <div style={{ display: "flex", alignItems: "center", gap: size * 0.35, ...style }}>
            {/* ── Icon: gradient square + play-box symbol ── */}
            <svg
                width={size}
                height={size}
                viewBox="0 0 40 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ flexShrink: 0, borderRadius: size * 0.22 }}
            >
                <defs>
                    <linearGradient id="sb-grad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#00c6f5" />
                        <stop offset="100%" stopColor="#1d4ed8" />
                    </linearGradient>
                </defs>

                {/* Background square with gradient */}
                <rect width="40" height="40" rx="9" fill="url(#sb-grad)" />

                {/* Box/cube icon — flat white for contrast on gradient */}
                <polygon points="20,8 30,13 20,18 10,13" fill="#ffffff" opacity="0.95" />
                <polygon points="10,13 10,24 20,29 20,18" fill="#ffffff" opacity="0.65" />
                <polygon points="30,13 30,24 20,29 20,18" fill="#ffffff" opacity="0.85" />
                
                {/* Play triangle — Use accent color or fallback */}
                <polygon
                    points="22,18.5 27,21.5 22,24.5"
                    fill={accentColor}
                    style={{ filter: "drop-shadow(0 0 2px rgba(0,0,0,0.2))" }}
                />
            </svg>

            {/* ── Wordmark ── */}
            {showText && (
                <div style={{ lineHeight: 1.2 }}>
                    <div style={{
                        fontWeight: 800,
                        fontSize: size * 0.42,
                        color: textMain,
                        whiteSpace: "nowrap",
                        letterSpacing: "-0.3px",
                    }}>
                        Streaming Box
                    </div>
                    {subtitle && (
                        <div style={{
                            fontSize: size * 0.28,
                            color: textSub,
                            textTransform: "uppercase",
                            letterSpacing: "0.6px",
                            fontWeight: 600,
                        }}>
                            {subtitle}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
