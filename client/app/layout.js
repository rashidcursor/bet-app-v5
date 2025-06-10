import "./globals.css";
import { ReduxProvider } from "@/components/ReduxProvider";
import Header from "@/components/home/Header";
import Sidebar from "@/components/home/Sidebar";

export const metadata = {
  title: "BetApp - Sports Betting Platform",
  description:
    "Professional sports betting platform with live odds and markets",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ReduxProvider>
          <div className="min-h-screen bg-gray-100 overflow-x-hidden">
            <Header />
            <div className="flex overflow-hidden">
              <div className="hidden lg:block">
                <Sidebar />
              </div>
              <main className="flex-1 w-full lg:w-auto">
                {children}
              </main>
            </div>
          </div>
        </ReduxProvider>
      </body>
    </html>
  );
}
