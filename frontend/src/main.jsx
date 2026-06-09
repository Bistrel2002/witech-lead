import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Global interceptor to automatically attach cookies and headers (Bearer, Portal)
// on all cross-origin requests to the backend API host.
const originalFetch = window.fetch;
window.fetch = function (url, options = {}) {
  options.credentials = 'include';
  
  // Create a headers object if it doesn't exist
  if (!options.headers) {
    options.headers = {};
  } else if (!(options.headers instanceof Headers) && typeof options.headers === 'object') {
    options.headers = { ...options.headers };
  }

  // Helper to set headers regardless of Headers class vs plain object
  const setHeader = (key, val) => {
    if (options.headers instanceof Headers) {
      options.headers.set(key, val);
    } else {
      options.headers[key] = val;
    }
  };

  // Attach general session token
  const token = localStorage.getItem('witech_auth_token');
  if (token) {
    setHeader('Authorization', `Bearer ${token}`);
  }

  // Attach portal-specific session tokens
  const adminPortalToken = localStorage.getItem('witech_admin_portal_token');
  if (adminPortalToken) {
    setHeader('X-Admin-Portal-Token', adminPortalToken);
  }

  const teamPortalToken = localStorage.getItem('witech_team_portal_token');
  if (teamPortalToken) {
    setHeader('X-Team-Portal-Token', teamPortalToken);
  }

  return originalFetch(url, options);
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

