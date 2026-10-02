// Teste ponta a ponta do leitor de DANFE fora do navegador:
//   1. gera um PDF no layout do DANFE com a jspdf (texto real, não imagem);
//   2. extrai o texto posicionado com o pdf.js (mesma lib usada na tela);
//   3. passa pelo parseDanfe.
// Opcional: `node scripts/danfe-e2e.ts caminho/da/nota.pdf` testa um DANFE real.
import { readFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseDanfe, type TextoPdf } from '../src/lib/danfe.ts';

function gerarDanfe(): Uint8Array {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const txt = (s: string, x: number, y: number, size = 7) => { doc.setFontSize(size); doc.text(s, x, y); };
  txt('DANFE', 260, 60, 12);
  txt('EPI DISTRIBUIDORA LTDA', 40, 60, 9);
  txt('CHAVE DE ACESSO', 330, 90);
  txt('5326 1012 3456 7800 0199 5500 1000 0012 3410 0001 2345', 330, 100, 8);
  txt('CNPJ', 400, 120); txt('12.345.678/0001-99', 400, 130);
  txt('DESTINATÁRIO / REMETENTE', 40, 160);
  txt('CNPJ/CPF', 400, 170); txt('11.222.333/0001-81', 400, 180);
  txt('DATA DA EMISSÃO', 480, 170); txt('30/09/2026', 480, 180);
  txt('DADOS DO PRODUTO / SERVIÇO', 40, 240, 8);
  // Cabeçalho do quadro (V. UNIT. em duas linhas)
  const yc = 255;
  txt('CÓDIGO', 40, yc); txt('DESCRIÇÃO DO PRODUTO / SERVIÇO', 95, yc); txt('NCM/SH', 262, yc);
  txt('CST', 300, yc); txt('CFOP', 322, yc); txt('UN', 352, yc); txt('QUANT', 375, yc);
  txt('V.', 432, yc); txt('UNIT.', 427, yc + 6); txt('V. TOTAL', 470, yc);
  const linha = (y: number, c: string[]) => {
    const xs = [40, 95, 258, 300, 322, 352, 372, 422, 466];
    c.forEach((s, i) => s && txt(s, xs[i], y));
  };
  linha(275, ['BOT-40', 'BOTINA SEGURANCA SPIDER PRO', '64039990', '0102', '5102', 'PAR', '10,0000', '89,9000', '899,00']);
  linha(283, ['', 'CA 48583 N 40', '', '', '', '', '', '', '']);
  linha(295, ['GAND-G', 'GANDOLA GABARDINE AZUL TAM GG', '62034200', '0102', '5102', 'UN', '1.200,0000', '45,5000', '54.600,00']);
  linha(307, ['CAL-M', 'CALCA EM GABARDINE AZUL - M', '62034200', '0102', '5102', 'UN', '25,0000', '39,9000', '997,50']);
  txt('DADOS ADICIONAIS', 40, 700, 8);
  txt('INFORMAÇÕES COMPLEMENTARES  123,0000', 40, 712);
  return new Uint8Array(doc.output('arraybuffer'));
}

async function extrair(dados: Uint8Array): Promise<TextoPdf[][]> {
  const tarefa = getDocument({ data: dados, useSystemFonts: false });
  try {
    const pdf = await tarefa.promise;
    const paginas: TextoPdf[][] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const c = await (await pdf.getPage(n)).getTextContent();
      paginas.push(c.items.flatMap(it => ('str' in it && it.str.trim())
        ? [{ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width }] : []));
    }
    return paginas;
  } finally {
    await tarefa.destroy();
  }
}

const arquivo = process.argv[2];
const dados = arquivo ? new Uint8Array(readFileSync(arquivo)) : gerarDanfe();
const paginas = await extrair(dados);
console.log(`páginas: ${paginas.length}, trechos de texto: ${paginas.flat().length}`);
const nfe = parseDanfe(paginas);
console.log(JSON.stringify({ ...nfe, itens: undefined }, null, 1));
console.table(nfe.itens);
