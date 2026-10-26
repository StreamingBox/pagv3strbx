import { ChevronLeft, ChevronRight, Mail, Search, UsersRound } from "lucide-react";

import { STATUS_LABELS, REASON_LABELS, money, dateTime } from "../../utils/referrals.js";

export function ReferralMetrics({ summary }) {
    return <dl className="referrals-metrics">
        {[["Referidos", summary?.total || 0], ["Pendientes", summary?.pending || 0], ["En revisión", summary?.review || 0], ["Acreditados", summary?.credited || 0], ["Premios netos", money(summary?.awarded)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>;
}

export default function ReferralHistory({ data, loading, admin = false, onPage, onDetail }) {
    return <section className={"referrals-history" + (admin ? " is-admin" : "")} aria-label="Historial de referidos" aria-busy={loading}>
        <div className="referrals-table-scroll">
            <table>
                <thead><tr><th>Referido</th>{admin && <><th>Referente</th><th>Invitado</th></>}<th>Registro / límite</th><th>Meta acumulada</th><th>Estado</th><th>Premio</th><th>Acreditado</th><th><span className="sr-only">Acciones</span></th></tr></thead>
                <tbody>
                    {loading ? <tr><td colSpan={admin ? 9 : 7} className="referrals-empty" role="status">Cargando referidos...</td></tr> : data?.items?.length ? data.items.map(item => <tr key={item.id}>
                        <td className="referrals-invitee"><strong>#{item.id}</strong>{!admin && <><strong>{item.referredName || "Invitado"}</strong>{item.referredEmail && <small>{item.referredEmail}</small>}</>}</td>
                        {admin && <><td><strong>{item.referrerName}</strong><small>{item.referrerEmail}</small></td><td><strong>{item.referredName}</strong><small>{item.referredEmail}</small></td></>}
                        <td data-label="Registro / límite">{dateTime(item.createdAt)}<small>Hasta {dateTime(item.expiresAt)}</small></td>
                        <td className="referrals-progress-cell" data-label="Meta acumulada">{item.progressAmount != null ? <><strong>{money(item.progressAmount)}</strong><progress max={item.minimumTopup} value={Math.min(item.progressAmount, item.minimumTopup)} aria-label={"Avance del referido #" + item.id} /><small>Meta: {money(item.minimumTopup)}</small><small>{Number(item.remainingAmount) > 0 ? "Faltan " + money(item.remainingAmount) : "Meta alcanzada"}</small></> : <small>Avance no compartido</small>}</td>
                        <td data-label="Estado"><span className={"referrals-state is-" + item.status}>{STATUS_LABELS[item.status] || item.status}</span>{item.reason && <small>{REASON_LABELS[item.reason] || "Revisión administrativa."}</small>}</td>
                        <td className="referrals-amount" data-label="Premio">{money(item.rewardAmount)}</td><td data-label="Acreditado">{dateTime(item.creditedAt)}</td>
                        {admin && <td><button type="button" className="referrals-icon-button" onClick={() => onDetail(item.id)} title={"Detalle del referido #" + item.id} aria-label={"Detalle del referido #" + item.id}><Search size={17} /></button></td>}
                        {!admin && <td className="referrals-contact-cell">{item.referredEmail ? <a className="referrals-button" href={"mailto:" + encodeURIComponent(item.referredEmail) + "?subject=" + encodeURIComponent("Tu meta en Streaming Box")}><Mail size={16} />Escribir</a> : <small>Contacto no compartido</small>}</td>}
                    </tr>) : <tr><td colSpan={admin ? 9 : 7} className="referrals-empty"><UsersRound size={26} aria-hidden /><p>No hay referidos para estos filtros.</p></td></tr>}
                </tbody>
            </table>
        </div>
        <footer className="referrals-pagination"><span>{data?.total || 0} registros</span><div><button type="button" className="referrals-icon-button" disabled={loading || !data || data.page <= 1} onClick={() => onPage(data.page - 1)} title="Página anterior" aria-label="Página anterior"><ChevronLeft size={18} /></button><span>Página {data?.page || 1} de {data?.totalPages || 1}</span><button type="button" className="referrals-icon-button" disabled={loading || !data || data.page >= data.totalPages} onClick={() => onPage(data.page + 1)} title="Página siguiente" aria-label="Página siguiente"><ChevronRight size={18} /></button></div></footer>
    </section>;
}
