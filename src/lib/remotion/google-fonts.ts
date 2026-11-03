"use client";

const GOOGLE_FONT_SPECS = [
  { family: "Libre Caslon Display", query: "Libre+Caslon+Display:wght@400" },
  { family: "Abril Fatface", query: "Abril+Fatface" },
  { family: "Yeseva One", query: "Yeseva+One" },
  { family: "DM Sans", query: "DM+Sans:wght@400;500;700" },
  { family: "Noto Sans Math", query: "Noto+Sans+Math" },
  { family: "Newsreader", query: "Newsreader:wght@400;500;600" },
  { family: "Lora", query: "Lora:wght@400;500;600" },
  { family: "Source Sans 3", query: "Source+Sans+3:wght@400;500;600" },
  { family: "Great Vibes", query: "Great+Vibes" },
  { family: "Petit Formal Script", query: "Petit+Formal+Script" },
  { family: "Allura", query: "Allura" },
  { family: "Parisienne", query: "Parisienne" },
  { family: "Sacramento", query: "Sacramento" },
  { family: "Caveat", query: "Caveat:wght@400;500;600;700" },
  { family: "Indie Flower", query: "Indie+Flower" },
  { family: "Permanent Marker", query: "Permanent+Marker" },
  { family: "Comic Neue", query: "Comic+Neue:wght@300;400;700" },
  { family: "JetBrains Mono", query: "JetBrains+Mono:wght@400;500;600;700" },
  { family: "IBM Plex Mono", query: "IBM+Plex+Mono:wght@400;500;600;700" },
  { family: "Space Mono", query: "Space+Mono:wght@400;700" },
  { family: "Roboto Mono", query: "Roboto+Mono:wght@400;500;700" },
  { family: "Inter", query: "Inter:wght@100..900" },
  { family: "Playfair Display", query: "Playfair+Display:wght@400;500;600;700;800;900" },
  { family: "Old Standard TT", query: "Old+Standard+TT:wght@400;700" },
  { family: "Bebas Neue", query: "Bebas+Neue" },
  { family: "Anton", query: "Anton" },
  { family: "Cormorant Garamond", query: "Cormorant+Garamond:wght@300;400;500;600;700" },
  { family: "DM Serif Display", query: "DM+Serif+Display:ital@0;1" },
  { family: "Bodoni Moda", query: "Bodoni+Moda:opsz,wght@6..96,400;6..96,500;6..96,600;6..96,700;6..96,800;6..96,900" },
  { family: "Prata", query: "Prata" },
  { family: "Italiana", query: "Italiana" },
  { family: "Marcellus", query: "Marcellus" },
  { family: "Cinzel", query: "Cinzel:wght@400;500;600;700;800;900" },
  { family: "Marcellus SC", query: "Marcellus+SC" },
  { family: "Cormorant Unicase", query: "Cormorant+Unicase:wght@300;400;500;600;700" },
  { family: "Crimson Pro", query: "Crimson+Pro:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700" },
  { family: "IM Fell English", query: "IM+Fell+English:ital@0;1" },
  { family: "UnifrakturMaguntia", query: "UnifrakturMaguntia" },
  { family: "UnifrakturCook", query: "UnifrakturCook:wght@700" },
  { family: "Pirata One", query: "Pirata+One" },
  { family: "MedievalSharp", query: "MedievalSharp" },
  { family: "Uncial Antiqua", query: "Uncial+Antiqua" },
  { family: "Philosopher", query: "Philosopher:wght@400;700" },
  { family: "Oswald", query: "Oswald:wght@200;300;400;500;600;700" },
  { family: "Roboto Slab", query: "Roboto+Slab:wght@400;700" },
  { family: "Archivo Narrow", query: "Archivo+Narrow:wght@400;500;600;700" },
  { family: "Teko", query: "Teko:wght@300;400;500;600;700" },
  { family: "Orbitron", query: "Orbitron:wght@400;500;600;700;800;900" },
  { family: "Space Grotesk", query: "Space+Grotesk:wght@300;400;500;600;700" },
  { family: "Oxanium", query: "Oxanium:wght@200;300;400;500;600;700;800" },
  { family: "Exo 2", query: "Exo+2:wght@300;400;500;600;700;800" },
  { family: "Rajdhani", query: "Rajdhani:wght@300;400;500;600;700" },
  { family: "EB Garamond", query: "EB+Garamond:wght@400;500;600;700;800" },
  { family: "Libre Baskerville", query: "Libre+Baskerville:wght@400;700" },
  { family: "Baskervville", query: "Baskervville:ital@0;1" },
  { family: "Cormorant SC", query: "Cormorant+SC:wght@300;400;500;600;700" },
  { family: "Fraunces", query: "Fraunces:opsz,wght@9..144,100;9..144,200;9..144,300;9..144,400;9..144,500;9..144,600;9..144,700;9..144,800;9..144,900" },
  { family: "Instrument Serif", query: "Instrument+Serif:ital@0;1" },
  { family: "Sora", query: "Sora:wght@100;200;300;400;500;600;700;800" },
  { family: "Bricolage Grotesque", query: "Bricolage+Grotesque:opsz,wght@12..96,200;12..96,300;12..96,400;12..96,500;12..96,600;12..96,700;12..96,800" },
  { family: "Outfit", query: "Outfit:wght@100;200;300;400;500;600;700;800;900" },
  { family: "Archivo Black", query: "Archivo+Black" },
  { family: "Montserrat", query: "Montserrat:wght@400;500;600;700;800" },
  { family: "Lato", query: "Lato:wght@300;400;700" },
  { family: "Raleway", query: "Raleway:wght@400;500;600;700" },
  { family: "Poppins", query: "Poppins:wght@400;500;600;700" },
  { family: "Quicksand", query: "Quicksand:wght@400;500;600;700" },
  { family: "Comfortaa", query: "Comfortaa:wght@400;500;600;700" },
  { family: "Work Sans", query: "Work+Sans:wght@400;500;600;700" },
  { family: "Fredoka", query: "Fredoka:wght@400;500;600;700" },
  { family: "Baloo 2", query: "Baloo+2:wght@400;500;600;700" },
  { family: "Special Elite", query: "Special+Elite" },
  { family: "Lobster", query: "Lobster" },
  { family: "Pacifico", query: "Pacifico" },
  { family: "Yellowtail", query: "Yellowtail" },
  { family: "Alex Brush", query: "Alex+Brush" },
] as const;

