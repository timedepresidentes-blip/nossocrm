// Gera HTML da proposta no mesmo estilo do OrçaFácil
export type ItemProposta = {
  name: string
  quantity: number
  price: number
}

export type DadosPropostaCRM = {
  clienteNome: string
  clienteCidade?: string | null
  dataEmissao: string
  potenciaKwp?: number | null
  numPaineis?: number | null
  painelW?: number | null
  modeloPainel?: string | null
  modeloInversor?: string | null
  qtdInversores?: number | null
  tipoEstrutura?: string | null
  valorFinal: number
  formaPagamento?: string | null
  condicoesPagamento?: string | null
  prazoEntrega?: string | null
  observacoes?: string | null
  items: ItemProposta[]
  logoUrl?: string | null
  imagemFundoUrl?: string | null
  empresa: string
  diferencial1?: string | null
  diferencial2?: string | null
  diferencial3?: string | null
  diferencial4?: string | null
}

function fmt(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function gerarPropostaHtmlCRM(d: DadosPropostaCRM): string {
  const docNum = `OR-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`

  const imagemHero =
    d.imagemFundoUrl ||
    'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?fm=jpg&q=80&w=1600&auto=format&fit=crop'

  const diferenciais = [d.diferencial1, d.diferencial2, d.diferencial3, d.diferencial4]
    .filter(Boolean)
    .map(
      (txt, i) =>
        `<div class="beneficio"><div class="num">0${i + 1}</div><div class="txt">${txt}</div></div>`
    )
    .join('')

  const hasSolar = d.potenciaKwp && d.potenciaKwp > 0

  const resumoGrid = hasSolar
    ? `
  <div class="secao">
    <div class="secao-titulo">Resumo do Sistema</div>
    <div class="resumo-grid">
      <div class="resumo-card destaque">
        <div class="k">Potência instalada</div>
        <div class="v laranja">${(d.potenciaKwp!).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWp</div>
        <div class="sub">${d.numPaineis ?? '—'} painéis de ${d.painelW ?? '—'}W</div>
      </div>
      <div class="resumo-card">
        <div class="k">Inversor</div>
        <div class="v" style="font-size:18px;">${d.modeloInversor ?? '—'}</div>
        <div class="sub">${d.qtdInversores ?? 1}x unidade${(d.qtdInversores ?? 1) > 1 ? 's' : ''}</div>
      </div>
      <div class="resumo-card">
        <div class="k">Investimento total</div>
        <div class="v laranja">R$ ${fmt(d.valorFinal)}</div>
        ${d.formaPagamento ? `<div style="margin-top:6px;display:inline-block;background:var(--laranja-bg);border:1px solid var(--laranja-claro);border-radius:4px;padding:3px 8px;font-size:12px;font-weight:700;color:var(--laranja-esc);">${d.formaPagamento}</div>` : ''}
      </div>
    </div>
  </div>`
    : ''

  const equipamentosRows = hasSolar
    ? `
        ${d.modeloPainel ? `<tr><td class="nome">Módulos fotovoltaicos</td><td class="spec">${d.painelW}W · ${d.numPaineis} unidades · ${d.modeloPainel}</td></tr>` : ''}
        ${d.modeloInversor ? `<tr><td class="nome">Inversor</td><td class="spec">${d.modeloInversor} · ${d.qtdInversores ?? 1}x</td></tr>` : ''}
        ${d.tipoEstrutura ? `<tr><td class="nome">Estrutura de fixação</td><td class="spec">${d.tipoEstrutura}</td></tr>` : ''}
        <tr><td class="nome">Cabeamento</td><td class="spec">Solar 6mm² · Conectores MC4</td></tr>`
    : ''

  const equipamentosSection =
    hasSolar && equipamentosRows.trim()
      ? `
  <div class="secao">
    <div class="secao-titulo">Equipamentos</div>
    <table class="tabela-tec">
      <thead><tr><th>Componente</th><th>Especificação</th></tr></thead>
      <tbody>${equipamentosRows}</tbody>
    </table>
  </div>`
      : ''

  const itemsRows = d.items
    .map(
      (it) =>
        `<tr>
          <td style="padding:12px 0;border-bottom:1px solid var(--border);font-size:14px;font-weight:600;color:var(--texto);">${it.name}</td>
          <td style="padding:12px 0;border-bottom:1px solid var(--border);font-size:14px;text-align:center;color:var(--texto-sec);">${it.quantity}</td>
          <td style="padding:12px 0;border-bottom:1px solid var(--border);font-size:14px;text-align:right;color:var(--texto-sec);">R$ ${fmt(it.price)}</td>
          <td style="padding:12px 0;border-bottom:1px solid var(--border);font-size:14px;font-weight:700;text-align:right;color:var(--texto);">R$ ${fmt(it.quantity * it.price)}</td>
        </tr>`
    )
    .join('')

  const itemsSection =
    d.items.length > 0
      ? `
  <div class="secao">
    <div class="secao-titulo">Itens do Orçamento</div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:var(--texto-terc);padding:0 0 10px 0;border-bottom:1.5px solid var(--texto);">Descrição</th>
          <th style="text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:var(--texto-terc);padding:0 0 10px 0;border-bottom:1.5px solid var(--texto);width:60px;">Qtd</th>
          <th style="text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:var(--texto-terc);padding:0 0 10px 0;border-bottom:1.5px solid var(--texto);width:120px;">Unit.</th>
          <th style="text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:var(--texto-terc);padding:0 0 10px 0;border-bottom:1.5px solid var(--texto);width:130px;">Total</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>
  </div>`
      : ''

  const investSection = `
  <div class="secao">
    <div class="secao-titulo">Investimento</div>
    <div class="invest-box">
      <div>
        <div class="k">Investimento total</div>
        ${d.formaPagamento ? `<div style="font-size:11px;color:var(--laranja-esc);margin-top:2px;">${d.formaPagamento}</div>` : ''}
      </div>
      <div class="v">R$ ${fmt(d.valorFinal)}</div>
    </div>
    ${
      d.condicoesPagamento
        ? `<div style="background:#FFF7F0;border:1px solid var(--laranja-claro);border-radius:8px;padding:16px 20px;">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--laranja-esc);font-weight:600;margin-bottom:6px;">Condições</div>
            <div style="font-size:16px;font-weight:700;color:var(--texto);">${d.condicoesPagamento}</div>
            <div style="font-size:11px;color:var(--texto-quat);margin-top:3px;">Conforme acordado em contrato</div>
           </div>`
        : ''
    }
    ${
      d.prazoEntrega
        ? `<div style="margin-top:12px;display:flex;align-items:center;gap:10px;padding:12px 16px;background:#F5F5F3;border-radius:6px;">
            <span style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--texto-terc);font-weight:600;">Prazo de entrega</span>
            <span style="font-size:14px;font-weight:700;color:var(--texto);">${d.prazoEntrega}</span>
           </div>`
        : ''
    }
  </div>`

  const observacoesSection = d.observacoes
    ? `
  <div class="secao">
    <div class="secao-titulo">Observações</div>
    <p style="font-size:14px;color:var(--texto-sec);line-height:1.7;">${d.observacoes}</p>
  </div>`
    : ''

  const diferenciaisSection = diferenciais
    ? `
  <div class="secao">
    <div class="secao-titulo">Por que nos escolher</div>
    <div class="beneficios-grid">${diferenciais}</div>
  </div>`
    : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Proposta Solar · ${d.clienteNome}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Archivo+Narrow:wght@500;600;700&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<style>
  :root{
    --bg:#FAFAF8;--bg-card:#FFFFFF;--border:#E5E2DC;
    --texto:#171717;--texto-sec:#4A4A48;--texto-terc:#6B6B68;--texto-quat:#9A9A96;
    --laranja:#EA6A1E;--laranja-esc:#B15A1E;--laranja-claro:#F6D9C2;--laranja-bg:#FDF3EA;
  }
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Archivo',sans-serif;background:#d8d5cd;padding:0;}

  .action-bar{
    position:sticky;top:0;z-index:100;
    background:rgba(23,23,23,0.92);backdrop-filter:blur(6px);
    display:flex;align-items:center;justify-content:space-between;
    padding:10px 20px;
  }
  .action-bar button{
    display:flex;align-items:center;gap:6px;
    border:none;cursor:pointer;font-family:'Archivo',sans-serif;font-size:13px;font-weight:600;
    padding:8px 16px;border-radius:6px;transition:opacity .15s;
  }
  .action-bar button:hover{opacity:.85;}
  .btn-fechar{background:rgba(255,255,255,0.12);color:#fff;}
  .btn-imprimir{background:#16a34a;color:#fff;}

  .doc{max-width:820px;margin:0 auto;background:var(--bg);color:var(--texto);box-shadow:0 24px 70px rgba(0,0,0,0.25);}

  .hero{position:relative;height:300px;overflow:hidden;}
  .hero-bg-img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:center 40%;display:block;}
  .hero-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.25) 0%,rgba(0,0,0,0.05) 45%,rgba(250,250,248,0.05) 80%,rgba(250,250,248,0.97) 100%);}
  .doc-meta{position:absolute;top:20px;right:30px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:10px;color:rgba(255,255,255,0.85);text-shadow:0 1px 3px rgba(0,0,0,0.5);}
  .doc-meta b{color:#fff;}

  .titulo-principal{padding:22px 40px 0 40px;}
  .titulo-principal .eyebrow{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--laranja);margin-bottom:8px;}
  .titulo-principal h1{font-family:'Archivo Narrow',sans-serif;font-weight:700;font-size:28px;color:var(--texto);}
  .cliente-info{display:flex;gap:36px;padding:14px 40px 26px 40px;}
  .cliente-info .item .k{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--texto-quat);margin-bottom:3px;}
  .cliente-info .item .v{font-size:14px;font-weight:600;color:var(--texto);}

  .secao{padding:26px 40px;border-top:1px solid var(--border);}
  .secao-titulo{font-family:'Archivo Narrow',sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--laranja-esc);margin-bottom:18px;}

  .resumo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);border:1px solid var(--border);}
  .resumo-card{background:var(--bg-card);padding:18px 16px;}
  .resumo-card .k{font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:var(--texto-terc);margin-bottom:6px;font-weight:500;}
  .resumo-card .v{font-family:'Archivo Narrow',sans-serif;font-size:26px;font-weight:700;color:var(--texto);line-height:1.15;}
  .resumo-card .v.laranja{color:var(--laranja-esc);}
  .resumo-card .sub{font-size:11px;color:var(--texto-quat);margin-top:3px;}
  .resumo-card.destaque{background:#FFF7F0;border-left:4px solid var(--laranja);}
  .resumo-card.destaque .k{color:var(--laranja-esc);}
  .resumo-card.destaque .v{color:var(--laranja-esc);font-size:30px;}

  .tabela-tec{width:100%;border-collapse:collapse;}
  .tabela-tec th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:var(--texto-terc);padding:0 0 10px 0;border-bottom:1.5px solid var(--texto);}
  .tabela-tec td{padding:12px 0;border-bottom:1px solid var(--border);font-size:14px;vertical-align:top;}
  .tabela-tec td.nome{font-weight:600;color:var(--texto);width:230px;padding-right:14px;}
  .tabela-tec td.spec{color:var(--texto-sec);font-size:13px;}
  .tabela-tec tr:last-child td{border-bottom:none;}

  .invest-box{background:var(--laranja-bg);border:2px solid var(--laranja-claro);border-radius:8px;padding:20px 24px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;}
  .invest-box .k{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--laranja-esc);font-weight:600;}
  .invest-box .v{font-family:'Archivo Narrow',sans-serif;font-size:34px;font-weight:700;color:var(--laranja-esc);}

  .beneficios-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;}
  .beneficio{padding:14px 0;border-top:1.5px solid var(--texto);}
  .beneficio .num{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--laranja-esc);margin-bottom:5px;}
  .beneficio .txt{font-size:14px;color:var(--texto-sec);line-height:1.5;}

  .footer{padding:22px 40px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;}
  .footer .info{font-size:12px;color:var(--texto-terc);line-height:1.6;}

  @media print{
    @page{margin:0;size:A4 portrait;}
    *,*::before,*::after{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}
    html,body{margin:0 !important;padding:0 !important;background:white !important;}
    .action-bar{display:none !important;}
    .doc-wrapper{padding:0 !important;}
    .doc{box-shadow:none !important;max-width:100% !important;}
    .hero{height:300px !important;overflow:hidden !important;}
    .secao{page-break-inside:avoid;break-inside:avoid;}
  }
