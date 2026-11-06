import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpportunityOS",
  description: "Bounty discovery, verification and selection",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="nav">
          <Link href="/" className="brand">OpportunityOS</Link>
          <span className="muted small">local node · loopback only</span>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
