import { useEffect, useRef, useState } from "react";
import { layoutWithLines, prepareWithSegments } from "@chenglou/pretext";

function getCanvasFont(style) {
    const fontStyle = style.fontStyle || "normal";
    const fontWeight = style.fontWeight || "400";
    const fontSize = style.fontSize || "16px";
    const fontFamily = style.fontFamily || "sans-serif";
    return `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
}

function getLineHeight(style) {
    if (style.lineHeight && style.lineHeight !== "normal") {
        const px = Number.parseFloat(style.lineHeight);
        if (Number.isFinite(px)) return px;
    }

    const fontSize = Number.parseFloat(style.fontSize || "16");
    return Number.isFinite(fontSize) ? fontSize * 1.25 : 20;
}

export default function BalancedText({
    as: Tag = "span",
    text,
    className,
    maxLines = 2,
    minWidthRatio = 0.72,
    lineClassName = "",
    title,
}) {
    const ref = useRef(null);
    const [balancedLines, setBalancedLines] = useState(null);

    useEffect(() => {
        if (!text || typeof window === "undefined") {
            setBalancedLines(null);
            return undefined;
        }

        let cancelled = false;
        let frameId = 0;
        let resizeObserver;

        const element = ref.current;
        if (!element) return undefined;

        const measure = async () => {
            const target = ref.current;
            if (!target) return;

            if (document.fonts?.ready) {
                try {
                    await document.fonts.ready;
                } catch {
                    // Si fonts.ready falla, seguimos con la medicion actual.
                }
            }

            if (cancelled) return;

            const style = window.getComputedStyle(target);
            const maxWidth = Math.floor(target.clientWidth);
            if (maxWidth < 48) {
                setBalancedLines(null);
                return;
            }

            const prepared = prepareWithSegments(String(text), getCanvasFont(style));
            const lineHeight = getLineHeight(style);
            const initial = layoutWithLines(prepared, maxWidth, lineHeight);

            if (initial.lineCount <= 1 || initial.lineCount > maxLines) {
                setBalancedLines(null);
                return;
            }

            const minWidth = Math.max(Math.floor(maxWidth * minWidthRatio), 48);
            let bestWidth = maxWidth;

            for (let width = maxWidth - 6; width >= minWidth; width -= 6) {
                const next = layoutWithLines(prepared, width, lineHeight);
                if (next.lineCount === initial.lineCount) {
                    bestWidth = width;
                    continue;
                }
                break;
            }

            const balanced = layoutWithLines(prepared, bestWidth, lineHeight);
            if (!cancelled) {
                setBalancedLines(balanced.lines.map((line) => line.text));
            }
        };

        const scheduleMeasure = () => {
            window.cancelAnimationFrame(frameId);
            frameId = window.requestAnimationFrame(() => {
                measure();
            });
        };

        scheduleMeasure();
        if (typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver(scheduleMeasure);
            resizeObserver.observe(element);
        } else {
            window.addEventListener("resize", scheduleMeasure);
        }
        window.addEventListener("orientationchange", scheduleMeasure);

        return () => {
            cancelled = true;
            window.cancelAnimationFrame(frameId);
            window.removeEventListener("resize", scheduleMeasure);
            window.removeEventListener("orientationchange", scheduleMeasure);
            resizeObserver?.disconnect();
        };
    }, [maxLines, minWidthRatio, text]);

    return (
        <Tag ref={ref} className={className} title={title ?? text}>
            {balancedLines?.length
                ? balancedLines.map((line, index) => (
                    <span
                        key={`${line}-${index}`}
                        className={lineClassName}
                        style={{ display: "block" }}
                    >
                        {line}
                    </span>
                ))
                : text}
        </Tag>
    );
}
