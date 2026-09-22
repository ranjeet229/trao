import './globals.css';
import ToastProvider from '../components/ToastProvider';
export const metadata = {
  title: 'Readyroom',
  description: 'A research-backed interview preparation workspace, tailored to your next role.',
};
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}
