import { useState } from "react";

export default function CartResult({ result, onClose }) {
    const [copied, setCopied] = useState(false);
    const deliveryMessage = result?.deliveryMessage || "";

    async function copyMessage() {
        if (!deliveryMessage) return;
        await navigator.clipboard.writeText(deliveryMessage);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
    }

    return (
        <section className="cart-result kpi">
            <div className="cart-resultTitle">Compra realizada</div>
            <div className="cart-resultHint">
                La orden fue creada. Copia este mensaje para entregar la información al cliente.
            </div>
            {deliveryMessage ? (
                <pre className="cart-resultPre">{deliveryMessage}</pre>
            ) : null}
            <div className="cart-resultActions">
                {deliveryMessage ? (
                    <button className="btn" onClick={copyMessage}>
                        {copied ? "Copiado" : "Copiar mensaje"}
                    </button>
                ) : null}
                <button className="btn-ghost" onClick={onClose}>
                    Cerrar
                </button>
            </div>
        </section>
    );
}
