import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1e1b4b',
              color: '#e0e7ff',
              border: '1px solid rgba(99, 102, 241, 0.3)',
            },
            success: {
              iconTheme: {
                primary: '#818cf8',
                secondary: '#1e1b4b',
              },
            },
            error: {
              iconTheme: {
                primary: '#f87171',
                secondary: '#1e1b4b',
              },
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
