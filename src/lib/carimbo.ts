/**
 * Tira o fundo da imagem do carimbo (scan/foto com papel branco, cinza ou
 * amarelado), deixando só a tinta. A cor do fundo é a média da borda da
 * imagem; quanto mais perto dela, mais transparente o pixel fica.
 */

/** Distância de cor até a qual o pixel some por completo, e a partir da qual fica opaco. */
const SOME_ATE = 45;
const OPACO_DESDE = 120;

/** Altera os pixels RGBA no lugar. Exportada para teste (sem canvas). */
export function tirarFundoPixels(px: Uint8ClampedArray, largura: number, altura: number): void {
  const borda = Math.max(1, Math.round(Math.min(largura, altura) * 0.03));
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if (x >= borda && x < largura - borda && y >= borda && y < altura - borda) continue;
      const i = (y * largura + x) * 4;
      if (px[i + 3] < 128) continue; // borda já transparente
      r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
    }
  }
  if (!n) return; // fundo já é transparente
  r /= n; g /= n; b /= n;

  for (let i = 0; i < px.length; i += 4) {
    const d = Math.hypot(px[i] - r, px[i + 1] - g, px[i + 2] - b);
    const fator = Math.min(1, Math.max(0, (d - SOME_ATE) / (OPACO_DESDE - SOME_ATE)));
    px[i + 3] = Math.round(px[i + 3] * fator);
  }
}

/** Recebe a imagem (data URL) e devolve um PNG com fundo transparente, no máximo 700 px. */
export async function tirarFundoCarimbo(dataUrl: string, maximo = 700): Promise<string> {
  const img = await new Promise<HTMLImageElement>((ok, falha) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => falha(new Error('Não foi possível ler a imagem do carimbo'));
    i.src = dataUrl;
  });
  const escala = Math.min(1, maximo / Math.max(img.naturalWidth, img.naturalHeight));
  const largura = Math.max(1, Math.round(img.naturalWidth * escala));
  const altura = Math.max(1, Math.round(img.naturalHeight * escala));
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Navegador sem suporte a canvas');
  ctx.drawImage(img, 0, 0, largura, altura);
  const dados = ctx.getImageData(0, 0, largura, altura);
  tirarFundoPixels(dados.data, largura, altura);
  ctx.putImageData(dados, 0, 0);
  return canvas.toDataURL('image/png');
}
