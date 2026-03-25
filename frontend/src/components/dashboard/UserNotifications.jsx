import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "../../api/api";
import "../../styles/user-notifications.css";

const MotionDiv = motion.div;

export default function UserNotifications() {
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const popupRef = useRef(null);

    const fetchNotifications = useCallback(async () => {
        try {
            const res = await apiFetch("/user/notifications");
            if (res.ok && Array.isArray(res.data)) {
                setNotifications(res.data);
                setUnreadCount(res.data.filter(n => !n.is_read).length);
            }
        } catch {
            /* ignore notification polling failures */
        }
    }, []);

    // Fetch initial notifications
    useEffect(() => {
        const initialTimer = window.setTimeout(() => {
            void fetchNotifications();
        }, 0);
        const timer = setInterval(() => {
            void fetchNotifications();
        }, 180000);
        return () => {
            window.clearTimeout(initialTimer);
            clearInterval(timer);
        };
    }, [fetchNotifications]);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(event) {
            if (popupRef.current && !popupRef.current.contains(event.target)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    async function markAsRead(id) {
        try {
            const res = await apiFetch(`/user/notifications/${id}/read`, { method: "PUT" });
            if (res.ok) {
                setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
                setUnreadCount(c => Math.max(0, c - 1));
            }
        } catch (e) { console.error(e); }
    }

    async function markAllAsRead() {
        const unread = notifications.filter(n => !n.is_read);
        for (const u of unread) {
            await markAsRead(u.id);
        }
    }

    return (
        <div className="user-notif-container" ref={popupRef}>
            <button
                className="user-notif-btn"
                onClick={() => setOpen(!open)}
                title="Notificaciones"
            >
                🔔
                {unreadCount > 0 && (
                    <span className="user-notif-badge">{unreadCount}</span>
                )}
            </button>

            <AnimatePresence>
                {open && (
                    <MotionDiv
                        className="user-notif-popup"
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                    >
                        <div className="user-notif-header">
                            <h4>Notificaciones</h4>
                            {unreadCount > 0 && (
                                <button onClick={markAllAsRead} className="user-notif-markall">
                                    Marcar leídas
                                </button>
                            )}
                        </div>
                        
                        <div className="user-notif-list">
                            {notifications.length === 0 ? (
                                <div className="user-notif-empty">
                                    <span style={{fontSize: 24, opacity: 0.5}}>📭</span>
                                    <p>No tienes notificaciones.</p>
                                </div>
                            ) : (
                                notifications.map(notif => (
                                    <div 
                                        key={notif.id} 
                                        className={`user-notif-item ${notif.is_read ? 'read' : 'unread'}`}
                                        onClick={() => !notif.is_read && markAsRead(notif.id)}
                                    >
                                        {!notif.is_read && <span className="user-notif-dot" />}
                                        <div className="user-notif-content">
                                            <p className="user-notif-msg">{notif.message}</p>
                                            <span className="user-notif-time">
                                                {new Date(notif.created_at).toLocaleString('es-CO')}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </MotionDiv>
                )}
            </AnimatePresence>
        </div>
    );
}
