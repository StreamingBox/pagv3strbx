import { Fragment } from "react";

export default function ProductDetailLine({ children }) {
    const segments = String(children ?? "").split(/(\*\*[^*]+\*\*)/g);

    return segments.map((segment, index) => {
        const emphasized = segment.match(/^\*\*(.+)\*\*$/);
        return emphasized
            ? <strong key={index} style={{ color: "inherit", fontWeight: 900 }}>{emphasized[1]}</strong>
            : <Fragment key={index}>{segment}</Fragment>;
    });
}
