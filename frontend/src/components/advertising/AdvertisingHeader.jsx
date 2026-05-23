import { motion } from "framer-motion";

const MotionDiv = motion.div;

export default function AdvertisingHeader({ title, subtitle, icon = "AD", children }) {
    return (
        <MotionDiv
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 28,
                paddingBottom: 20,
                borderBottom: "1px solid var(--stroke)",
                flexWrap: "wrap",
                gap: 16,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                    style={{
                        width: 48,
                        height: 48,
                        borderRadius: 14,
                        background: "linear-gradient(135deg,rgba(13,166,242,0.15),rgba(99,51,255,0.15))",
                        border: "1px solid rgba(13,166,242,0.3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                        fontWeight: 900,
                        color: "#0da6f2",
                        boxShadow: "0 4px 16px rgba(13,166,242,0.2)",
                        flexShrink: 0,
                    }}
                >
                    {icon}
                </div>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.4px" }}>{title}</h1>
                    <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--muted)" }}>{subtitle}</p>
                </div>
            </div>
            {children}
        </MotionDiv>
    );
}
