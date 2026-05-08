import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Clinical Trial Extraction Review',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
