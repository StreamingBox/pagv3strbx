export default function ProfitBox({
                                      wallet,
                                      profitOpen,
                                      setProfitOpen,
                                      recordProfit,
                                      setRecordProfit,
                                      profitAmount,
                                      setProfitAmount,
                                  }) {
    return (
        <div className="cart-profitBox">
            <button
                className="btn-ghost cart-profitToggle"
                onClick={() => setProfitOpen((s) => !s)}
                type="button"
            >
                <span className="cart-profitTitle">💰 Registrar ganancia</span>
                <span className="cart-profitChevron">{profitOpen ? "▲" : "▼"}</span>
            </button>

            {profitOpen ? (
                <div className="cart-profitBody">
                    <div className="cart-profitRadios">
                        <label className="cart-radio">
                            <input
                                type="radio"
                                name="profitChoice"
                                checked={recordProfit === true}
                                onChange={() => setRecordProfit(true)}
                            />
                            <span>Sí</span>
                        </label>

                        <label className="cart-radio">
                            <input
                                type="radio"
                                name="profitChoice"
                                checked={recordProfit === false}
                                onChange={() => {
                                    setRecordProfit(false);
                                    setProfitAmount("");
                                }}
                            />
                            <span>No</span>
                        </label>
                    </div>

                    {recordProfit ? (
                        <div className="cart-profitInputWrap">
                            <div className="cart-profitHint">¿Cuánta ganancia esperas obtener?</div>

                            <input
                                className="input"
                                inputMode="numeric"
                                placeholder={`Ej: 15000 (${wallet.currency || "COP"})`}
                                value={profitAmount}
                                onChange={(e) => setProfitAmount(e.target.value.replace(/[^\d]/g, ""))}
                            />

                            <div className="cart-profitNote">
                                Esto no afecta tu saldo; solo suma a “Ganancia obtenida”.
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
