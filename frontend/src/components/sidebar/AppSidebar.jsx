import { useEffect, useState } from "react";

export function isSidebarMobile() {
    return typeof window !== "undefined" && window.innerWidth <= 900;
}

export function useResponsiveSidebar({ defaultCollapsed = false, collapseOnMobile = true, expandOnDesktop = false } = {}) {
    const [collapsed, setCollapsed] = useState(() => {
        if (collapseOnMobile && isSidebarMobile()) return true;
        return defaultCollapsed;
    });
    const [isMobile, setIsMobile] = useState(() => isSidebarMobile());

    useEffect(() => {
        const handleResize = () => {
            const mobile = isSidebarMobile();
            setIsMobile(mobile);
            if (mobile && collapseOnMobile) setCollapsed(true);
            if (!mobile && expandOnDesktop) setCollapsed(false);
        };
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [collapseOnMobile, expandOnDesktop]);

    return { collapsed, setCollapsed, isMobile };
}
