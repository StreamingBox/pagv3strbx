import { useEffect, useState } from "react";

const DEFAULT_SIDEBAR_DRAWER_BREAKPOINT = 900;

export function isSidebarMobile(breakpoint = DEFAULT_SIDEBAR_DRAWER_BREAKPOINT) {
    return typeof window !== "undefined" && window.innerWidth <= breakpoint;
}

export function useResponsiveSidebar({
    defaultCollapsed = false,
    collapseOnMobile = true,
    expandOnDesktop = false,
    breakpoint = DEFAULT_SIDEBAR_DRAWER_BREAKPOINT,
} = {}) {
    const [collapsed, setCollapsed] = useState(() => {
        if (collapseOnMobile && isSidebarMobile(breakpoint)) return true;
        return defaultCollapsed;
    });
    const [isMobile, setIsMobile] = useState(() => isSidebarMobile(breakpoint));

    useEffect(() => {
        const handleResize = () => {
            const mobile = isSidebarMobile(breakpoint);
            setIsMobile(mobile);
            if (mobile && collapseOnMobile) setCollapsed(true);
            if (!mobile && expandOnDesktop) setCollapsed(false);
        };
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [breakpoint, collapseOnMobile, expandOnDesktop]);

    return { collapsed, setCollapsed, isMobile };
}
