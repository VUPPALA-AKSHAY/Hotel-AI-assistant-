import './globals.css';

export const metadata = {
  title: 'The Grand Palm – Guest Assistant',
  description: 'AI-powered hotel guest assistant for The Grand Palm. Ask about rooms, amenities, policies, dining and availability.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='15' fill='%2310b981'/%3E%3Ctext x='16' y='22' font-size='18' font-weight='bold' text-anchor='middle' fill='white'%3EGP%3C/text%3E%3C/svg%3E" />
        <link rel="stylesheet" href="/styles.v3.css?v=4.9" />
        <link rel="stylesheet" href="/history.css" />
      </head>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}