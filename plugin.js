const BASE_URL = "https://ok.ru";
const MI_COOKIE = "_statid=e4320cec-91a3-4fd9-90b0-97c964465f52; bci=-7470853437255611506; viewport=728; _touch=false; _hover=true; __dzbd=false; JSESSIONID=bf8bf0444eca572f43c58e985f45484b8a6294c56e29cd79.5ad553a4; AUTHCODE=k74-geeajErSe7qJY7qny_6Y-q733qFrp_9Vtgow6IjymKe2sqquXONX-vLIJCQxfBQfPeqk-vO8BAB5fYDoDIKvtkq-RwG_UMqjQZWtTBsTnXDDCD63RpbtVohduRWQYva68j5A1328y3Krsg_5; LASTSRV=ok.ru; vdt=3W70uX+Laou5C/9kJIciduUonrcxJziSUCcVdzVC0NAAAABoQqwqXkpXU7N6ynurQbfgx481HQ2Mc8VyRwdDodr71qnRQnJkegGrb89c7G9Qh7JZQkxmAo2uJv35JYT3Nz+4Bs09k6XQgTzqTIgBC/4c8pmR3zoWLgEPQOGALK1DmtjHma53ZgA=; msg_conf=2468555756792551; theme_mode=LIGHT; TZ=-10; CDN=; cudr=0; klos=0; ENVOY_JSESSIONID=\"70019a6209b08850\"; _okAtTraceIds=\"70019a6209b08850\"; _breakpoint=S; __last_online=1791213995240; TZD=-10.2117; TD=2117";

// --- UTILIDADES ---
function cleanText(text) {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]*>/g, "")
    .trim();
}

function extractItems(html, limit = 30) {
  const items = [];
  const vistos = new Set();
  
  const regex = /<a[^>]+href=["'](\/video\/\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = regex.exec(html)) !== null && items.length < limit) {
    const link = match[1];
    if (vistos.has(link)) continue;
    
    const inner = match[2];
    
    const titleMatch = inner.match(/(?:alt|title|aria-label)=["']([^"']+)["']/i) || 
                       inner.match(/<div[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/div>/i);
    let title = titleMatch ? titleMatch[1].trim() : "";

    const imgMatch = inner.match(/src=["']([^"']+)["']/i) || 
                     inner.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/i);
    let poster = imgMatch ? imgMatch[1] : "";
    
    if (poster && poster.startsWith("//")) poster = "https:" + poster;

    if (title && poster && !poster.includes("gif")) {
      vistos.add(link);
      items.push({
        id: "okru-" + link.match(/\d+/)[0],
        ref: BASE_URL + link,
        title: cleanText(title),
        poster: poster,
        kind: "movie"
      });
    }
  }
  return items;
}

// --- 1. HOME (Categorías desde OK.RU) ---
export async function home() {
  const fetchPage = async (path) => {
    try {
      const res = await kino.fetch(`${BASE_URL}${path}`, { 
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "Cookie": MI_COOKIE
        } 
      });
      if (!res.ok) return "";
      return await res.text();
    } catch (e) { return ""; }
  };

  const htmlTop    = await fetchPage("/video/top");
  const htmlMovies = await fetchPage("/video/movies");
  const htmlShows  = await fetchPage("/video/shows");
  
  const topItems    = extractItems(htmlTop, 20);
  const movieItems  = extractItems(htmlMovies, 20);
  const showItems   = extractItems(htmlShows, 20);

  const categories = [];
  if (topItems.length > 0)   categories.push({ id: "top",    title: "🔥 Tendencias en OK.RU", ref: "top",    items: topItems });
  if (movieItems.length > 0) categories.push({ id: "movies", title: "🎬 Películas Completas", ref: "movies", items: movieItems });
  if (showItems.length > 0)  categories.push({ id: "shows",  title: "📺 Series y Shows",      ref: "shows",  items: showItems });

  return categories;
}

// --- 2. SEARCH (Vacío para evitar bloqueos y mantener el plugin limpio) ---
export async function search(query) {
  await null;
  return [];
}

// --- 3. RESOLVE (Reproductor de alta compatibilidad) ---
export async function resolve(ref) {
  await null;
  try {
    let embedUrl = ref;
    
    if (!embedUrl.includes("/videoembed/")) {
      const idMatch = embedUrl.match(/\/video\/(\d+)/);
      if (idMatch) embedUrl = `${BASE_URL}/videoembed/${idMatch[1]}`;
    }
    
    const res = await kino.fetch(embedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Referer": "https://ok.ru/"
      }
    });
    if (!res.ok) throw new Error("No se pudo conectar con el reproductor de OK.RU");
    
    const html = await res.text();
    const match = html.match(/data-options="([^"]+)"/i);
    if (!match) throw new Error("No se encontró data-options en el HTML.");

    const jsonStr = match[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&#039;/g, "'");

    const data = JSON.parse(jsonStr);
    const flashvars = data.flashvars || data;

    let metaObj = flashvars.metadata;
    if (typeof metaObj === "string") {
      try { metaObj = JSON.parse(metaObj); } catch (e) { }
    }

    if (metaObj) {
      if (metaObj.ondemandHls) return { url: metaObj.ondemandHls, headers: { "User-Agent": "Mozilla/5.0", "Referer": embedUrl } };
      if (metaObj.hlsManifestUrl) return { url: metaObj.hlsManifestUrl, headers: { "User-Agent": "Mozilla/5.0", "Referer": embedUrl } };
      if (metaObj.videos && Array.isArray(metaObj.videos) && metaObj.videos.length > 0) return { url: metaObj.videos[0].url, headers: { "User-Agent": "Mozilla/5.0", "Referer": embedUrl } };
    }

    if (flashvars.metadataUrl) return { url: flashvars.metadataUrl, headers: { "User-Agent": "Mozilla/5.0", "Referer": embedUrl } };
    if (flashvars.hlsManifestUrl) return { url: flashvars.hlsManifestUrl, headers: { "User-Agent": "Mozilla/5.0", "Referer": embedUrl } };

    throw new Error("No se encontraron enlaces de video válidos.");
  } catch (e) {
    throw new Error(String(e));
  }
}