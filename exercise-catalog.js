(function(){
  const DIRECT_BASE = 'https://www.exercisedb.dev/api/v1';
  const APP_CONFIG = window.__APP_CONFIG || {};
  const DEFAULT_PROXY_PATH = '/functions/v1/exercisedb-proxy';
  const configuredProxyBase = APP_CONFIG.EXERCISEDB_PROXY_BASE || DEFAULT_PROXY_PATH;
  const configuredSupabaseUrl = String(APP_CONFIG.SUPABASE_URL || '').replace(/\/$/, '');
  const PROXY_BASE = String(configuredProxyBase).startsWith('http')
    ? String(configuredProxyBase).replace(/\/$/, '')
    : configuredSupabaseUrl
      ? `${configuredSupabaseUrl}${String(configuredProxyBase).startsWith('/') ? '' : '/'}${configuredProxyBase}`.replace(/\/$/, '')
      : String(configuredProxyBase).replace(/\/$/, '');
  const FORCE_PROXY = APP_CONFIG.EXERCISEDB_FORCE_PROXY === true;
  const DISABLE_PROXY = APP_CONFIG.EXERCISEDB_DISABLE_PROXY === true;

  const CATALOG_CACHE_KEY = 'exercise_catalog_cache_v2';
  const CATALOG_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
  const FULL_FETCH_PAGE_LIMIT = 200;
  const FULL_FETCH_MAX_PAGES = 60;

  window.__catalogRouteMode = 'unknown';

  let metaCache = { bodyParts: [], muscles: [], equipments: [] };
  let allExercisesCache = [];
  let cacheHydrated = false;
  let cacheUpdatedAt = null;
  let warmCachePromise = null;

  function normalizeMetaList(items){
    if(!Array.isArray(items)) return [];
    const seen = new Set();
    return items
      .map((item)=>{
        if(typeof item === 'string'){
          const name = item.trim();
          return name ? { name } : null;
        }
        if(item && typeof item === 'object'){
          const name = String(item.name || item.value || item.label || '').trim();
          return name ? { ...item, name } : null;
        }
        return null;
      })
      .filter(Boolean)
      .filter((item)=>{
        const key = normalizeSearch(item.name);
        if(!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a,b)=>a.name.localeCompare(b.name, 'da-DK'));
  }

  function normalizeMetaPayload(payload){
    const bodyParts = normalizeMetaList(payload?.bodyParts || payload?.bodyparts || payload?.bodyPart || payload?.bodypart);
    const muscles = normalizeMetaList(payload?.muscles || payload?.targetMuscles || payload?.targets || payload?.muscle);
    const equipments = normalizeMetaList(payload?.equipments || payload?.equipment || payload?.equipmentTypes);
    return { bodyParts, muscles, equipments };
  }

  function toQuery(params){
    const search = new URLSearchParams();
    Object.entries(params || {}).forEach(([key,value])=>{
      if(value===undefined||value===null||value==='') return;
      search.set(key,String(value));
    });
    const qs = search.toString();
    return qs ? `?${qs}` : '';
  }

  function normalizeList(value){
    if(Array.isArray(value)){
      return value
        .map((x)=>String(x || '').trim())
        .filter(Boolean);
    }
    if(typeof value === 'string'){
      const name = value.trim();
      return name ? [name] : [];
    }
    return [];
  }

  function mapExercise(item){
    if(!item || typeof item !== 'object') return null;
    const name = String(item.name || '').trim() || 'Ukendt øvelse';
    const exerciseId = item.exerciseId || item.id || null;
    return {
      id: exerciseId || `legacy:${name}`,
      exerciseId,
      name,
      gifUrl: item.gifUrl || null,
      bodyParts: normalizeList(item.bodyParts || item.bodyPart),
      targetMuscles: normalizeList(item.targetMuscles || item.targets || item.muscles || item.muscle),
      equipments: normalizeList(item.equipments || item.equipment),
      source: item.source || 'exercisedb',
    };
  }

  function normalizeSearch(value){
    return String(value || '')
      .toLocaleLowerCase('da-DK')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/æ/g, 'ae')
      .replace(/ø/g, 'oe')
      .replace(/å/g, 'aa')
      .trim();
  }

  function uniqueByName(items){
    const seen = new Set();
    const out = [];
    (items || []).forEach((item)=>{
      const ex = mapExercise(item);
      if(!ex) return;
      const key = normalizeSearch(ex.name);
      if(!key || seen.has(key)) return;
      seen.add(key);
      out.push(ex);
    });
    out.sort((a,b)=>a.name.localeCompare(b.name, 'da-DK'));
    return out;
  }

  function mergeExercises(existing, incoming){
    const merged = new Map();
    const score = (x)=>(x.bodyParts?.length || 0) + (x.targetMuscles?.length || 0) + (x.equipments?.length || 0) + (x.gifUrl ? 1 : 0);

    [...(existing || []), ...(incoming || [])].forEach((raw)=>{
      const item = mapExercise(raw);
      if(!item) return;
      const key = item.exerciseId ? `id:${item.exerciseId}` : `name:${normalizeSearch(item.name)}`;
      const prev = merged.get(key);
      if(!prev || score(item) >= score(prev)) {
        merged.set(key, item);
      }
    });

    return Array.from(merged.values()).sort((a,b)=>a.name.localeCompare(b.name, 'da-DK'));
  }

  function buildMetaFromExercises(exercises){
    const bodyParts = new Set();
    const muscles = new Set();
    const equipments = new Set();

    (exercises || []).forEach((raw)=>{
      const ex = mapExercise(raw);
      if(!ex) return;
      ex.bodyParts.forEach((x)=>bodyParts.add(x));
      ex.targetMuscles.forEach((x)=>muscles.add(x));
      ex.equipments.forEach((x)=>equipments.add(x));
    });

    return {
      bodyParts: normalizeMetaList(Array.from(bodyParts)),
      muscles: normalizeMetaList(Array.from(muscles)),
      equipments: normalizeMetaList(Array.from(equipments)),
    };
  }

  function extractPayloadData(payload){
    if(Array.isArray(payload?.data)) return payload.data;
    if(Array.isArray(payload)) return payload;
    return [];
  }

  async function tryFetch(url){
    const res = await fetch(url, { method:'GET' });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function proxyOrDirect(path, params){
    const query = toQuery(params);
    const proxyUrl = `${PROXY_BASE}${path}${query}`;
    const directUrl = `${DIRECT_BASE}${path}${query}`;

    if (DISABLE_PROXY) {
      const payload = await tryFetch(directUrl);
      window.__catalogRouteMode = 'direct';
      return payload;
    }

    if (FORCE_PROXY) {
      try {
        const payload = await tryFetch(proxyUrl);
        window.__catalogRouteMode = 'proxy';
        return payload;
      } catch {
        const payload = await tryFetch(directUrl);
        window.__catalogRouteMode = 'direct';
        return payload;
      }
    }

    try {
      const payload = await tryFetch(proxyUrl);
      window.__catalogRouteMode = 'proxy';
      return payload;
    } catch {
      const payload = await tryFetch(directUrl);
      window.__catalogRouteMode = 'direct';
      return payload;
    }
  }

  function buildFallbackFromLocalState(){
    const names = [];
    try {
      const workouts = JSON.parse(localStorage.getItem('workouts') || '{}');
      Object.values(workouts || {}).forEach((arr)=>{
        if(!Array.isArray(arr)) return;
        arr.forEach((entry)=>{
          if(typeof entry === 'string') names.push(entry);
          else if(entry && typeof entry === 'object' && entry.name) names.push(String(entry.name));
        });
      });

      const templates = JSON.parse(localStorage.getItem('templates') || '{}');
      Object.values(templates || {}).forEach((arr)=>{
        if(!Array.isArray(arr)) return;
        arr.forEach((entry)=>{
          if(typeof entry === 'string') names.push(entry);
          else if(entry && typeof entry === 'object' && entry.name) names.push(String(entry.name));
        });
      });
    } catch {}

    return uniqueByName(names.map((name)=>({
      id: `legacy:${name}`,
      exerciseId: null,
      name,
      bodyParts: [],
      targetMuscles: [],
      equipments: [],
      gifUrl: null,
      source: 'local-fallback',
    })));
  }

  function persistCatalogCache(){
    try {
      const payload = {
        version: 2,
        updatedAt: new Date().toISOString(),
        exercises: allExercisesCache,
        meta: metaCache,
      };
      cacheUpdatedAt = payload.updatedAt;
      localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(payload));
    } catch {}
  }

  function hydrateCatalogCache(){
    if(cacheHydrated) return;
    cacheHydrated = true;

    try {
      const raw = localStorage.getItem(CATALOG_CACHE_KEY);
      if(raw){
        const parsed = JSON.parse(raw);
        if(parsed && parsed.version === 2){
          allExercisesCache = mergeExercises([], Array.isArray(parsed.exercises) ? parsed.exercises : []);
          metaCache = normalizeMetaPayload(parsed.meta || {});
          if(!metaCache.bodyParts.length && !metaCache.muscles.length && !metaCache.equipments.length && allExercisesCache.length){
            metaCache = buildMetaFromExercises(allExercisesCache);
          }
          cacheUpdatedAt = parsed.updatedAt || null;
        }
      }
    } catch {}

    if(!allExercisesCache.length){
      allExercisesCache = buildFallbackFromLocalState();
      if(allExercisesCache.length){
        metaCache = buildMetaFromExercises(allExercisesCache);
      }
    }
  }

  function isCacheStale(){
    if(!cacheUpdatedAt) return true;
    const ts = new Date(cacheUpdatedAt).getTime();
    if(!Number.isFinite(ts)) return true;
    return (Date.now() - ts) > CATALOG_CACHE_TTL_MS;
  }

  function localSearch(options){
    const opts = options || {};
    const requestedSearch = String(opts.search || '').trim();
    const normalizedSearch = normalizeSearch(requestedSearch);
    const bodyPartNorm = normalizeSearch(opts.bodyPart || '');
    const muscleNorm = normalizeSearch(opts.muscle || '');
    const equipmentNorm = normalizeSearch(opts.equipment || '');
    const limit = Math.max(1, parseInt(opts.limit || 25, 10) || 25);
    const offset = Math.max(0, parseInt(opts.offset || 0, 10) || 0);

    let filtered = allExercisesCache.filter((raw)=>{
      const ex = mapExercise(raw);
      if(!ex) return false;

      if(bodyPartNorm){
        const hasBodyPart = ex.bodyParts.some((x)=>normalizeSearch(x) === bodyPartNorm);
        if(!hasBodyPart) return false;
      }
      if(muscleNorm){
        const hasMuscle = ex.targetMuscles.some((x)=>normalizeSearch(x) === muscleNorm);
        if(!hasMuscle) return false;
      }
      if(equipmentNorm){
        const hasEquipment = ex.equipments.some((x)=>normalizeSearch(x) === equipmentNorm);
        if(!hasEquipment) return false;
      }
      if(normalizedSearch){
        const haystack = [
          ex.name,
          ...(ex.bodyParts || []),
          ...(ex.targetMuscles || []),
          ...(ex.equipments || []),
        ].map(normalizeSearch).join(' ');
        if(!haystack.includes(normalizedSearch)) return false;
      }
      return true;
    });

    const total = filtered.length;
    filtered = filtered.slice(offset, offset + limit);

    return {
      data: filtered,
      metadata: {
        total,
        limit,
        offset,
        source: 'cache',
        cacheSize: allExercisesCache.length,
      },
    };
  }

  async function fetchMetaRemoteSafe(){
    try {
      if(DISABLE_PROXY){
        const [bodyPartsPayload, musclesPayload, equipmentsPayload] = await Promise.all([
          tryFetch(`${DIRECT_BASE}/bodyparts`),
          tryFetch(`${DIRECT_BASE}/muscles`),
          tryFetch(`${DIRECT_BASE}/equipments`),
        ]);
        window.__catalogRouteMode = 'direct';
        return {
          bodyParts: normalizeMetaList(bodyPartsPayload?.data || bodyPartsPayload),
          muscles: normalizeMetaList(musclesPayload?.data || musclesPayload),
          equipments: normalizeMetaList(equipmentsPayload?.data || equipmentsPayload),
        };
      }

      try {
        const payload = await tryFetch(`${PROXY_BASE}/meta`);
        window.__catalogRouteMode = 'proxy';
        const normalized = normalizeMetaPayload(payload);
        if(normalized.bodyParts.length || normalized.muscles.length || normalized.equipments.length){
          return normalized;
        }
      } catch {}

      const [bodyPartsPayload, musclesPayload, equipmentsPayload] = await Promise.all([
        tryFetch(`${DIRECT_BASE}/bodyparts`),
        tryFetch(`${DIRECT_BASE}/muscles`),
        tryFetch(`${DIRECT_BASE}/equipments`),
      ]);
      window.__catalogRouteMode = 'direct';
      return {
        bodyParts: normalizeMetaList(bodyPartsPayload?.data || bodyPartsPayload),
        muscles: normalizeMetaList(musclesPayload?.data || musclesPayload),
        equipments: normalizeMetaList(equipmentsPayload?.data || equipmentsPayload),
      };
    } catch {
      return { bodyParts: [], muscles: [], equipments: [] };
    }
  }

  async function fetchAllExercisesRemoteSafe(){
    const all = [];
    let offset = 0;

    for(let page = 0; page < FULL_FETCH_MAX_PAGES; page++){
      const payload = await proxyOrDirect('/exercises', {
        limit: FULL_FETCH_PAGE_LIMIT,
        offset,
      });
      const chunk = extractPayloadData(payload)
        .map(mapExercise)
        .filter(Boolean);

      if(!chunk.length) break;

      all.push(...chunk);
      if(chunk.length < FULL_FETCH_PAGE_LIMIT) break;
      offset += chunk.length;
    }

    return mergeExercises([], all);
  }

  async function warmCatalogInBackground(force){
    hydrateCatalogCache();

    if(warmCachePromise) return warmCachePromise;
    if(!force && allExercisesCache.length && !isCacheStale()) return allExercisesCache;

    warmCachePromise = (async ()=>{
      try {
        const full = await fetchAllExercisesRemoteSafe();
        if(full.length){
          allExercisesCache = mergeExercises(allExercisesCache, full);
          metaCache = buildMetaFromExercises(allExercisesCache);
          persistCatalogCache();
        }
      } catch {}
      finally {
        warmCachePromise = null;
      }
      return allExercisesCache;
    })();

    return warmCachePromise;
  }

  async function searchExercises(options){
    hydrateCatalogCache();
    warmCatalogInBackground(false).catch(()=>{});

    const opts = options || {};
    const localResult = localSearch(opts);
    if(localResult.data.length || allExercisesCache.length > 200){
      return localResult;
    }

    try {
      const requestedSearch = String(opts.search || '').trim();
      let payload = await proxyOrDirect('/exercises', {
        search: requestedSearch,
        bodyPart: opts.bodyPart || '',
        muscle: opts.muscle || '',
        equipment: opts.equipment || '',
        limit: opts.limit || 25,
        offset: opts.offset || 0,
      });

      const normalizedSearch = normalizeSearch(requestedSearch);
      const loweredSearch = requestedSearch.toLocaleLowerCase('da-DK').trim();
      if (
        requestedSearch &&
        normalizedSearch &&
        normalizedSearch !== loweredSearch &&
        extractPayloadData(payload).length === 0
      ) {
        payload = await proxyOrDirect('/exercises', {
          search: normalizedSearch,
          bodyPart: opts.bodyPart || '',
          muscle: opts.muscle || '',
          equipment: opts.equipment || '',
          limit: opts.limit || 25,
          offset: opts.offset || 0,
        });
      }

      const fetched = extractPayloadData(payload)
        .map(mapExercise)
        .filter(Boolean);

      if(fetched.length){
        allExercisesCache = mergeExercises(allExercisesCache, fetched);
        if(!metaCache.bodyParts.length && !metaCache.muscles.length && !metaCache.equipments.length){
          metaCache = buildMetaFromExercises(allExercisesCache);
        }
        persistCatalogCache();
      }

      const mergedResult = localSearch(opts);
      if(mergedResult.data.length) return mergedResult;

      return {
        data: fetched,
        metadata: payload?.metadata || { source: 'remote' },
      };
    } catch {
      return localResult;
    }
  }

  async function getMeta(){
    hydrateCatalogCache();
    if(metaCache.bodyParts.length || metaCache.muscles.length || metaCache.equipments.length){
      return metaCache;
    }

    if(allExercisesCache.length){
      metaCache = buildMetaFromExercises(allExercisesCache);
      if(metaCache.bodyParts.length || metaCache.muscles.length || metaCache.equipments.length){
        persistCatalogCache();
        return metaCache;
      }
    }

    const remoteMeta = await fetchMetaRemoteSafe();
    metaCache = remoteMeta;
    if(metaCache.bodyParts.length || metaCache.muscles.length || metaCache.equipments.length){
      persistCatalogCache();
    }
    return metaCache;
  }

  hydrateCatalogCache();
  warmCatalogInBackground(false).catch(()=>{});

  window.exerciseCatalogSearch = searchExercises;
  window.exerciseCatalogMeta = getMeta;
  window.exerciseCatalogWarmCache = ()=>warmCatalogInBackground(true);
})();
