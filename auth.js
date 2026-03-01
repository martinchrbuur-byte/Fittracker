/* Authentication Module – Supabase Email/Password Auth */

// Configuration – set these from your Supabase project
const AUTH_CONFIG = {
  SUPABASE_URL: 'https://mgmizuxlyttoitufmieb.supabase.co', // Set to your Supabase Project URL (e.g., https://xxxxx.supabase.co)
  SUPABASE_ANON_KEY: 'sb_publishable_nQylUGRMdFyPoQG2fi__WQ_1Y-fXIsZ', // Set to your Supabase Anon Key
};

const AUTH_STORAGE_KEYS = {
  ACCESS_TOKEN: 'auth_access_token',
  REFRESH_TOKEN: 'auth_refresh_token',
  USER_ID: 'auth_user_id',
};

function authIsLocalDevBypassEnabled() {
  try {
    const host = window.location && window.location.hostname;
    return host === '127.0.0.1' || host === 'localhost';
  } catch {
    return false;
  }
}

/* Utility: Make authenticated API calls */
async function authFetch(endpoint, options = {}) {
  const token = localStorage.getItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN);
  const headers = {
    'Content-Type': 'application/json',
    apikey: AUTH_CONFIG.SUPABASE_ANON_KEY,
    ...options.headers,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    headers['Authorization'] = `Bearer ${AUTH_CONFIG.SUPABASE_ANON_KEY}`;
  }

  const response = await fetch(`${AUTH_CONFIG.SUPABASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Refresh token if 401
  if (response.status === 401) {
    const refreshed = await refreshAuthToken();
    if (refreshed) {
      return authFetch(endpoint, options); // Retry with new token
    } else {
      authLogout();
      return response;
    }
  }

  return response;
}

async function authReadError(response, fallbackMessage) {
  try {
    const err = await response.json();
    return (
      err.error_description ||
      err.msg ||
      err.message ||
      fallbackMessage
    );
  } catch {
    return fallbackMessage;
  }
}

function authDecodeUserIdFromJWT(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.sub || payload.user_id || null;
  } catch {
    return null;
  }
}

/* Sign Up */
async function authSignup(email, password) {
  try {
    const res = await fetch(`${AUTH_CONFIG.SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: AUTH_CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${AUTH_CONFIG.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const message = await authReadError(res, 'Signup failed');
      throw new Error(message);
    }

    const data = await res.json();
    if (data.session) {
      authStoreSession(data.session, data.user && data.user.id ? data.user.id : null);
      return { success: true, user: data.user };
    } else if (data.user) {
      return {
        success: true,
        requiresEmailConfirmation: true,
        message: 'Konto oprettet. Bekræft din email før login.',
        user: data.user,
      };
    } else {
      throw new Error('Signup completed without a valid session/user response');
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/* Sign In */
async function authSignin(email, password) {
  try {
    const res = await fetch(`${AUTH_CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: AUTH_CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${AUTH_CONFIG.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const message = await authReadError(res, 'Login failed');
      throw new Error(message);
    }

    const data = await res.json();
    const userId =
      (data.user && data.user.id) ||
      authDecodeUserIdFromJWT(data.access_token);
    authStoreSession(data, userId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/* Refresh Access Token */
async function refreshAuthToken() {
  const refreshToken = localStorage.getItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN);
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${AUTH_CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: AUTH_CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${AUTH_CONFIG.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      authLogout();
      return false;
    }

    const data = await res.json();
    const userId =
      (data.user && data.user.id) ||
      authDecodeUserIdFromJWT(data.access_token);
    authStoreSession(data, userId);
    return true;
  } catch (err) {
    console.error('Token refresh failed:', err);
    authLogout();
    return false;
  }
}

/* Store session tokens */
function authStoreSession(session, userId) {
  if (session && session.access_token) {
    localStorage.setItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN, session.access_token);
  }
  if (session && session.refresh_token) {
    localStorage.setItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN, session.refresh_token);
  }
  if (userId) {
    localStorage.setItem(AUTH_STORAGE_KEYS.USER_ID, userId);
  }
}

/* Check if user is authenticated */
function authIsLoggedIn() {
  return !!localStorage.getItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN);
}

/* Get current user ID */
function authGetUserId() {
  const stored = localStorage.getItem(AUTH_STORAGE_KEYS.USER_ID);
  if (stored) return stored;

  const token = localStorage.getItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN);
  const decoded = authDecodeUserIdFromJWT(token);
  if (decoded) {
    localStorage.setItem(AUTH_STORAGE_KEYS.USER_ID, decoded);
    return decoded;
  }

  return null;
}

/* Sign Out */
async function authLogout() {
  try {
    // Call logout endpoint (optional, just clears session)
    await authFetch('/auth/v1/logout', { method: 'POST' });
  } catch (err) {
    console.error('Logout API error (non-critical):', err);
  }

  // Clear local tokens
  localStorage.removeItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(AUTH_STORAGE_KEYS.USER_ID);

  // Close any auth modals
  closeMod('login-modal');
  closeMod('signup-modal');

  // Redirect to login
  if (typeof showAuthModal === 'function') {
    showAuthModal();
  }
}

/* Create Auth Modal (Signup/Login tabs) */
function createAuthModals() {
  // Signup Modal
  let signupMod = $('signup-modal');
  if (!signupMod) {
    signupMod = C('div', 'modal');
    signupMod.id = 'signup-modal';
    signupMod.setAttribute('aria-hidden', 'true');
    
    let bd = C('div', 'modal-backdrop');
    bd.addEventListener('click', () => {
      // Don't close backdrop while signing up
    });
    signupMod.appendChild(bd);
    
    let mc = C('div', 'modal-content');
    mc.setAttribute('role', 'dialog');
    mc.setAttribute('aria-modal', 'true');
    
    let title = C('h2');
    title.textContent = 'Opret konto';
    mc.appendChild(title);
    
    let emailLbl = C('label', 'modal-label');
    emailLbl.textContent = 'Email:';
    mc.appendChild(emailLbl);
    
    let emailInp = C('input', 'modal-input');
    emailInp.type = 'email';
    emailInp.id = 'signup-email';
    emailInp.placeholder = 'din@email.com';
    mc.appendChild(emailInp);
    
    let passLbl = C('label', 'modal-label');
    passLbl.textContent = 'Kodeord:';
    passLbl.style.marginTop = '0.5rem';
    mc.appendChild(passLbl);
    
    let passInp = C('input', 'modal-input');
    passInp.type = 'password';
    passInp.id = 'signup-password';
    passInp.placeholder = 'Mindst 6 tegn';
    mc.appendChild(passInp);
    
    let errDiv = C('div', 'auth-error');
    errDiv.id = 'signup-error';
    errDiv.style.display = 'none';
    errDiv.style.color = '#dc2626';
    errDiv.style.fontSize = '0.9rem';
    errDiv.style.marginTop = '0.5rem';
    mc.appendChild(errDiv);
    
    let ft = C('div', 'modal-footer');
    
    let toggleBtn = C('button', 'secondary-btn');
    toggleBtn.textContent = 'Har du allerede en konto?';
    toggleBtn.addEventListener('click', () => {
      closeMod('signup-modal');
      showAuthModal('login');
    });
    ft.appendChild(toggleBtn);
    
    let signupBtn = C('button', 'primary-btn');
    signupBtn.textContent = 'Opret';
    signupBtn.addEventListener('click', async () => {
      const email = $('signup-email').value.trim();
      const password = $('signup-password').value;
      
      if (!email || !password) {
        $('signup-error').textContent = 'Udfyld alle felter';
        $('signup-error').style.display = 'block';
        return;
      }
      
      signupBtn.disabled = true;
      signupBtn.textContent = 'Opretter...';
      
      const result = await authSignup(email, password);
      
      if (result.success) {
        if (result.requiresEmailConfirmation) {
          $('signup-error').style.color = '#16a34a';
          $('signup-error').textContent = result.message || 'Konto oprettet. Bekræft din email før login.';
          $('signup-error').style.display = 'block';
          signupBtn.disabled = false;
          signupBtn.textContent = 'Opret';
          return;
        }
        closeMod('signup-modal');
        if (typeof initApp === 'function') initApp();
      } else {
        $('signup-error').style.color = '#dc2626';
        $('signup-error').textContent = result.error || 'Signup mislykkedes';
        $('signup-error').style.display = 'block';
        signupBtn.disabled = false;
        signupBtn.textContent = 'Opret';
      }
    });
    ft.appendChild(signupBtn);
    
    mc.appendChild(ft);
    signupMod.appendChild(mc);
    document.body.appendChild(signupMod);
  }

  // Login Modal
  let loginMod = $('login-modal');
  if (!loginMod) {
    loginMod = C('div', 'modal');
    loginMod.id = 'login-modal';
    loginMod.setAttribute('aria-hidden', 'true');
    
    let bd = C('div', 'modal-backdrop');
    bd.addEventListener('click', () => {
      // Don't close backdrop while logging in
    });
    loginMod.appendChild(bd);
    
    let mc = C('div', 'modal-content');
    mc.setAttribute('role', 'dialog');
    mc.setAttribute('aria-modal', 'true');
    
    let title = C('h2');
    title.textContent = 'Log ind';
    mc.appendChild(title);
    
    let emailLbl = C('label', 'modal-label');
    emailLbl.textContent = 'Email:';
    mc.appendChild(emailLbl);
    
    let emailInp = C('input', 'modal-input');
    emailInp.type = 'email';
    emailInp.id = 'login-email';
    emailInp.placeholder = 'din@email.com';
    mc.appendChild(emailInp);
    
    let passLbl = C('label', 'modal-label');
    passLbl.textContent = 'Kodeord:';
    passLbl.style.marginTop = '0.5rem';
    mc.appendChild(passLbl);
    
    let passInp = C('input', 'modal-input');
    passInp.type = 'password';
    passInp.id = 'login-password';
    passInp.placeholder = 'Dit kodeord';
    mc.appendChild(passInp);
    
    let errDiv = C('div', 'auth-error');
    errDiv.id = 'login-error';
    errDiv.style.display = 'none';
    errDiv.style.color = '#dc2626';
    errDiv.style.fontSize = '0.9rem';
    errDiv.style.marginTop = '0.5rem';
    mc.appendChild(errDiv);
    
    let ft = C('div', 'modal-footer');
    
    let toggleBtn = C('button', 'secondary-btn');
    toggleBtn.textContent = 'Opret ny konto';
    toggleBtn.addEventListener('click', () => {
      closeMod('login-modal');
      showAuthModal('signup');
    });
    ft.appendChild(toggleBtn);
    
    let loginBtn = C('button', 'primary-btn');
    loginBtn.textContent = 'Log ind';
    loginBtn.addEventListener('click', async () => {
      const email = $('login-email').value.trim();
      const password = $('login-password').value;
      
      if (!email || !password) {
        $('login-error').textContent = 'Udfyld alle felter';
        $('login-error').style.display = 'block';
        return;
      }
      
      loginBtn.disabled = true;
      loginBtn.textContent = 'Logger ind...';
      
      const result = await authSignin(email, password);
      
      if (result.success) {
        closeMod('login-modal');
        // Reinitialize app
        if (typeof initApp === 'function') initApp();
      } else {
        $('login-error').textContent = result.error || 'Login mislykkedes';
        $('login-error').style.display = 'block';
        loginBtn.disabled = false;
        loginBtn.textContent = 'Log ind';
      }
    });
    ft.appendChild(loginBtn);
    
    mc.appendChild(ft);
    loginMod.appendChild(mc);
    document.body.appendChild(loginMod);
  }
}

/* Show Auth Modal (Signup or Login) */
function showAuthModal(mode = 'login') {
  if (!$('login-modal')) {
    createAuthModals();
  }
  
  if (mode === 'login') {
    openMod('login-modal');
    closeMod('signup-modal');
    $('login-error').style.display = 'none';
    $('login-email').value = '';
    $('login-password').value = '';
  } else if (mode === 'signup') {
    openMod('signup-modal');
    closeMod('login-modal');
    $('signup-error').style.display = 'none';
    $('signup-email').value = '';
    $('signup-password').value = '';
  }
}

/* Initialize Auth (check if logged in, show modal if not) */
async function authInit() {
  if (authIsLocalDevBypassEnabled()) {
    console.warn('[auth] Local development mode detected - bypassing auth');
    closeMod('login-modal');
    closeMod('signup-modal');
    const signupBtn = $('signup-btn');
    const logoutBtn = $('logout-btn');
    if (signupBtn) signupBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
    return true;
  }

  // Try to refresh token on page load
  if (localStorage.getItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN)) {
    await refreshAuthToken();
  }

  if (authIsLoggedIn()) {
    // User is logged in, proceed with app
    closeMod('login-modal');
    closeMod('signup-modal');
    return true;
  } else {
    // User not logged in, show login modal
    createAuthModals();
    showAuthModal('login');
    return false;
  }
}
