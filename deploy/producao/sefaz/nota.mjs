// Leitura dos documentos que a SEFAZ devolve no Distribuição DFe (sem dependências).
// Os XMLs da NF-e são gerados por sistema, sem CDATA nem comentários: basta achar as tags.

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const texto = (s) => s == null ? null
  : s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) =>
      e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
        : ENTIDADES[e] ?? m).trim();

/** Conteúdo da primeira <nome>...</nome> (com ou sem prefixo de namespace). */
export function tag(xml, nome) {
  const m = xml?.match(new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`));
  return m ? m[1] : null;
}
const valor = (xml, nome) => texto(tag(xml, nome));

/** Todos os blocos <nome ...>...</nome>, com os atributos. */
export function blocos(xml, nome) {
  const re = new RegExp(`<(?:\\w+:)?${nome}(\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`, 'g');
  return [...(xml ?? '').matchAll(re)].map(m => ({ attrs: m[1] ?? '', corpo: m[2] }));
}
const attr = (attrs, nome) => attrs.match(new RegExp(`${nome}="([^"]*)"`))?.[1] ?? null;

/** Resposta do nfeDistDFeInteresse: status, NSUs e os documentos (ainda compactados). */
export function lerRetornoDist(xml) {
  const ret = tag(xml, 'retDistDFeInt');
  if (!ret) throw new Error('Resposta da SEFAZ sem retDistDFeInt: ' + xml.slice(0, 300));
  return {
    cStat: valor(ret, 'cStat'),
    xMotivo: valor(ret, 'xMotivo'),
    ultNSU: valor(ret, 'ultNSU'),
    maxNSU: valor(ret, 'maxNSU'),
    docs: blocos(ret, 'docZip').map(b => ({ nsu: attr(b.attrs, 'NSU'), schema: attr(b.attrs, 'schema') ?? '', base64: b.corpo.trim() })),
  };
}

/** resNFe: só o cabeçalho (vem antes da Ciência da Operação). cSitNFe 3 = cancelada. */
export function lerResumo(xml, cnpjDestinatario) {
  return {
    chave: valor(xml, 'chNFe'),
    cnpj_destinatario: cnpjDestinatario,
    emitente_cnpj: valor(xml, 'CNPJ') ?? valor(xml, 'CPF'),
    emitente_nome: valor(xml, 'xNome'),
    numero: null,
    emissao: valor(xml, 'dhEmi'),
    valor_total: valor(xml, 'vNF'),
    situacao: 'resumo',
    cancelada: valor(xml, 'cSitNFe') === '3',
  };
}

/** procNFe (nota completa, com os itens). */
export function lerNotaCompleta(xml) {
  const inf = tag(xml, 'infNFe') ?? '';
  const id = xml.match(/<(?:\w+:)?infNFe[^>]*\sId="NFe(\d{44})"/)?.[1];
  const ide = tag(inf, 'ide') ?? '';
  const emit = tag(inf, 'emit') ?? '';
  const dest = tag(inf, 'dest') ?? '';
  const itens = blocos(inf, 'det').map(d => {
    const p = tag(d.corpo, 'prod') ?? '';
    const ean = valor(p, 'cEAN');
    return {
      n_item: Number(attr(d.attrs, 'nItem')),
      codigo: valor(p, 'cProd'),
      ean: ean && ean !== 'SEM GTIN' ? ean : null,
      descricao: valor(p, 'xProd'),
      ncm: valor(p, 'NCM'),
      unidade: valor(p, 'uCom'),
      quantidade: valor(p, 'qCom'),
      valor_unit: valor(p, 'vUnCom'),
      valor_total: valor(p, 'vProd'),
    };
  });
  return {
    chave: id ?? valor(xml, 'chNFe'),
    emitente_cnpj: valor(emit, 'CNPJ') ?? valor(emit, 'CPF'),
    emitente_nome: valor(emit, 'xNome'),
    destinatario_cnpj: valor(dest, 'CNPJ') ?? valor(dest, 'CPF'),
    numero: valor(ide, 'nNF'),
    emissao: valor(ide, 'dhEmi') ?? valor(ide, 'dEmi'),
    valor_total: valor(tag(inf, 'ICMSTot') ?? inf, 'vNF'),
    situacao: 'completa',
    itens,
  };
}

/** resEvento / procEventoNFe: só interessa o cancelamento (110111). */
export function lerEvento(xml) {
  return { chave: valor(xml, 'chNFe'), tpEvento: valor(xml, 'tpEvento') };
}

/** Resposta do envio de eventos: cStat de cada nota. 135/136 = registrado, 573 = já tinha. */
export function lerRetornoEvento(xml) {
  const lote = { cStat: valor(xml, 'cStat'), xMotivo: valor(xml, 'xMotivo') };
  const porChave = Object.fromEntries(blocos(xml, 'retEvento').map(b => {
    const inf = tag(b.corpo, 'infEvento') ?? b.corpo;
    return [valor(inf, 'chNFe'), { cStat: valor(inf, 'cStat'), xMotivo: valor(inf, 'xMotivo') }];
  }));
  return { lote, porChave };
}
