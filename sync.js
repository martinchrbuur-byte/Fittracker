/* State Synchronization Module – Supabase */

const SYNC_CONFIG = {
  DEBOUNCE_MS: 2000, // Wait 2 seconds after last change before syncing
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
};

let syncTimeout = null;
let syncInProgress = false;
let latestPendingState = null;
let latestPendingToken = 0;
let activeSyncToken = 0;

function syncCloneState(state) {
  try {
    return JSON.parse(JSON.stringify(state));
  } catch {
    return state;
  }
}

function syncSetDebugStatus(status, message) {
  const payload = {
    status,
    message: message || '',
    at: new Date().toISOString(),
  };

  window.__syncDebugStatus = payload;
  try {
    window.dispatchEvent(new CustomEvent('sync-status', { detail: payload }));
  } catch {}
}

function syncGetCurrentUserId() {
  let userId = typeof authGetUserId === 'function' ? authGetUserId() : null;
  if (userId) return userId;

  const token = localStorage.getItem('auth_access_token');
  if (!token || typeof authDecodeUserIdFromJWT !== 'function') return null;

  userId = authDecodeUserIdFromJWT(token);
  if (userId) {
    localStorage.setItem('auth_user_id', userId);
  }
  return userId;
}

function syncBuildLegacyLocalState() {
  try {
    const splitOrder = JSON.parse(localStorage.getItem('splitOrder') || 'null');
    const workouts = JSON.parse(localStorage.getItem('workouts') || 'null');
    const notes = JSON.parse(localStorage.getItem('notes') || 'null');

    if (!Array.isArray(splitOrder) || !workouts || typeof workouts !== 'object' || !notes || typeof notes !== 'object') {
      return null;
    }

    return {
      splitOrder,
      workouts,
      notes,
      lastPlannedDate: localStorage.getItem('lastPlannedDate') || null,
      currentDayIndex: parseInt(localStorage.getItem('currentDayIndex') || '0', 10) || 0,
      completedDays: JSON.parse(localStorage.getItem('completedDays') || '{}'),
      workoutDayLogs: JSON.parse(localStorage.getItem('workoutDayLogs') || '{}'),
      templates: JSON.parse(localStorage.getItem('templates') || '{}'),
      appliedTemplates: JSON.parse(localStorage.getItem('appliedTemplates') || '{}'),
      progressionGoals: JSON.parse(localStorage.getItem('progressionGoals') || '{}'),
      stateMeta: JSON.parse(localStorage.getItem('stateMeta') || '{"schemaVersion":2,"statsLastComputedAt":null}'),
    };
  } catch (err) {
    console.error('Failed to build legacy local state snapshot:', err);
    return null;
  }
}

/* Show sync toast notification */
function showSyncToast(message, type = 'info') {
  let toastContainer = $('sync-toasts');
  if (!toastContainer) {
    toastContainer = C('div');
    toastContainer.id = 'sync-toasts';
    toastContainer.style.position = 'fixed';
    toastContainer.style.top = '1rem';
    toastContainer.style.right = '1rem';
    toastContainer.style.zIndex = '3000';
    toastContainer.style.pointerEvents = 'none';
    document.body.appendChild(toastContainer);
  }

  let toast = C('div', 'sync-toast');
  toast.className = `sync-toast sync-toast-${type}`;
  toast.textContent = message;

  toastContainer.appendChild(toast);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 3000);
}

