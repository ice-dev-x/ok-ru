const BASE_URL = "https://ok.ru";

function cleanText(text) {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]*>/g, "")
    .trim();
}

// Función genérica para extraer tarjetas de video del código fuente de ok.ru
function extractItems(html, limit = 30) {
  const items = [];
  const vistos = new Set();
  
  // OK.ru suele agrupar los videos en contenedores con enlaces href="/video/12345"
  const regex = /<a[^>]+href=["'](\/video\/\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = regex.exec(html)) !== null && items.length < limit) {
    const link = match[1];
    if (vistos.has(link)) continue;
    
    const inner = match[2];
    
    // Buscar el título del video (suele estar en el atributo alt, title o aria-label de la imagen)
    const titleMatch = inner.match(/(?:alt|title|aria-label)=["']([^"']+)["']/i) || 
                       inner.match(/<div[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/div>/i);
    let title = titleMatch ? titleMatch[1].trim() : "";

    // Buscar la portada del video
    const imgMatch = inner.match(/src=["']([^"']+)["']/i) || 
                     inner.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/i);
    let poster = imgMatch ? imgMatch[1] : "";
    
    if (poster && poster.startsWith("//")) poster = "https:" + poster;

    // Solo agregar si detectó al menos un título y una imagen válida
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

export async function home() {
  const fetchPage = async (path) => {
    try {
      const res = await kino.fetch(`${BASE_URL}${path}`, { 
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } 
      });
      if (!res.ok) return "";
      return await res.text();
    } catch (e) { return ""; }
  };

  // Extraer de las secciones públicas principales de ok.ru/video
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

export async function search(query) {
  const searchTerm = (query && query.q) ? encodeURIComponent(query.q) : "";
  if (!searchTerm) return [];

  const url = `https://html.duckduckgo.com/html/?q=site:ok.ru/video+${searchTerm}`;
  console.log("🔎 Buscando a través de DuckDuckGo...");
  
  try {
    const res = await kino.fetch(url, { 
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept-Language": "es-ES,es;q=0.9"
      } 
    });
    
    if (!res.ok) return [];
    const html = await res.text();
    
    const items = [];
    const vistos = new Set();
    
    // Atrapamos TODOS los enlaces de la página de DuckDuckGo
    const links = html.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi);
    
    if (links) {
      for (const linkHtml of links) {
        const hrefMatch = linkHtml.match(/href="([^"]+)"/i);
        if (!hrefMatch) continue;
        let href = hrefMatch[1];
        
        // DuckDuckGo oculta los links originales en una redirección (uddg=...). Lo decodificamos.
        if (href.includes('uddg=')) {
          try { href = decodeURIComponent(href.split('uddg=')[1].split('&')[0]); } catch(e){}
        }
        
        // Si el link final es un video de OK.RU, lo procesamos
        const idMatch = href.match(/ok\.ru\/video\/(\d+)/i);
        if (idMatch) {
          const videoId = idMatch[1];
          // Limpiamos el título quitando etiquetas HTML (como <b> o <span>)
          let title = linkHtml.replace(/<[^>]+>/g, "").trim();
          
          // Filtramos para evitar meter los links de "texto plano" como si fueran títulos
          if (title.length > 5 && !title.includes('ok.ru/video') && !title.startsWith('http')) {
            if (!vistos.has(videoId)) {
              vistos.add(videoId);
              items.push({
                id: "okru-" + videoId,
                ref: "https://ok.ru/video/" + videoId,
                // Limpiamos el sufijo "| Odnoklassniki" si aparece
                title: title.replace(/\|?\s*Odnoklassniki/i, "").replace(/\|?\s*OK\.RU/i, "").trim(),
                poster: "https://via.placeholder.com/300x450/ff9900/ffffff?text=Video+OK.RU",
                kind: "movie"
              });
            }
          }
        }
      }
    }
    
    console.log(`✅ ¡ÉXITO! Se encontraron ${items.length} resultados.`);
    // Si llegase a dar 0, imprimimos un pedacito del HTML para ver si DDG nos bloqueó
    if (items.length === 0) {
      console.log("⚠️ HTML de prueba:", html.substring(0, 300));
    }
    
    return items; 
  } catch (err) {
    console.log("Error general:", err);
    return [];
  }
}
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

    // A veces 'metadata' es un string JSON que hay que parsear, a veces ya es un objeto.
    let metaObj = flashvars.metadata;
    if (typeof metaObj === "string") {
      try { metaObj = JSON.parse(metaObj); } catch (e) { }
    }

    // 1. Buscar HLS (.m3u8) en metaObj
    if (metaObj) {
      if (metaObj.ondemandHls) {
        return {
          url: metaObj.ondemandHls,
          headers: { "User-Agent": "Mozilla/5.0", "Referer": embedUrl }
        };
      }
      if (metaObj.hlsManifestUrl) {
        return {
          url: metaObj.hlsManifestUrl,
          headers: { "User-Agent": "Mozilla/5.0", "Referer": embedUrl }
        };
      }
      if (metaObj.videos && Array.isArray(metaObj.videos) && metaObj.videos.length > 0) {
        return {
          url: metaObj.videos[0].url,
          headers: { "User-Agent": "Mozilla/5.0", "Referer": embedUrl }
        };
      }
    }

    // 2. Fallbacks históricos en la raíz de flashvars
    if (flashvars.metadataUrl) {
      return {
        url: flashvars.metadataUrl,
        headers: { "User-Agent": "Mozilla/5.0", "Referer": embedUrl }
      };
    }
    if (flashvars.hlsManifestUrl) {
      return {
        url: flashvars.hlsManifestUrl,
        headers: { "User-Agent": "Mozilla/5.0", "Referer": embedUrl }
      };
    }

    throw new Error("No se encontraron enlaces de video válidos en el código fuente.");
  } catch (e) {
    throw new Error(String(e));
  }
}