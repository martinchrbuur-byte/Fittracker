/* State Synchronization Module – Supabase */

const SYNC_CONFIG = {
  DEBOUNCE_MS: 2000, // Wait 2 seconds after last change before syncing
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
};

let syncTimeout = null;
let syncInProgress = false;

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

  const userId = authGetUserId();
  if (!userId) {
    // Extract from token if needed
    const token = localStorage.getItem('auth_access_token');
    if (!token) return null;
  }

  try {
    // Get user's row from user_states table
    const res = await authFetch(
      `/rest/v1/user_states?select=state&limit=1`,
      { method: 'GET' }
    );

    if (!res.ok) {
      console.error('Fetch state failed:', res.status);
      return null;
    }

    const rows = await res.json();
    if (rows && rows[0] && rows[0].state) {
      // Cache in localStorage
      localStorage.setItem('_sync_cache', JSON.stringify(rows[0].state));
      return rows[0].state;
    }

    return null;
  } catch (err) {
    console.error('Fetch state error:', err);
    return null;
  }
}

/* Save state to backend (with retry logic) */
async function syncSaveState(state, retryCount = 0) {
  if (!authIsLoggedIn()) {
    showSyncToast('Ikke logget ind - kan ikke gemme', 'error');
    return false;
  }

  syncInProgress = true;

  try {
    const userId = authGetUserId();

    // First try PATCH (update existing)
    let res = await authFetch(
      `/rest/v1/user_states?user_id=eq.${userId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          state: state,
          updated_at: new Date().toISOString(),
        }),
      }
    );

    // If 404, try POST (create new)
    if (res.status === 404 || res.status === 406) {
      res = await authFetch(
        `/rest/v1/user_states`,
        {
          method: 'POST',
          body: JSON.stringify({
            user_id: userId,
            state: state,
          }),
        }
      );
    }

    if (res.ok) {
      syncInProgress = false;
      showSyncToast('Gemt', 'success');
      // Clear offline queue
      await syncClearOfflineQueue();
      return true;
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    console.error('Sync save error:', err);

    if (retryCount < SYNC_CONFIG.MAX_RETRIES) {
      // Retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, SYNC_CONFIG.RETRY_DELAY_MS * (retryCount + 1)));
      return syncSaveState(state, retryCount + 1);
    } else {
      syncInProgress = false;
      showSyncToast('Kunne ikke gemme - prøver igen senere', 'error');
      // Queue for retry
      await syncQueueOfflineChange(state);
      return false;
    }
  }
}

/* Debounced save (only sync after 2 seconds of inactivity) */
function syncStateDebounced(state) {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  showSyncToast('Gemmer...', 'info');

  syncTimeout = setTimeout(() => {
    syncSaveState(state);
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
    syncProcessOfflineQueue();
  });

  window.addEventListener('offline', () => {
    console.log('Offline - changes will be queued');
    showSyncToast('Offline - ændringer gemmes lokalt', 'warning');
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

  if (!authIsLoggedIn()) return;

  // Fetch user's state from backend
  console.log('Fetching state from backend...');
  const backendState = await syncFetchState();

  if (backendState) {
    // User has existing data on backend
    return backendState;
  } else {
    // First time login - might import from localStorage or start fresh
    const localState = JSON.parse(localStorage.getItem('state') || 'null');
    if (localState) {
      // Migrate localStorage to backend
      console.log('Migrating localStorage state to backend...');
      await syncSaveState(localState);
      return localState;
    }
  }

  return null;
}
