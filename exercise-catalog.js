(function(){
  const DIRECT_BASE = 'https://www.exercisedb.dev/api/v1';
  const PROXY_BASE = '/functions/v1/exercisedb-proxy';

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

  async function tryFetch(url){
    const res = await fetch(url, { method:'GET' });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function proxyOrDirect(path, params){
    const query = toQuery(params);
    try {
      return await tryFetch(`${PROXY_BASE}${path}${query}`);
    } catch {
      return await tryFetch(`${DIRECT_BASE}${path}${query}`);
    }
  }

  async function searchExercises(options){
    const opts = options || {};
    const payload = await proxyOrDirect('/exercises', {
      search: opts.search || '',
      bodyPart: opts.bodyPart || '',
      muscle: opts.muscle || '',
      equipment: opts.equipment || '',
      limit: opts.limit || 25,
      offset: opts.offset || 0,
    });

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
