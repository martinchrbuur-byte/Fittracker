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

/* Utility: Make authenticated API calls */
async function authFetch(endpoint, options = {}) {
  const token = localStorage.getItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN);
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
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

/* Sign Up */
async function authSignup(email, password) {
  try {
    const res = await fetch(`${AUTH_CONFIG.SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: AUTH_CONFIG.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Signup failed');
    }

    const data = await res.json();
    if (data.session) {
      authStoreSession(data.session, data.user.id);
      return { success: true, user: data.user };
    } else {
      throw new Error('No session returned');
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
      },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error_description || err.message || 'Login failed');
    }

    const data = await res.json();
    authStoreSession(data, null); // Extract user_id from JWT if needed
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
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      authLogout();
      return false;
    }

    const data = await res.json();
    authStoreSession(data, null);
    return true;
  } catch (err) {
    console.error('Token refresh failed:', err);
    authLogout();
    return false;
  }
}

/* Store session tokens */
function authStoreSession(session, userId) {
  localStorage.setItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN, session.access_token);
  localStorage.setItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN, session.refresh_token);
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
  return localStorage.getItem(AUTH_STORAGE_KEYS.USER_ID);
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
        closeMod('signup-modal');
        // Reinitialize app
        if (typeof initApp === 'function') initApp();
      } else {
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
