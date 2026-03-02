/* Authentication Module – Supabase Email/Password Auth */

// Configuration – set these from your Supabase project
const AUTH_CONFIG = {
  SUPABASE_URL: 'https://mgmizuxlyttoitufmieb.supabase.co', // Set to your Supabase Project URL (e.g., https://xxxxx.supabase.co)
  SUPABASE_ANON_KEY: 'sb_publishable_nQylUGRMdFyPoQG2fi__WQ_1Y-fXIsZ', // Set to your Supabase Anon Key
  ALLOW_LOCAL_DEV_AUTH_BYPASS: false,
};

const AUTH_STORAGE_KEYS = {
  ACCESS_TOKEN: 'auth_access_token',
  REFRESH_TOKEN: 'auth_refresh_token',
  USER_ID: 'auth_user_id',
  USER_EMAIL: 'auth_user_email',
  USER_PROFILE: 'auth_user_profile',
};

function authGetAccessToken() {
  const sessionToken = sessionStorage.getItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN);
  if (sessionToken) return sessionToken;

  const legacyToken = localStorage.getItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN);
  if (legacyToken) {
    try {
      sessionStorage.setItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN, legacyToken);
      localStorage.removeItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN);
    } catch {}
    return legacyToken;
  }

  return null;
}

function authSetAccessToken(token) {
  if (!token) return;
  try {
    sessionStorage.setItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN, token);
    localStorage.removeItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN);
  } catch {
    localStorage.setItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN, token);
  }
}

function authGetRefreshToken() {
  return localStorage.getItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN);
}

function authSetRefreshToken(token) {
  if (!token) return;
  localStorage.setItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN, token);
}

function authClearSessionStorage() {
  sessionStorage.removeItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN);
}

function authIsLocalDevBypassEnabled() {
  try {
    const host = window.location && window.location.hostname;
    const isLocalHost = host === '127.0.0.1' || host === 'localhost';
    return AUTH_CONFIG.ALLOW_LOCAL_DEV_AUTH_BYPASS === true && isLocalHost;
  } catch {
    return false;
  }
}

/* Utility: Make authenticated API calls */
async function authFetch(endpoint, options = {}) {
  const token = authGetAccessToken();
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

function authDecodeClaimsFromJWT(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    return JSON.parse(atob(parts[1]));
  } catch {
    return null;
  }
}

