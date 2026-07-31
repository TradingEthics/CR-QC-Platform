import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme";
import { Sidebar, Topbar } from "@/components/shell";

export const metadata: Metadata = {
  title: "CR QC Platform",
  description: "Case Resolution Quality Control — FundedNext",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        <ThemeProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="app-canvas flex min-h-screen flex-1 flex-col overflow-x-hidden">
              <Topbar />
              <main className="flex-1">{children}</main>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
