(function(){
  const DIRECT_BASE = 'https://www.exercisedb.dev/api/v1';
  const APP_CONFIG = window.__APP_CONFIG || {};
  const PROXY_BASE = (APP_CONFIG.EXERCISEDB_PROXY_BASE || '/functions/v1/exercisedb-proxy').replace(/\/$/, '');
  const FORCE_PROXY = APP_CONFIG.EXERCISEDB_FORCE_PROXY === true;

  window.__catalogRouteMode = 'unknown';

  let metaCache = null;

  function toQuery(params){
    const search = new URLSearchParams();
    Object.entries(params || {}).forEach(([key,value])=>{
      if(value===undefined||value===null||value==='') return;
      search.set(key,String(value));
    });
    const qs = search.toString();
    return qs ? `?${qs}` : '';
  }

  function mapExercise(item){
    if(!item||typeof item!=='object') return null;
    const name = item.name || 'Ukendt øvelse';
    return {
      id: item.exerciseId || item.id || `legacy:${name}`,
      exerciseId: item.exerciseId || item.id || null,
      name,
      gifUrl: item.gifUrl || null,
      bodyParts: Array.isArray(item.bodyParts) ? item.bodyParts : [],
      targetMuscles: Array.isArray(item.targetMuscles) ? item.targetMuscles : [],
      equipments: Array.isArray(item.equipments) ? item.equipments : [],
      source: 'exercisedb',
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

  async function tryFetch(url){
    const res = await fetch(url, { method:'GET' });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function proxyOrDirect(path, params){
    const query = toQuery(params);
    const proxyUrl = `${PROXY_BASE}${path}${query}`;
    const directUrl = `${DIRECT_BASE}${path}${query}`;

    if (FORCE_PROXY) {
      const payload = await tryFetch(proxyUrl);
      window.__catalogRouteMode = 'proxy';
      return payload;
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

  async function searchExercises(options){
    const opts = options || {};
    const requestedSearch = (opts.search || '').trim();

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
      Array.isArray(payload?.data) &&
      payload.data.length === 0
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

    const data = Array.isArray(payload.data) ? payload.data : [];
    const metadata = payload.metadata || {};
    return {
      data: data.map(mapExercise).filter(Boolean),
      metadata,
    };
  }

  async function getMeta(){
    if(metaCache) return metaCache;
    try {
      const payload = await proxyOrDirect('/meta', {});
      metaCache = {
        bodyParts: Array.isArray(payload.bodyParts) ? payload.bodyParts : [],
        muscles: Array.isArray(payload.muscles) ? payload.muscles : [],
        equipments: Array.isArray(payload.equipments) ? payload.equipments : [],
      };
      return metaCache;
    } catch {
      metaCache = { bodyParts: [], muscles: [], equipments: [] };
      return metaCache;
    }
  }

  window.exerciseCatalogSearch = searchExercises;
  window.exerciseCatalogMeta = getMeta;
})();
