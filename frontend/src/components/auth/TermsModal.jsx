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
                        initial={{ opacity: 0, scale: 0.92, y: 24 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 16 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="tos-header">
                            <h2>Terminos y Condiciones</h2>
                            <MotionButton
                                className="tos-close"
                                type="button"
                                onClick={onClose}
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                            >
                                <X size={20} />
                            </MotionButton>
                        </div>
                        <div className="tos-body">
                            <p><strong>1. Aceptacion de los Terminos</strong><br />
                                Al registrarte o usar Streaming Box aceptas estos Terminos y Condiciones. Si no estas de acuerdo, no debes usar la plataforma.</p>
                            <p><strong>2. Objeto del Servicio</strong><br />
                                Streaming Box es una plataforma privada para gestionar y comercializar accesos digitales, pedidos y saldos internos para usuarios autorizados.</p>
                            <p><strong>3. Requisitos de Uso</strong><br />
                                Debes proporcionar informacion veraz, mantener tus datos actualizados y resguardar tus credenciales. Eres responsable de toda actividad realizada desde tu cuenta.</p>
                            <p><strong>4. Uso Prohibido</strong><br />
                                Queda prohibido compartir accesos, revender sin autorizacion, automatizar consultas mediante scraping o bots, vulnerar la seguridad de la plataforma o usarla para fines ilicitos.</p>
                            <p><strong>5. Pagos, Saldos y Reembolsos</strong><br />
                                Los saldos acreditados en wallet se consideran consumibles dentro de la plataforma. Salvo obligacion legal o falla comprobable del servicio, las compras son finales y no reembolsables.</p>
                            <p><strong>6. Disponibilidad y Servicios de Terceros</strong><br />
                                Algunas prestaciones dependen de proveedores externos. Streaming Box no garantiza continuidad absoluta ni responde por cambios, bloqueos o interrupciones causadas por terceros.</p>
                            <p><strong>7. Suspension o Cierre de Cuenta</strong><br />
                                Podemos limitar, suspender o cerrar cuentas por incumplimientos, actividad sospechosa, fraude o riesgos de seguridad, sin perjuicio de acciones adicionales que correspondan.</p>
                            <p><strong>8. Limitacion de Responsabilidad</strong><br />
                                En la maxima medida permitida por la ley, Streaming Box no sera responsable por danos indirectos, incidentales o lucro cesante derivados del uso o imposibilidad de uso de la plataforma.</p>
                            <p><strong>9. Privacidad y Datos Personales</strong><br />
                                Tratamos tus datos para operacion, soporte, seguridad y cumplimiento. Al usar la plataforma aceptas este tratamiento conforme a la normativa aplicable.</p>
                            <p><strong>10. Modificaciones, Ley Aplicable y Jurisdiccion</strong><br />
                                Podemos actualizar estos terminos en cualquier momento. La version vigente sera la publicada en la plataforma. Cualquier controversia se regira por la ley aplicable y la jurisdiccion competente del domicilio del operador.</p>
                            <p className="tos-legal">Ultima actualizacion: 11 de marzo de 2026.<br />
                                (c) 2026 Streaming Box. Todos los derechos reservados. Plataforma desarrollada y operada de forma privada.</p>
                        </div>
                    </MotionDiv>
                </MotionDiv>
            ) : null}
        </AnimatePresence>
    );
}
