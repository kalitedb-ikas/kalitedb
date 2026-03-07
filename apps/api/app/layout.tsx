import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "KaliteDB API",
  description: "KaliteDB route handler API"
};

export default function RootLayout(props: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body>{props.children}</body>
    </html>
  );
}

