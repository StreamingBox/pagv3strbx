/* eslint-disable no-unused-vars, react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from "react";

function getCanvasFont(style) {
    const fontStyle = style.fontStyle || "normal";
    const fontWeight = style.fontWeight || "400";
    const fontSize = style.fontSize || "16px";
    const fontFamily = style.fontFamily || "sans-serif";
    return `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
}

function getMeasureContext(font) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.font = font;
    return context;
}

function splitText(text) {
    return String(text).trim().split(/\s+/).filter(Boolean);
}

function measureText(context, value) {
    return context.measureText(value).width;
}

function layoutText(context, words, maxWidth) {
    const lines = [];
    let current = "";

    for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (current && measureText(context, next) > maxWidth) {
            lines.push(current);
            current = word;
        } else {
            current = next;
        }
    }

    if (current) lines.push(current);
    return lines;
}

export default function BalancedText({
    as: Component = "span",
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

            const context = getMeasureContext(getCanvasFont(style));
            if (!context) {
                setBalancedLines(null);
                return;
            }

            const words = splitText(text);
            const initialLines = layoutText(context, words, maxWidth);
            const initialLineCount = initialLines.length;

            if (initialLineCount <= 1 || initialLineCount > maxLines) {
                setBalancedLines(null);
                return;
            }

            const minWidth = Math.max(Math.floor(maxWidth * minWidthRatio), 48);
            let bestWidth = maxWidth;

            for (let width = maxWidth - 6; width >= minWidth; width -= 6) {
                const next = layoutText(context, words, width);
                if (next.length === initialLineCount) {
                    bestWidth = width;
                    continue;
                }
                break;
            }

            const balanced = layoutText(context, words, bestWidth);
            if (!cancelled) {
                setBalancedLines(balanced);
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

    const content = balancedLines?.length
        ? balancedLines.map((line, index) => (
            <span
                key={`${line}-${index}`}
                className={lineClassName}
                style={{ display: "block" }}
            >
                {line}
            </span>
        ))
        : text;

    return (
        <Component ref={ref} className={className} title={title ?? text}>
            {content}
        </Component>
    );
}