/* Fetch user's state from backend */
async function syncFetchState() {
  if (!authIsLoggedIn()) return null;

  const userId = syncGetCurrentUserId();
  if (!userId) {
    console.warn('syncFetchState aborted: missing authenticated user id');
    return null;
  }

  try {
    syncSetDebugStatus('fetching', 'Henter state fra backend');
    // Get user's row from user_states table
    const res = await authFetch(
      `/rest/v1/user_states?select=state&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      { method: 'GET' }
    );

    if (!res.ok) {
      console.error('Fetch state failed:', res.status);
      syncSetDebugStatus('fetch_error', `Fetch fejlede (${res.status})`);
      return null;
    }

    const rows = await res.json();
    if (rows && rows[0] && rows[0].state) {
      // Cache in localStorage
      localStorage.setItem('_sync_cache', JSON.stringify(rows[0].state));
      syncSetDebugStatus('fetched', 'State hentet');
      return rows[0].state;
    }

    syncSetDebugStatus('empty', 'Ingen backend-state fundet');
    return null;
  } catch (err) {
    console.error('Fetch state error:', err);
    syncSetDebugStatus('fetch_error', 'Fejl under state-fetch');
    return null;
  }
}

/* Save state to backend (with retry logic) */
async function syncSaveState(state, retryCount = 0, token = 0) {
  if (!authIsLoggedIn()) {
    showSyncToast('Ikke logget ind - kan ikke gemme', 'error');
    syncSetDebugStatus('skipped', 'Ikke logget ind');
    return false;
  }

  if (token && token !== activeSyncToken) {
    syncSetDebugStatus('stale_skipped', 'Ignorerer forældet save-forsøg');
    return false;
  }

  syncInProgress = true;

  try {
    syncSetDebugStatus('saving', 'Gemmer til backend');
    const userId = syncGetCurrentUserId();
    if (!userId) {
      throw new Error('Missing user id for sync');
    }

    // Upsert by user_id (create if missing, update if exists)
    const res = await authFetch(
      `/rest/v1/user_states?on_conflict=user_id`,
      {
        method: 'POST',
        headers: {
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify({
          user_id: userId,
          state: state,
          updated_at: new Date().toISOString(),
        }),
      }
    );

    if (res.ok) {
      syncInProgress = false;
      showSyncToast('Gemt', 'success');
      syncSetDebugStatus('saved', 'Backend sync lykkedes');
      // Clear offline queue
      await syncClearOfflineQueue();
      return true;
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    console.error('Sync save error:', err);

    if (retryCount < SYNC_CONFIG.MAX_RETRIES) {
      syncSetDebugStatus('retrying', `Retry ${retryCount + 1}/${SYNC_CONFIG.MAX_RETRIES}`);
      // Retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, SYNC_CONFIG.RETRY_DELAY_MS * (retryCount + 1)));
      if (token && token !== activeSyncToken) {
        syncInProgress = false;
        syncSetDebugStatus('stale_skipped', 'Forældet retry droppet');
        return false;
      }
      return syncSaveState(state, retryCount + 1, token);
    } else {
      syncInProgress = false;
      showSyncToast('Kunne ikke gemme - prøver igen senere', 'error');
      syncSetDebugStatus('queued', 'Gemning fejlede, state queued offline');
      // Queue for retry
      await syncQueueOfflineChange(state);
      return false;
    }
  }
}

async function syncFlushPending() {
  if (syncInProgress) return;
  if (!latestPendingState) return;

  const token = latestPendingToken;
  const stateToSave = latestPendingState;
  activeSyncToken = token;

  const success = await syncSaveState(stateToSave, 0, token);

  if (token === latestPendingToken) {
    latestPendingState = null;
  }

  if (latestPendingState && activeSyncToken !== latestPendingToken) {
    activeSyncToken = latestPendingToken;
  }

  if (latestPendingState && success !== null) {
    setTimeout(() => {
      syncFlushPending();
    }, 0);
  }
}

/* Debounced save (only sync after 2 seconds of inactivity) */
function syncStateDebounced(state) {
  latestPendingState = syncCloneState(state);
  latestPendingToken += 1;
  const token = latestPendingToken;

  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  showSyncToast('Gemmer...', 'info');
  syncSetDebugStatus('pending', `Debounce ${SYNC_CONFIG.DEBOUNCE_MS}ms`);

  syncTimeout = setTimeout(() => {
    if (token !== latestPendingToken) {
      syncSetDebugStatus('stale_skipped', 'Debounced save erstattet af nyere state');
      return;
    }
    syncFlushPending();
  }, SYNC_CONFIG.DEBOUNCE_MS);
}

/* Offline Queue: Store changes for later sync */
async function syncQueueOfflineChange(state) {
  try {
    let queue = JSON.parse(localStorage.getItem('_sync_queue') || '[]');
    queue.push({
      state: state,
      timestamp: Date.now(),
    });
    localStorage.setItem('_sync_queue', JSON.stringify(queue));
  } catch (err) {
    console.error('Queue offline change error:', err);
  }
}

/* Clear offline queue */
async function syncClearOfflineQueue() {
  localStorage.removeItem('_sync_queue');
}

/* Process offline queue (sync queued changes when back online) */
async function syncProcessOfflineQueue() {
  try {
    const queue = JSON.parse(localStorage.getItem('_sync_queue') || '[]');
    if (queue.length === 0) return;

    console.log(`Processing ${queue.length} queued changes...`);
    syncSetDebugStatus('processing_queue', `Behandler ${queue.length} queued ændringer`);

    // Process all queued states (last one wins)
    const lastState = queue[queue.length - 1].state;
    const success = await syncSaveState(lastState);

    if (success) {
      showSyncToast('Offline ændringer synkroniseret', 'success');
    }
  } catch (err) {
    console.error('Process queue error:', err);
  }
}

/* Monitor online/offline status */
function syncInitializeOfflineDetection() {
  window.addEventListener('online', () => {
    console.log('Back online - syncing queued changes');
    syncSetDebugStatus('online', 'Online igen');
    syncProcessOfflineQueue();
  });

  window.addEventListener('offline', () => {
    console.log('Offline - changes will be queued');
    showSyncToast('Offline - ændringer gemmes lokalt', 'warning');
    syncSetDebugStatus('offline', 'Offline - gemmer lokalt');
  });
}

/* Export state to file (with auth context) */
async function syncExportState(state) {
  const exportData = {
    exported_at: new Date().toISOString(),
    user_id: authGetUserId(),
    state: state,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = C('a');
  a.href = url;
  a.download = `fittracker-backup-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* Import state from file (validate and sync to backend) */
async function syncImportState(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);

        // Validate it's a state object
        if (!data.state || typeof data.state !== 'object') {
          showSyncToast('Invalid backup file', 'error');
          resolve(false);
          return;
        }

        // Sync imported state to backend
        const success = await syncSaveState(data.state);
        if (success) {
          showSyncToast('Backup gendannet', 'success');
        }

        resolve(success);
      } catch (err) {
        console.error('Import error:', err);
        showSyncToast('Kunne ikke importere backup', 'error');
        resolve(false);
      }
    };
    reader.readAsText(file);
  });
}

/* Initialize sync on page load */
async function syncInit() {
  syncInitializeOfflineDetection();
  syncSetDebugStatus('init', 'Sync init');

  if (!authIsLoggedIn()) return null;

  // Fetch user's state from backend
  console.log('Fetching state from backend...');
  const backendState = await syncFetchState();

  if (backendState) {
    // User has existing data on backend
    return backendState;
  } else {
    // First time login - might import from localStorage or start fresh
    const localState = JSON.parse(localStorage.getItem('state') || 'null') || syncBuildLegacyLocalState();
    if (localState) {
      // Migrate localStorage to backend
      console.log('Migrating localStorage state to backend...');
      const migrated = await syncSaveState(localState);
      if (!migrated) {
        console.warn('Local state migration failed; using local state for this session');
      }
      return localState;
    }
  }

  return null;
}
