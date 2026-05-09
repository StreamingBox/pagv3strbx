export default function CartResult({ onClose }) {
    return (
        <section className="cart-result kpi">
            <div className="cart-resultTitle">Compra realizada</div>
            <div className="cart-resultHint">
                La orden fue creada y las credenciales quedaron disponibles en el historial.
            </div>
            <div className="cart-resultActions">
                <button className="btn-ghost" onClick={onClose}>
                    Cerrar
                </button>
            </div>
        </section>
    );
}