</style>
</head>
<body>

<div class="action-bar">
  <button class="btn-fechar" onclick="window.close()">← Fechar e voltar</button>
  <div style="font-family:monospace;font-size:10px;color:rgba(255,255,255,0.5);">Nº ${docNum} · ${d.dataEmissao}</div>
  <button class="btn-imprimir" id="btnPdf" onclick="gerarPDF()">⬇ Salvar PDF</button>
</div>

<div class="doc-wrapper" style="padding:32px 16px;">
<div class="doc">

  <div class="hero">
    <img class="hero-bg-img" crossorigin="anonymous" src="${imagemHero}" alt="Instalação solar" onerror="this.style.display='none'">
    <div class="hero-overlay"></div>
    ${
      d.logoUrl
        ? `<img crossorigin="anonymous" src="${d.logoUrl}" style="position:absolute;top:20px;left:30px;height:70px;object-fit:contain;max-width:280px;" alt="Logo" onerror="this.style.display='none'">`
        : `<span style="position:absolute;top:20px;left:30px;font-family:monospace;font-size:11px;letter-spacing:2px;color:rgba(255,255,255,0.9);text-transform:uppercase;">PROPOSTA SOLAR</span>`
    }
    <div class="doc-meta">Nº <b>${docNum}</b><br>Emissão: ${d.dataEmissao}<br>Validade: 3 dias</div>
  </div>

  <div class="titulo-principal">
    <div class="eyebrow">Proposta Comercial · Energia Solar Fotovoltaica</div>
    <h1>Sistema de Energia Solar Fotovoltaica</h1>
  </div>
  <div class="cliente-info">
    <div class="item"><div class="k">Cliente</div><div class="v">${d.clienteNome}</div></div>
    ${d.clienteCidade ? `<div class="item"><div class="k">Local</div><div class="v">${d.clienteCidade}</div></div>` : ''}
    <div class="item"><div class="k">Data</div><div class="v">${d.dataEmissao}</div></div>
    <div class="item"><div class="k">Empresa</div><div class="v">${d.empresa}</div></div>
  </div>

  ${resumoGrid}
  ${equipamentosSection}
  ${itemsSection}
  ${investSection}
  ${observacoesSection}
  ${diferenciaisSection}

  <div class="secao">
    <div class="secao-titulo">Condições Gerais</div>
    <ul style="list-style:none;display:flex;flex-direction:column;gap:10px;">
      <li style="font-size:13px;color:var(--texto-sec);padding-left:16px;position:relative;"><span style="position:absolute;left:0;color:var(--laranja-esc);font-weight:700;">—</span> Instalação, homologação e ligação da rede inclusas</li>
      <li style="font-size:13px;color:var(--texto-sec);padding-left:16px;position:relative;"><span style="position:absolute;left:0;color:var(--laranja-esc);font-weight:700;">—</span> Proposta válida por 3 dias a partir da emissão</li>
      <li style="font-size:13px;color:var(--texto-sec);padding-left:16px;position:relative;"><span style="position:absolute;left:0;color:var(--laranja-esc);font-weight:700;">—</span> Garantia de 25 anos de performance dos módulos fotovoltaicos</li>
    </ul>
  </div>

  <div class="footer">
    <div class="info">${d.empresa}<br>Proposta Nº ${docNum} · Emitida em ${d.dataEmissao}</div>
    <div class="info" style="text-align:right;">Válida por 3 dias<br>Sujeita a vistoria técnica</div>
  </div>

