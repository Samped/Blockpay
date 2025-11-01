import type { Metadata } from "next";
import "./globals.css";

/**
 * Metadata for the page
 */
export const metadata: Metadata = {
  title: "BlockPay",
  description: "BlockPay — Intuition Network Agent",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

/**
 * Root layout for the page
 *
 * @param {object} props - The props for the root layout
 * @param {React.ReactNode} props.children - The children for the root layout
 * @returns {React.ReactNode} The root layout
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-gray-100 dark:bg-gray-900 dark flex flex-col min-h-screen">
        {/* Header (Fixed Height) */}
        <header className="py-6 flex items-center justify-between relative">
          <img
            src="/logo.png"
            alt="Logo"
            className="h-12 ml-4 object-contain rounded px-2 py-1 ring-1 ring-zinc-300 dark:ring-zinc-700 bg-white dark:bg-white"
          />

          <span className="absolute left-1/2 transform -translate-x-1/2 text-3xl font-bold text-blue-600 dark:text-blue-400">
            BlockPay
          </span>
        </header>

        {/* Main Content (Dynamic, Grows but Doesn't Force Scroll) */}
        <main className="flex-grow flex items-center justify-center px-4">{children}</main>

        {/* Footer (Fixed Height) */}
        <footer className="py-4 text-center text-gray-500 dark:text-gray-400 flex-none">
          <img
            src="/logo.png"
            alt="Logo"
            className="h-10 mx-auto mb-2 object-contain rounded px-2 py-1 ring-1 ring-zinc-300 dark:ring-zinc-700 bg-white dark:bg-white"
          />
          <div className="mt-2">
            <a
              href="https://github.com/coinbase/agentkit"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline text-blue-600 dark:text-blue-400"
            >
              GitHub
            </a>{" "}
            |{" "}
            <a
              href="https://docs.cdp.coinbase.com/agentkit/docs/welcome"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline text-blue-600 dark:text-blue-400"
            >
              Documentation
            </a>{" "}
            |{" "}
            <a
              href="https://discord.gg/CDP"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline text-blue-600 dark:text-blue-400"
            >
              Discord
            </a>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Powered by{" "}
            <a
              href="https://docs.cdp.coinbase.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              CDP
            </a>
          </p>
          <p className="text-xs text-gray-400 mt-2">© {new Date().getFullYear()} Coinbase, Inc.</p>
        </footer>
      </body>
    </html>
  );
}
