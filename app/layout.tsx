import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EBB Watch | Natural Gas Pipeline Notices",
  description: "Public natural gas pipeline notices and board sweep status.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
