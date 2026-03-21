import "./globals.css";

export const metadata = {
  title: "Free Website Audit for Local Businesses | Tim Shephard",
  description: "Find out how your website scores in 30 seconds. Free audit for local businesses.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
