'use client';

import { useCustomSidebar } from '@/contexts/SidebarContext.js';

const ContentWrapper = ({ children }) => {
    const { isCollapsed, isMobile } = useCustomSidebar();

    return (
        <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${
            !isMobile && !isCollapsed ? 'ml-6' : ''
        }`}>
            {/* SecondaryNavigation removed - now in Header */}
            <main className="flex-1 overflow-y-auto overflow-x-hidden pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:pb-0 pt-0 md:pt-0">
                {children}
            </main>
        </div>
    );
};

export default ContentWrapper;