const loadedFontFaces = new Set<string>();
const loadedFaceSources = new Map<string, {family:string; block:string; src:string}>();
let pendingFontLoad: Promise<void> | null = null;
const FONT_LOAD_TIMEOUT_MS = 4000;

function getGoogleFontsCssUrl(families?: readonly string[]) {
  const specs = families ? GOOGLE_FONT_SPECS.filter(spec => families.includes(spec.family)) : GOOGLE_FONT_SPECS;
  const familyQuery = specs.map((spec) => `family=${spec.query}`).join("&");
  return `https://fonts.googleapis.com/css2?${familyQuery}&display=swap`;
}

function getFontFaceKey(family: string, style: string, weight: string, src: string) {
  return `${family}__${style}__${weight}__${src}`;
}

function readQuotedValue(cssBlock: string, property: string) {
  const match = cssBlock.match(new RegExp(`${property}:\\s*['"]([^'"]+)['"]`, "i"));
  return match?.[1] ?? null;
}

function readUnquotedValue(cssBlock: string, property: string) {
  const match = cssBlock.match(new RegExp(`${property}:\\s*([^;]+);`, "i"));
  return match?.[1]?.trim() ?? null;
}

async function loadRemotionGoogleFonts(families?: readonly string[]) {
  const response = await fetch(getGoogleFontsCssUrl(families));
  if (!response.ok) {
    throw new Error(`Failed to load Google Fonts CSS (${response.status})`);
  }

  const css = await response.text();
  const fontFaceBlocks = css.match(/@font-face\s*{[^}]+}/g) ?? [];
  if (!fontFaceBlocks.length) throw new Error("Google Fonts returned no font faces");
  if (families?.some(family => !fontFaceBlocks.some(block => readQuotedValue(block, "font-family") === family))) {
    throw new Error("Google Fonts did not supply every required font family");
  }
  await Promise.all(fontFaceBlocks.map(async (block) => {
    const family = readQuotedValue(block, "font-family");
    const style = readUnquotedValue(block, "font-style") ?? "normal";
    const weight = readUnquotedValue(block, "font-weight") ?? "400";
    const srcMatch = block.match(/src:\s*url\(([^)]+)\)\s*format\('([^']+)'\)/i);
    const src = srcMatch?.[1] ?? null;

    if (!family || !src) return;

    const fontFaceKey = getFontFaceKey(family, style, weight, src);
    if (loadedFontFaces.has(fontFaceKey)) return;

    const fontFace = new FontFace(family, `url(${src})`, {
      style,
      weight,
      ...(readUnquotedValue(block, "unicode-range") ? { unicodeRange: readUnquotedValue(block, "unicode-range")! } : {}),
    });
    await fontFace.load();
    document.fonts.add(fontFace);
    loadedFontFaces.add(fontFaceKey);
    loadedFaceSources.set(fontFaceKey,{family,block,src});
  }));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`Timed out loading Remotion fonts after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

/** Lets DOM previews (font picker, caption samples) resolve every family lazily without forcing downloads. */
export function linkGoogleFontsStylesheet() {
  if (typeof document === "undefined" || document.getElementById("dreamcut-google-fonts")) return;
  const link = document.createElement("link");
  link.id = "dreamcut-google-fonts";
  link.rel = "stylesheet";
  link.href = getGoogleFontsCssUrl();
  document.head.appendChild(link);
}

export function ensureRemotionGoogleFonts() {
  if (typeof document === "undefined") return Promise.resolve();
  if (pendingFontLoad) return pendingFontLoad;

  pendingFontLoad = withTimeout(loadRemotionGoogleFonts(), FONT_LOAD_TIMEOUT_MS)
    .catch((error) => {
      console.warn("[remotion] caption font preload failed; continuing with fallbacks", error);
    })
    .finally(() => {
      pendingFontLoad = null;
    });
  return pendingFontLoad;
}


const requiredLoads = new Map<string, Promise<void>>();
/** Export must never race a late font swap against frame capture. */
export function ensureRequiredRemotionFonts(families: readonly string[]) {
  if (typeof document === "undefined" || families.length === 0) return Promise.resolve();
  const required = [...new Set(families)].filter(family => !["Georgia", "ui-monospace"].includes(family)).sort();
  if (!required.length) return Promise.resolve();
  const unsupported = required.filter(family => !GOOGLE_FONT_SPECS.some(spec => spec.family === family));
  if (unsupported.length) return Promise.reject(new Error(`Unregistered render fonts: ${unsupported.join(", ")}`));
  const key = JSON.stringify(required);
  const existing = requiredLoads.get(key);
  if (existing) return existing;
  const pending = withTimeout(loadRemotionGoogleFonts(required), 25_000).catch(error => {
    requiredLoads.delete(key);
    throw error;
  });
  requiredLoads.set(key, pending);
  return pending;
}

const embeddedFaces = new Map<string,Promise<string>>();
/** SVG text textures need the same font bytes inside their isolated image document. */
export async function embeddedRenderFontCss(family:string):Promise<string>{
  await ensureRequiredRemotionFonts([family]);
  const faces=[...loadedFaceSources.values()].filter(face=>face.family===family);
  return (await Promise.all(faces.map(face=>{
    let pending=embeddedFaces.get(face.src);
    if(!pending){
      pending=(async()=>{
        const response=await fetch(face.src,{signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw Error('Failed to embed tracked-text font');
        const bytes=new Uint8Array(await response.arrayBuffer());
        if(bytes.length>4*1024*1024)throw Error('Tracked-text font exceeds the texture font budget');
        let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
        return `data:font/woff2;base64,${btoa(binary)}`;
      })();
      embeddedFaces.set(face.src,pending);
      void pending.catch(()=>embeddedFaces.delete(face.src));
    }
    return pending.then(data=>face.block.replace(face.src,data));
  }))).join('\n');
}