</div>
</div>

<script>
async function gerarPDF() {
  var btn = document.getElementById('btnPdf');
  var bar = document.querySelector('.action-bar');
  if (btn) { btn.textContent = '⏳ Gerando…'; btn.disabled = true; }
  if (bar) bar.style.visibility = 'hidden';

  var docEl = document.querySelector('.doc');
  docEl.style.width = '820px'; docEl.style.maxWidth = '820px'; docEl.style.minWidth = '820px';
  void docEl.offsetHeight;

  try {
    await document.fonts.ready;
    var { jsPDF } = window.jspdf;
    var pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    var pdfW = pdf.internal.pageSize.getWidth();
    var pdfH = pdf.internal.pageSize.getHeight();
    var pxPerMm = (820 * 2) / pdfW;

    var sectionEls = Array.from(docEl.querySelectorAll('.hero, .titulo-principal, .cliente-info, .secao, .footer'));
    var secCanvases = [];
    for (var s = 0; s < sectionEls.length; s++) {
      var sc = await html2canvas(sectionEls[s], {
        scale: 2, useCORS: true, allowTaint: false,
        backgroundColor: '#FAFAF8', logging: false,
        width: 820, windowWidth: 820, scrollX: 0, scrollY: 0,
      });
      secCanvases.push(sc);
    }

    var pageGroups = [], curGroup = [], curH = 0;
    for (var i = 0; i < secCanvases.length; i++) {
      var secHmm = secCanvases[i].height / pxPerMm;
      if (curGroup.length > 0 && curH + secHmm > pdfH) {
        pageGroups.push(curGroup); curGroup = [i]; curH = secHmm;
      } else { curGroup.push(i); curH += secHmm; }
    }
    if (curGroup.length > 0) pageGroups.push(curGroup);

    for (var p = 0; p < pageGroups.length; p++) {
      var grp = pageGroups[p];
      var totalPx = 0;
      for (var g = 0; g < grp.length; g++) totalPx += secCanvases[grp[g]].height;
      var pageCanvas = document.createElement('canvas');
      pageCanvas.width = secCanvases[grp[0]].width; pageCanvas.height = totalPx;
      var ctx = pageCanvas.getContext('2d'); var yOff = 0;
      for (var g = 0; g < grp.length; g++) { ctx.drawImage(secCanvases[grp[g]], 0, yOff); yOff += secCanvases[grp[g]].height; }
      if (p > 0) pdf.addPage();
      pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pdfW, totalPx / pxPerMm);
    }
    pdf.save('Proposta-Solar-${d.clienteNome.replace(/[^a-zA-Z0-9]/g, '-')}.pdf');
  } catch(err) {
    alert('Erro ao gerar PDF: ' + (err.message || err));
  } finally {
    docEl.style.width = ''; docEl.style.maxWidth = ''; docEl.style.minWidth = '';
    if (btn) { btn.textContent = '⬇ Salvar PDF'; btn.disabled = false; }
    if (bar) bar.style.visibility = 'visible';
  }
}
</script>
</body>
</html>`
}
