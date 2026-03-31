export default function WhatsappToggle({ includeWhatsapp, setIncludeWhatsapp }) {
    return (
        <section className="cart-whatsapp">
            <div>
                <div className="cart-sectionTitle">Soporte por WhatsApp</div>
                <div className="cart-sectionDesc">
                    Si lo activas, el link mostrará un botón para contactarte.
                </div>
            </div>

            <label className="cart-toggle">
                <input
                    type="checkbox"
                    checked={includeWhatsapp}
                    onChange={(e) => setIncludeWhatsapp(e.target.checked)}
                />
                <span className="cart-toggleLabel">{includeWhatsapp ? "Sí" : "No"}</span>
            </label>
        </section>
    );
}
