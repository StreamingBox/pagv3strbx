import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

const MotionDiv = motion.div;
const MotionButton = motion.button;

export default function TermsModal({ open, onClose }) {
    return (
        <AnimatePresence>
            {open ? (
                <MotionDiv
                    className="tos-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <MotionDiv
                        className="tos-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="terms-title"
                        initial={{ opacity: 0, scale: 0.92, y: 24 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 16 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="tos-header">
                            <h2 id="terms-title">Términos y Condiciones</h2>
                            <MotionButton
                                className="tos-close"
                                type="button"
                                aria-label="Cerrar términos y condiciones"
                                title="Cerrar"
                                onClick={onClose}
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                            >
                                <X size={20} />
                            </MotionButton>
                        </div>
                        <div className="tos-body">
                            <p><strong>1. Aceptación de los Términos</strong><br />
                                Al registrarte o usar Streaming Box aceptas estos Términos y Condiciones. Si no estás de acuerdo, no debes usar la plataforma.</p>
                            <p><strong>2. Objeto del Servicio</strong><br />
                                Streaming Box es una plataforma privada para gestionar y comercializar accesos digitales, pedidos y saldos internos para usuarios autorizados.</p>
                            <p><strong>3. Requisitos de Uso</strong><br />
                                Debes proporcionar información veraz, mantener tus datos actualizados y resguardar tus credenciales. Eres responsable de toda actividad realizada desde tu cuenta.</p>
                            <p><strong>4. Uso Prohibido</strong><br />
                                Queda prohibido compartir accesos, revender sin autorización, automatizar consultas mediante scraping o bots, vulnerar la seguridad de la plataforma o usarla para fines ilícitos.</p>
                            <p><strong>5. Pagos, Saldos y Reembolsos</strong><br />
                                Los saldos acreditados en wallet se consideran consumibles dentro de la plataforma. Salvo obligación legal o falla comprobable del servicio, las compras son finales y no reembolsables.</p>
                            <p><strong>6. Compra Mínima Mensual para Revendedores COP</strong><br />
                                Las cuentas de revendedor configuradas en moneda COP deben realizar compras por un mínimo de $30.000 COP durante cada mes calendario. El cumplimiento se evalúa al finalizar el mes y, si no se alcanza el mínimo, la cuenta será deshabilitada automáticamente. La regla se aplica después de completar el primer mes calendario de actividad y no aplica a cuentas Lite ni a usuarios configurados en otras monedas.</p>
                            <p><strong>7. Disponibilidad y Servicios de Terceros</strong><br />
                                Algunas prestaciones dependen de proveedores externos. Streaming Box no garantiza continuidad absoluta ni responde por cambios, bloqueos o interrupciones causadas por terceros.</p>
                            <p><strong>8. Suspensión o Cierre de Cuenta</strong><br />
                                Podemos limitar, suspender o cerrar cuentas por incumplimientos, actividad sospechosa, fraude o riesgos de seguridad, sin perjuicio de acciones adicionales que correspondan.</p>
                            <p><strong>9. Limitación de Responsabilidad</strong><br />
                                En la máxima medida permitida por la ley, Streaming Box no será responsable por daños indirectos, incidentales o lucro cesante derivados del uso o imposibilidad de uso de la plataforma.</p>
                            <p><strong>10. Privacidad y Datos Personales</strong><br />
                                Tratamos tus datos para operación, soporte, seguridad y cumplimiento. Al usar la plataforma aceptas este tratamiento conforme a la normativa aplicable.</p>
                            <p><strong>11. Modificaciones, Ley Aplicable y Jurisdicción</strong><br />
                                Podemos actualizar estos términos en cualquier momento. La versión vigente será la publicada en la plataforma. Cualquier controversia se regirá por la ley aplicable y la jurisdicción competente del domicilio del operador.</p>
                            <p className="tos-legal">Última actualización: 13 de junio de 2026.<br />
                                (c) 2026 Streaming Box. Todos los derechos reservados. Plataforma desarrollada y operada de forma privada.</p>
                        </div>
                    </MotionDiv>
                </MotionDiv>
            ) : null}
        </AnimatePresence>
    );
}
