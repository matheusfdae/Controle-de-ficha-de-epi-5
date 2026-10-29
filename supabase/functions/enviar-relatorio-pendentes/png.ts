// deno-lint-ignore-file
// SVG → PNG com o resvg (WebAssembly). O .wasm e a fonte Inter são baixados do
// jsDelivr na primeira chamada e ficam em memória enquanto a função estiver
// carregada. Mesma versão do package.json (o localhost usa o node_modules).
import { initWasm, Resvg } from 'npm:@resvg/resvg-wasm@2.6.2';

const CDN = 'https://cdn.jsdelivr.net/npm';
let pronto: Promise<Uint8Array[]> | null = null;

async function baixar(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Falha ao baixar ${url} (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}

function preparar(): Promise<Uint8Array[]> {
  pronto ??= (async () => {
    await initWasm(fetch(`${CDN}/@resvg/resvg-wasm@2.6.2/index_bg.wasm`));
    return Promise.all(['Inter_400Regular', 'Inter_700Bold']
      .map(f => baixar(`${CDN}/@expo-google-fonts/inter@0.2.3/${f}.ttf`)));
  })().catch(e => { pronto = null; throw e; });
  return pronto;
}

export async function svgParaPng(svg: string): Promise<Uint8Array> {
  const fontes = await preparar();
  return new Resvg(svg, { font: { fontBuffers: fontes, defaultFontFamily: 'Inter', loadSystemFonts: false } }).render().asPng();
}
