import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Global interceptor to automatically attach cookies (credentials: 'include') 
// on all cross-origin requests to the backend API host.
const originalFetch = window.fetch;
window.fetch = function (url, options = {}) {
  options.credentials = 'include';
  return originalFetch(url, options);
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

