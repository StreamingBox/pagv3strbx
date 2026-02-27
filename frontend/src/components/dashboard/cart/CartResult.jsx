import { copyText } from "../../../utils/platform.js";

export default function CartResult({ whatsappMessage, onClose }) {
    return (
        <section className="cart-result kpi">
            <div className="cart-resultTitle">✅ Compra realizada</div>
            <div className="cart-resultHint">Copia y pega esto en WhatsApp:</div>

            <pre className="cart-resultPre">{whatsappMessage}</pre>

            <div className="cart-resultActions">
                <button className="btn" onClick={() => copyText(whatsappMessage)} disabled={!whatsappMessage}>
                    Copiar mensaje
                </button>

                <button className="btn-ghost" onClick={onClose}>
                    Cerrar
                </button>
            </div>

            <div className="cart-resultSaved">
                ✅ Guardado como “último mensaje” para copiarlo luego desde el historial.
            </div>
        </section>
    );
}
