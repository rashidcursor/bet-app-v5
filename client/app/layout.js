import { Inter } from "next/font/google";
import "./globals.css";
import { ReduxProvider } from "@/components/ReduxProvider";
import { SidebarProvider } from "@/contexts/SidebarContext.js";
import AuthProvider from "@/components/auth/AuthProvider";
import LayoutWrapper from "@/components/LayoutWrapper";
import BetSlip from "@/components/BetSlip";
import { Toaster } from "@/components/ui/sonner";
import { metadata } from "./metadata";
import Header from "@/components/Header";
import SidebarWrapper from "@/components/SidebarWrapper";
import ContentWrapper from "@/components/ContentWrapper";
import WebSocketInitializer from "@/components/WebSocketInitializer";
import WebSocketDebugger from "@/components/WebSocketDebugger";
import LeagueMappingPreloader from "@/components/LeagueMappingPreloader";

const inter = Inter({ subsets: ["latin"] });

export { metadata };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased h-screen overflow-hidden">
        <ReduxProvider>
          <WebSocketInitializer />
          <WebSocketDebugger />
          <LeagueMappingPreloader />
          <AuthProvider>
            <SidebarProvider>
              {/* <LayoutWrapper>{children}</LayoutWrapper> */}
              <div className="bg-gray-100 h-screen flex flex-col">
                {/* Header - fixed on mobile, normal on desktop */}
                <div className="flex-shrink-0 h-0 md:h-auto">
                  <Header />
                </div>

                {/* Main Content Area - add padding-top on mobile to account for fixed header + secondary nav */}
                <div className="flex flex-1 overflow-hidden pt-[calc(env(safe-area-inset-top)+7rem)] md:pt-0">
                  {/* Fixed Sidebar */}
                  <SidebarWrapper />

                  {/* Main Content Area with Secondary Navigation */}
                  <ContentWrapper>{children}</ContentWrapper>
                </div>
              </div>

              {/* Bet Slip - Global component */}
              <BetSlip />
            </SidebarProvider>
          </AuthProvider>
        </ReduxProvider>
        <Toaster
          position="top-center"
          richColors
          closeButton={false}
          expand={false}
          toastOptions={{
            duration: 5000,
            style: {
              borderRadius: '0px',
            },
          }}
        />
      </body>
    </html>
  );
}
