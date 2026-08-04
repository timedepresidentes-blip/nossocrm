export interface FabricanteModulo {
  nome: string;
  garantiaProduto: string;
  garantiaDesempenho: string;
  linkGarantia?: string;
}

export interface FabricanteInversor {
  nome: string;
  tipo: 'string' | 'micro' | 'hibrido';
  garantia: string;
  linkGarantia?: string;
}

export const MODULOS: FabricanteModulo[] = [
  { nome: 'Canadian Solar',  garantiaProduto: '12 anos', garantiaDesempenho: '25 anos (80% potência linear)', linkGarantia: 'https://support.csisolar.com/hc/pt-br' },
  { nome: 'JA Solar',        garantiaProduto: '12 anos', garantiaDesempenho: '25 anos (80% potência linear)', linkGarantia: 'https://jasolarbrasil.com.br/?page_id=284' },
  { nome: 'Trina Solar',     garantiaProduto: '12 anos', garantiaDesempenho: '25 anos (80% potência linear)', linkGarantia: 'https://www.trinasolar.com/us/resources/downloads' },
  { nome: 'Longi',           garantiaProduto: '12 anos', garantiaDesempenho: '30 anos (80% potência linear)', linkGarantia: 'https://www.longi.com/br/download/?categoryId=354' },
  { nome: 'Risen',           garantiaProduto: '12 anos', garantiaDesempenho: '25 anos (80% potência linear)', linkGarantia: 'https://br.risen.com/serve/download?one_level=6' },
  { nome: 'Jinko',           garantiaProduto: '12 anos', garantiaDesempenho: '25 anos (80% potência linear)', linkGarantia: 'https://www.jinkosolar.com/pt/site/dwproductzb' },
  { nome: 'DAH Solar',       garantiaProduto: '12 anos', garantiaDesempenho: '25 anos (80% potência linear)', linkGarantia: 'https://en.dahsolar.com/downloadList/18.html' },
  { nome: 'Astronergy',      garantiaProduto: '12 anos', garantiaDesempenho: '25 anos (80% potência linear)', linkGarantia: 'https://www.astronergy.com.cn/br/service/index/cid/10005.html#down' },
  { nome: 'Huasun',          garantiaProduto: '12 anos', garantiaDesempenho: '25 anos (80% potência linear)', linkGarantia: 'https://www.huasunsolar.com/pdfView/limited-warranty' },
  { nome: 'Sunx',            garantiaProduto: '12 anos', garantiaDesempenho: '25 anos (80% potência linear)', linkGarantia: 'https://www.huasunsolar.com/pdfView/limited-warranty' },
  { nome: 'Honor / Taoistic',garantiaProduto: '12 anos', garantiaDesempenho: '25 anos (80% potência linear)', linkGarantia: 'https://www.honorsolar.com.br/arquivos/downloads/fb592ebdaffa17c88029a2826541b072-arquivo.pdf' },
  { nome: 'DMEGC',           garantiaProduto: '12 anos', garantiaDesempenho: '25 anos (80% potência linear)', linkGarantia: 'https://dmegcsolar.com.br/download-garantia/' },
  { nome: 'Helius',          garantiaProduto: '10 anos', garantiaDesempenho: '25 anos (80% potência linear)', linkGarantia: 'https://www.he-solar.com/docs/' },
  { nome: 'Leapton',         garantiaProduto: '12 anos', garantiaDesempenho: '25 anos (80% potência linear)', linkGarantia: 'http://www.leaptonenergy.com.br/download/warranty/index.html' },
  { nome: 'RenePV',          garantiaProduto: '10 anos', garantiaDesempenho: '25 anos (80% potência linear)', linkGarantia: 'https://www.renepv.com/list/65.html' },
  { nome: 'Osda',            garantiaProduto: '10 anos', garantiaDesempenho: '25 anos (80% potência linear)', linkGarantia: 'https://www.osdasol.com/874/' },
  { nome: 'Talesun',         garantiaProduto: '10 anos', garantiaDesempenho: '25 anos (80% potência linear)', linkGarantia: 'https://www.talesun.com/en/download/quality/' },
  { nome: 'Gokin',           garantiaProduto: '10 anos', garantiaDesempenho: '25 anos (80% potência linear)', linkGarantia: 'https://www.gokinsolar.com/en/download-center/Warranty-Certificates' },
  { nome: 'MAXEON',          garantiaProduto: '25 anos', garantiaDesempenho: '40 anos (90% → 88,25% potência)', linkGarantia: 'https://drive.google.com/drive/folders/1gJrrddiOak4qLQO_jFd9U6OoLdTvQTC5' },
  { nome: 'TCL',             garantiaProduto: '12 anos', garantiaDesempenho: '25 anos (80% potência linear)', linkGarantia: 'https://www.tclsolar.com/resources' },
  { nome: 'RENESOLA',        garantiaProduto: '10 anos', garantiaDesempenho: '25 anos (80% potência linear)', linkGarantia: 'https://pt.renesola-energy.com/download/7100909.html' },
  { nome: 'TSUN',            garantiaProduto: '12 anos', garantiaDesempenho: '25 anos (80% potência linear)', linkGarantia: 'https://tsunpower.com/pos-venda/' },
  { nome: 'ZN Shine',        garantiaProduto: '10 anos', garantiaDesempenho: '25 anos (80% potência linear)' },
  { nome: 'Sunergy',         garantiaProduto: '10 anos', garantiaDesempenho: '25 anos (80% potência linear)' },
  { nome: 'Sunova',          garantiaProduto: '10 anos', garantiaDesempenho: '25 anos (80% potência linear)' },
  { nome: 'Ronma',           garantiaProduto: '10 anos', garantiaDesempenho: '25 anos (80% potência linear)' },
];

