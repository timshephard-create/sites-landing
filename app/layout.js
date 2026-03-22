import "./globals.css";
import Script from "next/script";

export const metadata = {
  title: "Free Website Audit for Local Businesses | Tim Shephard",
  description: "Find out how your website scores in 30 seconds. Free audit for local businesses.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-8289C9WGMG"
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-8289C9WGMG');
          `}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
