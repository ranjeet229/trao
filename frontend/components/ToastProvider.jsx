'use client';

import { Toaster } from 'sonner';

export default function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      duration={4000}
      closeButton
      theme="light"
      offset={84}
      mobileOffset={{ top: 116, left: 16, right: 16 }}
      toastOptions={{
        style: {
          background: '#fcfdf9',
          color: '#265d43',
          border: '1px solid #d8e2ce',
          borderRadius: '9px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          boxShadow: '0 8px 26px #243b2520',
        },
      }}
    />
  );
}