export const INVERSORES: FabricanteInversor[] = [
  { nome: 'Deye',     tipo: 'string',  garantia: '5 anos',  linkGarantia: 'https://deyeinversoresbr-my.sharepoint.com/:f:/g/personal/caio_deyeinversores_com_br/EkCYwgctN3NKva0cGlQIkx4B_PjkogOTzqiVdr-IgcEWZg?e=4Ht5MB' },
  { nome: 'Solis',    tipo: 'string',  garantia: '5 anos',  linkGarantia: 'https://www.solisinverters.com/br/productwarranty.html' },
  { nome: 'Huawei',   tipo: 'string',  garantia: '10 anos', linkGarantia: 'https://drive.google.com/drive/folders/1v2mYBuou4B55Ix5z2EPWoIegwwF6JuLC' },
  { nome: 'Sungrow',  tipo: 'string',  garantia: '5 anos',  linkGarantia: 'https://sungrowacademy.com.br/suporte-garantia/' },
  { nome: 'Growatt',  tipo: 'string',  garantia: '5 anos',  linkGarantia: 'https://drive.google.com/drive/folders/1UnMdOlMySA1BNbP6xJSLi4Hduq8cw8rs' },
  { nome: 'Fox ESS',  tipo: 'hibrido', garantia: '5 anos',  linkGarantia: 'https://drive.google.com/drive/folders/1k_d8mn_P9nhZAfT4tVtLp7kDnGak91tC' },
  { nome: 'Sofar',    tipo: 'string',  garantia: '5 anos',  linkGarantia: 'https://drive.google.com/drive/folders/1PDjiqGeC9mPFezEm35NyPitnB-ApHumX' },
  { nome: 'Canadian', tipo: 'string',  garantia: '5 anos',  linkGarantia: 'https://support.csisolar.com/hc/pt-br' },
  { nome: 'Nep',      tipo: 'micro',   garantia: '12 anos', linkGarantia: 'https://drive.google.com/drive/folders/12nhubAdHeHRBpb5OICON6xCTafAmvFHc' },
  { nome: 'Auxsol',   tipo: 'micro',   garantia: '12 anos', linkGarantia: 'https://drive.google.com/drive/folders/1Ke7mvkY-U4wRUrrGjRjT0RXEZUZJyX4M' },
  { nome: 'Hoymiles', tipo: 'micro',   garantia: '12 anos', linkGarantia: 'https://drive.google.com/file/d/11skVBzG7_8juYQlKQ8MIkouBCFmGXmaY/view' },
  { nome: 'Enphase',  tipo: 'micro',   garantia: '25 anos', linkGarantia: 'https://enphase.com/pt-br/warranty/brazil' },
];

export const TIPOS_ESTRUTURA = [
  'Cerâmica colonial',
  'Metálica trapezoidal',
  'Fibrocimento',
  'Laje / Flat',
  'Solo (ground mount)',
  'Metálica kalha',
];

export function getModulo(nome: string): FabricanteModulo | undefined {
  return MODULOS.find(m => m.nome === nome);
}

export function getInversor(nome: string): FabricanteInversor | undefined {
  return INVERSORES.find(i => i.nome === nome);
}

