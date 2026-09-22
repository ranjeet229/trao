import './globals.css';
export const metadata = {
  title: 'Readyroom — Walk in prepared',
  description: 'A research-backed interview preparation workspace, tailored to your next role.',
};
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