function authGetStoredUserProfile() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEYS.USER_PROFILE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function authStoreUserProfile(profile) {
  if (!profile || typeof profile !== 'object') return;
  try {
    localStorage.setItem(AUTH_STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
  } catch {}
  const email = typeof profile.email === 'string' ? profile.email.trim() : '';
  if (email) {
    localStorage.setItem(AUTH_STORAGE_KEYS.USER_EMAIL, email);
  }
}

function authExtractRoles(profile) {
  const roles = [];
  const appMeta = profile && profile.app_metadata && typeof profile.app_metadata === 'object' ? profile.app_metadata : {};
  const userMeta = profile && profile.user_metadata && typeof profile.user_metadata === 'object' ? profile.user_metadata : {};
  const maybePush = (value) => {
    if (typeof value === 'string' && value.trim()) roles.push(value.trim().toLowerCase());
  };
  maybePush(appMeta.role);
  maybePush(userMeta.role);
  if (Array.isArray(appMeta.roles)) appMeta.roles.forEach(maybePush);
  if (Array.isArray(userMeta.roles)) userMeta.roles.forEach(maybePush);
  return [...new Set(roles)];
}

async function authFetchCurrentUserProfile() {
  if (!authIsLoggedIn()) return null;
  try {
    const res = await authFetch('/auth/v1/user', { method: 'GET' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== 'object') return null;
    authStoreUserProfile(data);
    return data;
  } catch {
    return null;
  }
}

async function authRefreshUserProfile() {
  return authFetchCurrentUserProfile();
}

function authGetUserProfile() {
  return authGetStoredUserProfile();
}

function authGetUserEmail() {
  const stored = localStorage.getItem(AUTH_STORAGE_KEYS.USER_EMAIL);
  if (stored && stored.trim()) return stored.trim();
  const token = authGetAccessToken();
  const claims = authDecodeClaimsFromJWT(token);
  const email = claims && typeof claims.email === 'string' ? claims.email.trim() : '';
  if (email) {
    localStorage.setItem(AUTH_STORAGE_KEYS.USER_EMAIL, email);
    return email;
  }
  const profile = authGetStoredUserProfile();
  return profile && typeof profile.email === 'string' ? profile.email.trim() : null;
}

function authIsAdminAuthorized() {
  const profile = authGetStoredUserProfile();
  if (!profile) return false;
  const roles = authExtractRoles(profile);
  return roles.includes('admin');
}

async function authListRegisteredUsers() {
  if (!authIsLoggedIn()) {
    return { success: false, error: 'Ikke logget ind', users: [] };
  }
  if (!authIsAdminAuthorized()) {
    return { success: false, error: 'Ingen admin-adgang', users: [] };
  }

  try {
    const res = await authFetch('/rest/v1/rpc/admin_list_registered_users', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      if (res.status === 404) {
        return {
          success: false,
          error: 'RPC admin_list_registered_users mangler i Supabase (SQL skal køres i backend-setup).',
          users: [],
        };
      }
      const message = await authReadError(
        res,
        'Kunne ikke hente registrerede brugere. Opret RPC funktionen admin_list_registered_users i Supabase.'
      );
      return { success: false, error: message, users: [] };
    }

    const payload = await res.json();
    const rows = Array.isArray(payload) ? payload : [];
    const users = rows.map((row, index) => {
      const email =
        row && typeof row.email === 'string' && row.email.trim()
          ? row.email.trim()
          : row && typeof row.user_email === 'string' && row.user_email.trim()
            ? row.user_email.trim()
            : '';
      const username =
        row && typeof row.username === 'string' && row.username.trim()
          ? row.username.trim()
          : row && typeof row.display_name === 'string' && row.display_name.trim()
            ? row.display_name.trim()
            : row && typeof row.name === 'string' && row.name.trim()
              ? row.name.trim()
              : '';
      const id = row && typeof row.user_id === 'string' ? row.user_id : '';
      return {
        id,
        email,
        username: username || email || `Bruger ${index + 1}`,
      };
    });

    return { success: true, users };
  } catch (err) {
    return {
      success: false,
      error:
        (err && err.message) ||
        'Kunne ikke hente registrerede brugere',
      users: [],
    };
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
      if (data.user && typeof data.user === 'object') {
        authStoreUserProfile(data.user);
      }
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
    if (data.user && typeof data.user === 'object') {
      authStoreUserProfile(data.user);
    } else {
      await authRefreshUserProfile();
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/* Refresh Access Token */
async function refreshAuthToken() {
  const refreshToken = authGetRefreshToken();
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
    if (data.user && typeof data.user === 'object') {
      authStoreUserProfile(data.user);
    } else {
      await authRefreshUserProfile();
    }
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
    authSetAccessToken(session.access_token);
  }
  if (session && session.refresh_token) {
    authSetRefreshToken(session.refresh_token);
  }
  if (userId) {
    localStorage.setItem(AUTH_STORAGE_KEYS.USER_ID, userId);
  }
  authUpdateHeaderActions();
}

function authUpdateHeaderActions() {
  const signupBtn = $('signup-btn');
  const logoutBtn = $('logout-btn');
  const isLoggedIn = authIsLoggedIn();
  if (signupBtn) signupBtn.style.display = isLoggedIn ? 'none' : '';
  if (logoutBtn) logoutBtn.style.display = isLoggedIn ? '' : 'none';
}

/* Check if user is authenticated */
function authIsLoggedIn() {
  return !!authGetAccessToken() || !!authGetRefreshToken();
}

/* Get current user ID */
function authGetUserId() {
  const stored = localStorage.getItem(AUTH_STORAGE_KEYS.USER_ID);
  if (stored) return stored;

  const token = authGetAccessToken();
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
  authClearSessionStorage();
  localStorage.removeItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(AUTH_STORAGE_KEYS.USER_ID);
  localStorage.removeItem(AUTH_STORAGE_KEYS.USER_EMAIL);
  localStorage.removeItem(AUTH_STORAGE_KEYS.USER_PROFILE);
  authUpdateHeaderActions();

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
  if (authGetRefreshToken()) {
    await refreshAuthToken();
  }

  if (authIsLoggedIn()) {
    // User is logged in, proceed with app
    await authRefreshUserProfile();
    closeMod('login-modal');
    closeMod('signup-modal');
    authUpdateHeaderActions();
    return true;
  } else {
    // User not logged in, show login modal
    createAuthModals();
    showAuthModal('login');
    authUpdateHeaderActions();
    return false;
  }
}