// Palavras-chave para detectar fabricante a partir de texto livre (modelo digitado ou extraído de PDF)
const MODULO_KEYWORDS: Array<{ nome: string; kw: string[] }> = [
  { nome: 'Canadian Solar',   kw: ['canadian solar', 'canadian', 'csi-', 'csi solar'] },
  { nome: 'JA Solar',         kw: ['ja solar', 'jasolar', 'jam5', 'jam6', 'jam ', 'jam-'] },
  { nome: 'Trina Solar',      kw: ['trina', 'tsm-', 'tsm '] },
  { nome: 'Longi',            kw: ['longi', 'lrx', 'lrh-'] },
  { nome: 'Risen',            kw: ['risen', 'rsm-', 'rsm '] },
  { nome: 'Jinko',            kw: ['jinko', 'jkm-', 'jkm '] },
  { nome: 'DAH Solar',        kw: ['dah solar', 'dah-', 'dhm-', 'dhm '] },
  { nome: 'Astronergy',       kw: ['astronergy', 'chsm-', 'chsm ', 'cstm'] },
  { nome: 'Huasun',           kw: ['huasun', 'hun-'] },
  { nome: 'Sunx',             kw: ['sunx'] },
  { nome: 'Honor / Taoistic', kw: ['honor solar', 'taoistic'] },
  { nome: 'DMEGC',            kw: ['dmegc', 'dgm-'] },
  { nome: 'Helius',           kw: ['helius', 'he-solar'] },
  { nome: 'Leapton',          kw: ['leapton', 'lpe-'] },
  { nome: 'RenePV',           kw: ['renepv'] },
  { nome: 'Osda',             kw: ['osda'] },
  { nome: 'Talesun',          kw: ['talesun', 'tes-'] },
  { nome: 'Gokin',            kw: ['gokin'] },
  { nome: 'MAXEON',           kw: ['maxeon', 'sunpower'] },
  { nome: 'TCL',              kw: ['tcl solar'] },
  { nome: 'RENESOLA',         kw: ['renesola'] },
  { nome: 'TSUN',             kw: ['tsun'] },
  { nome: 'ZN Shine',         kw: ['znshine', 'zn shine', 'znsh'] },
  { nome: 'Sunergy',          kw: ['sunergy'] },
  { nome: 'Sunova',           kw: ['sunova', 'sna-'] },
  { nome: 'Ronma',            kw: ['ronma'] },
];

const INVERSOR_KEYWORDS: Array<{ nome: string; kw: string[] }> = [
  { nome: 'Enphase',  kw: ['enphase', 'iq7', 'iq8'] },
  { nome: 'Nep',      kw: ['nep micro', 'bdt'] },
  { nome: 'Auxsol',   kw: ['auxsol'] },
  { nome: 'Hoymiles', kw: ['hoymiles', 'hm-', 'hms-', 'hmd-'] },
  { nome: 'Huawei',   kw: ['huawei', 'sun2000'] },
  { nome: 'Fox ESS',  kw: ['fox ess', 'foxess', 'fox-ess'] },
  { nome: 'Sungrow',  kw: ['sungrow', 'sg5k', 'sg6k', 'sg8k', 'sg10k', 'sg12k', 'sg15k', 'sg20k', 'sg25k', 'sg30k'] },
  { nome: 'Sofar',    kw: ['sofar', 'ktlx', 'ktl-x', 'khd'] },
  { nome: 'Deye',     kw: ['deye', 'sun-'] },
  { nome: 'Solis',    kw: ['solis', 'rhi-', 'rkh-', 'rln-'] },
  { nome: 'Growatt',  kw: ['growatt', 'spf ', 'sph ', 'min tl'] },
  { nome: 'Canadian', kw: ['canadian inversor', 'csi inversor'] },
];

/** Detecta fabricante de módulo a partir de texto livre (nome do modelo, descrição de PDF etc.) */
export function detectModulo(texto: string): FabricanteModulo | undefined {
  if (!texto) return undefined;
  const t = texto.toLowerCase();
  for (const { nome, kw } of MODULO_KEYWORDS) {
    if (kw.some(k => t.includes(k))) {
      return MODULOS.find(m => m.nome === nome);
    }
  }
  return undefined;
}

/** Detecta fabricante de inversor a partir de texto livre */
export function detectInversor(texto: string): FabricanteInversor | undefined {
  if (!texto) return undefined;
  const t = texto.toLowerCase();
  for (const { nome, kw } of INVERSOR_KEYWORDS) {
    if (kw.some(k => t.includes(k))) {
      return INVERSORES.find(i => i.nome === nome);
    }
  }
  return undefined;
}

export function gerarNumContrato(): string {
  if (typeof window === 'undefined') return '';
  const ano = new Date().getFullYear();
  const chave = `aureon_contrato_seq_${ano}`;
  const seq = parseInt(localStorage.getItem(chave) || '0') + 1;
  localStorage.setItem(chave, String(seq));
  return `${ano}-${String(seq).padStart(3, '0')}`;
}
