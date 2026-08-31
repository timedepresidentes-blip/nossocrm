export type ItemProposta = {
  name: string
  quantity: number
  price: number
}

export type PropostaTema = 'ambar' | 'esmeralda' | 'safira'

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
  economiaAnualEstimada?: number | null
  contaMensalAtual?: number | null
  paybackAnos?: number | null
  geracaoMensalKwh?: number | null
  clientesAtendidos?: number | null
  validadeDias?: number | null
  tema?: PropostaTema | null
}

function fmt(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtInt(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

function addDays(dateStr: string, days: number): string {
  const parts = dateStr.split('/')
  if (parts.length === 3) {
    const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))
    d.setDate(d.getDate() + days)
    return d.toLocaleDateString('pt-BR')
  }
  return dateStr
}

export function gerarPropostaHtmlCRM(d: DadosPropostaCRM): string {
  const docNum = `OR-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
  const validadeDias = d.validadeDias ?? 7
  const validadeAte = addDays(d.dataEmissao, validadeDias)
  const hasSolar = !!(d.potenciaKwp && d.potenciaKwp > 0)
  const economia25 = d.economiaAnualEstimada ? d.economiaAnualEstimada * 25 : null
  const multX = economia25 && d.valorFinal > 0 ? (economia25 / d.valorFinal).toFixed(1) : null

  const imagemHero =
    d.imagemFundoUrl ||
    'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?fm=jpg&q=80&w=1400&auto=format&fit=crop'

  // ── Ícones SVG ───────────────────────────────────────────────────
  const icoSun = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`
  const icoCheck = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
  const icoPanel = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`
  const icoWave = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`
  const icoHome = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`
  const icoCable = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`

  // ── Seção: impacto econômico ─────────────────────────────────────
  const hasStats = !!(d.economiaAnualEstimada || d.paybackAnos || d.geracaoMensalKwh)
  const statsBlock = hasStats ? `
  <section class="s-stats">
    <div class="s-inner">
      <p class="s-eyebrow">O QUE VOCÊ PASSA A TER</p>
      <div class="stats-row">
        ${d.economiaAnualEstimada ? `
        <div class="stat-item stat-main">
          <span class="stat-num">R$&thinsp;${fmtInt(d.economiaAnualEstimada)}</span>
          <span class="stat-label">economizados por ano</span>
          ${economia25 ? `<span class="stat-note">R$ ${fmtInt(economia25)} em 25 anos${multX ? ` — ${multX}× o investimento` : ''}</span>` : ''}
        </div>` : ''}
        ${d.paybackAnos ? `
        <div class="stat-item">
          <span class="stat-num">${d.paybackAnos}<span class="stat-unit">anos</span></span>
          <span class="stat-label">para recuperar o investimento</span>
          <span class="stat-note">depois, só lucro por mais de 20 anos</span>
        </div>` : ''}
        ${d.geracaoMensalKwh ? `
        <div class="stat-item">
          <span class="stat-num">${fmtInt(d.geracaoMensalKwh)}<span class="stat-unit">kWh</span></span>
          <span class="stat-label">gerados por mês</span>
          ${d.contaMensalAtual ? `<span class="stat-note">sua conta atual: R$ ${fmtInt(d.contaMensalAtual)}/mês</span>` : ''}
        </div>` : ''}
      </div>
      ${d.clientesAtendidos ? `
      <p class="social-proof">${icoSun}&ensp;<strong>${fmtInt(d.clientesAtendidos)}+</strong> clientes já gerando energia limpa com a ${d.empresa}</p>` : ''}
    </div>
  </section>` : ''

  // ── Seção: sistema ───────────────────────────────────────────────
  const sistemaRows = hasSolar ? [
    d.modeloPainel   ? { ico: icoPanel, label: 'Módulos fotovoltaicos',  val: `${d.numPaineis} un. de ${d.painelW}W&ensp;·&ensp;${d.modeloPainel}` } : null,
    d.modeloInversor ? { ico: icoWave,  label: 'Inversor',               val: `${d.modeloInversor}&ensp;·&ensp;${d.qtdInversores ?? 1} unidade${(d.qtdInversores ?? 1) > 1 ? 's' : ''}` } : null,
    d.tipoEstrutura  ? { ico: icoHome,  label: 'Estrutura de fixação',   val: d.tipoEstrutura } : null,
    { ico: icoCable, label: 'Cabeamento', val: 'Solar 6mm² com conectores MC4 certificados' },
  ].filter(Boolean) : []

  const sistemaBlock = hasSolar ? `
  <section class="s-sistema s-inner">
    <p class="s-eyebrow">SISTEMA DIMENSIONADO</p>
    <div class="sistema-hero">
      <div class="sist-kwp">
        <span class="sist-num">${(d.potenciaKwp!).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
        <span class="sist-kwp-label">kWp instalados</span>
      </div>
      <div class="sist-sub-info">
        <span>${d.numPaineis} painéis de ${d.painelW}W</span>
        ${d.clienteCidade ? `<span>${d.clienteCidade}</span>` : ''}
      </div>
    </div>
    <div class="equip-table">
      ${sistemaRows.map(r => `
      <div class="equip-row">
        <span class="equip-ico">${r!.ico}</span>
        <span class="equip-label">${r!.label}</span>
        <span class="equip-val">${r!.val}</span>
      </div>`).join('')}
    </div>
  </section>` : ''

  // ── Seção: itens ─────────────────────────────────────────────────
  const itemsBlock = d.items.length > 0 ? `
  <section class="s-items s-inner">
    <p class="s-eyebrow">ITENS DO ORÇAMENTO</p>
    <table class="itens-table">
      <thead>
        <tr>
          <th class="col-desc">Descrição</th>
          <th class="col-qtd">Qtd</th>
          <th class="col-unit">Unitário</th>
          <th class="col-tot">Total</th>
        </tr>
      </thead>
      <tbody>
        ${d.items.map(it => `
        <tr>
          <td class="td-desc">${it.name}</td>
          <td class="td-qtd">${it.quantity}</td>
          <td class="td-num">R$&thinsp;${fmt(it.price)}</td>
          <td class="td-num td-bold">R$&thinsp;${fmt(it.quantity * it.price)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </section>` : ''

  // ── Seção: investimento ──────────────────────────────────────────
  const investBlock = `
  <section class="s-invest">
    <div class="s-inner">
      <p class="s-eyebrow" style="color:rgba(255,255,255,0.45)">SEU INVESTIMENTO</p>
      <div class="invest-valor">R$&thinsp;${fmt(d.valorFinal)}</div>
      ${d.formaPagamento ? `<p class="invest-forma">${d.formaPagamento}</p>` : ''}
      <div class="invest-meta">
        ${d.condicoesPagamento ? `
        <div class="imeta-card">
          <p class="imeta-label">Condições</p>
          <p class="imeta-val">${d.condicoesPagamento}</p>
        </div>` : ''}
        ${d.prazoEntrega ? `
        <div class="imeta-card">
          <p class="imeta-label">Prazo de entrega</p>
          <p class="imeta-val">${d.prazoEntrega}</p>
        </div>` : ''}
        <div class="imeta-card">
          <p class="imeta-label">Validade da proposta</p>
          <p class="imeta-val">${validadeAte}</p>
        </div>
      </div>
    </div>
  </section>`

  // ── Seção: observações ───────────────────────────────────────────
  const obsBlock = d.observacoes ? `
  <section class="s-obs s-inner">
    <p class="s-eyebrow">OBSERVAÇÕES</p>
    <p class="obs-text">${d.observacoes}</p>
  </section>` : ''

  // ── Seção: diferenciais ──────────────────────────────────────────
  const difs = [d.diferencial1, d.diferencial2, d.diferencial3, d.diferencial4].filter(Boolean)
  const difsBlock = difs.length > 0 ? `
  <section class="s-difs">
    <div class="s-inner">
      <p class="s-eyebrow">POR QUE A ${d.empresa.toUpperCase()}</p>
      <div class="difs-grid">
        ${difs.map(txt => `
        <div class="dif-card">
          <p class="dif-txt">${txt}</p>
        </div>`).join('')}
      </div>
    </div>
  </section>` : ''

  // ── Seção: condições e assinatura ────────────────────────────────
  const condsBlock = `
  <section class="s-conds s-inner">
    <p class="s-eyebrow">CONDIÇÕES GERAIS</p>
    <div class="conds-list">
      <div class="cond-row"><span class="cond-ico">${icoCheck}</span><span>Instalação, homologação e ligação à rede inclusas no valor</span></div>
      <div class="cond-row"><span class="cond-ico">${icoCheck}</span><span>Garantia de 25 anos de performance dos módulos fotovoltaicos</span></div>
      <div class="cond-row"><span class="cond-ico">${icoCheck}</span><span>Proposta válida por ${validadeDias} dias — expira em <strong>${validadeAte}</strong></span></div>
      <div class="cond-row"><span class="cond-ico">${icoCheck}</span><span>Sujeita a vistoria técnica prévia do local de instalação</span></div>
    </div>
  </section>
  <section class="s-assin s-inner">
    <p class="s-eyebrow">APROVAÇÃO DA PROPOSTA</p>
    <div class="assin-grid">
      <div class="assin-col">
        <div class="assin-linha"></div>
        <p class="assin-nome">${d.clienteNome}</p>
        <p class="assin-cargo">Cliente</p>
      </div>
      <div class="assin-col">
        <div class="assin-linha"></div>
        <p class="assin-nome">${d.empresa}</p>
        <p class="assin-cargo">Representante Comercial</p>
      </div>
      <div class="assin-col assin-col-date">
        <div class="assin-linha"></div>
        <p class="assin-nome">____/____/________</p>
        <p class="assin-cargo">Data</p>
      </div>
    </div>
  </section>`

  const safeNome = d.clienteNome.replace(/[^a-zA-Z0-9]/g, '-')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Proposta Solar · ${d.clienteNome}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700;9..144,900&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<style>
/* ── Tokens ─────────────────────────────────────────────────── */
:root {
  --bg:          #F8F7F3;
  --bg-alt:      #F1F0EB;
  --surface:     #FFFFFF;
  --border:      #E0DDD8;
  --ink:         #141C2A;
  --ink-2:       #3D4A5C;
  --ink-3:       #7D8EA0;
  --gold:        #D4920A;
  --gold-bright: #F5A812;
  --gold-bg:     #FEF8E8;
  --gold-border: #F2D87A;
  --navy:        #0C1628;
  --navy-2:      #162038;
  --white:       #FFFFFF;
  --body-bg:     var(--bg);
  --body-color:  var(--ink);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg:          #111620;
    --bg-alt:      #181E2C;
    --surface:     #1C2333;
    --border:      #2A3348;
    --ink:         #EAE8E0;
    --ink-2:       #A8B2C4;
    --ink-3:       #5A6880;
    --gold:        #F5A812;
    --gold-bright: #FFB930;
    --gold-bg:     #1E1A0C;
    --gold-border: #4A3A08;
    --navy:        #08101E;
    --navy-2:      #0D1828;
    --body-bg:     var(--bg);
    --body-color:  var(--ink);
  }
}
:root[data-theme="dark"] {
  --bg:          #111620;
  --bg-alt:      #181E2C;
  --surface:     #1C2333;
  --border:      #2A3348;
  --ink:         #EAE8E0;
  --ink-2:       #A8B2C4;
  --ink-3:       #5A6880;
  --gold:        #F5A812;
  --gold-bright: #FFB930;
  --gold-bg:     #1E1A0C;
  --gold-border: #4A3A08;
  --navy:        #08101E;
  --navy-2:      #0D1828;
  --body-bg:     var(--bg);
  --body-color:  var(--ink);
}

/* ── Reset ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 16px; }
body {
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  background: #C8C5B8;
  color: var(--body-color);
  -webkit-font-smoothing: antialiased;
}

/* ── Action bar ── */
.bar {
  position: sticky; top: 0; z-index: 500;
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 28px;
  background: rgba(8,16,30,0.95);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.bar-doc {
  font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 1.2px;
  color: rgba(255,255,255,0.32);
}
.bar-btn {
  display: flex; align-items: center; gap: 7px;
  border: none; cursor: pointer;
  font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13px; font-weight: 600;
  padding: 9px 22px; border-radius: 7px;
  transition: opacity .15s, transform .1s;
}
.bar-btn:hover { opacity: .85; transform: translateY(-1px); }
.btn-close { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.75); }
.btn-pdf   { background: var(--gold-bright); color: #0C1628; }

/* ── Doc wrapper ── */
.wrap { padding: 36px 16px 60px; }
.doc {
  max-width: 860px; margin: 0 auto;
  background: var(--bg);
  box-shadow: 0 48px 120px rgba(0,0,0,0.38), 0 8px 24px rgba(0,0,0,0.12);
  overflow: hidden;
}

/* ── COVER ── */
.cover {
  position: relative;
  display: grid;
  grid-template-columns: 55% 45%;
  min-height: 500px;
  background: var(--navy);
  overflow: hidden;
}
.cover-left {
  position: relative; z-index: 2;
  display: flex; flex-direction: column;
  padding: 40px 44px 44px;
  background: var(--navy);
}
.cover-right {
  position: relative; overflow: hidden;
}
.cover-right::before {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(to right, var(--navy) 0%, transparent 35%);
  z-index: 1;
}
.cover-photo {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: cover; object-position: center 35%;
  display: block;
}
/* Gold vertical accent */
.cover-accent {
  position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
  background: linear-gradient(to bottom, var(--gold-bright), var(--gold));
}

/* Logo/empresa */
.cover-brand {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 56px;
}
.cover-logo {
  height: 48px; max-width: 200px; object-fit: contain;
  filter: brightness(0) invert(1);
}
.cover-logo-text {
  font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 3px;
  text-transform: uppercase; color: rgba(255,255,255,0.75); font-weight: 500;
}
.cover-docbadge {
  font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: 1.5px;
  color: rgba(255,255,255,0.3);
  border: 1px solid rgba(255,255,255,0.12);
  padding: 5px 10px; border-radius: 4px;
}

/* Headline */
.cover-headline {
  flex: 1; display: flex; flex-direction: column; justify-content: center;
  padding-bottom: 8px;
}
.cover-tag {
  font-family: 'DM Mono', monospace; font-size: 8.5px; letter-spacing: 3px;
  text-transform: uppercase; color: var(--gold-bright);
  margin-bottom: 18px; font-weight: 500;
}
.cover-h1 {
  font-family: 'Fraunces', Georgia, serif;
  font-size: clamp(38px, 5.5vw, 54px);
  font-weight: 900;
  font-style: italic;
  line-height: 1.04;
  color: #FFFFFF;
  text-wrap: balance;
  letter-spacing: -1.5px;
  margin-bottom: 20px;
}
.cover-kwp {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(245,168,18,0.15);
  border: 1px solid rgba(245,168,18,0.35);
  border-radius: 5px; padding: 7px 16px;
  font-family: 'DM Mono', monospace; font-size: 13px;
  color: var(--gold-bright); font-weight: 500; letter-spacing: 0.5px;
  width: fit-content;
}

/* Client block (bottom) */
.cover-client {
  border-top: 1px solid rgba(255,255,255,0.1);
  padding-top: 22px;
  display: flex; justify-content: space-between; align-items: flex-end; gap: 16px;
}
.cover-client-tag {
  font-family: 'DM Mono', monospace; font-size: 7.5px; letter-spacing: 2.5px;
  text-transform: uppercase; color: rgba(255,255,255,0.38); margin-bottom: 6px;
}
.cover-client-nome {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 20px; font-weight: 600;
  color: #ffffff; line-height: 1.2;
}
.cover-meta {
  text-align: right; display: flex; flex-direction: column; gap: 3px;
}
.cover-meta-row {
  display: flex; gap: 8px; justify-content: flex-end; align-items: baseline;
}
.cover-meta-label {
  font-family: 'DM Mono', monospace; font-size: 7.5px; letter-spacing: 1.5px;
  text-transform: uppercase; color: rgba(255,255,255,0.3);
}
.cover-meta-val {
  font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.7);
}

/* ── Inner width for sections ── */
.s-inner { padding: 44px 52px; }
section + section { border-top: 1px solid var(--border); }

/* ── Section eyebrow ── */
.s-eyebrow {
  font-family: 'DM Mono', monospace; font-size: 8px; font-weight: 500;
  letter-spacing: 2.8px; text-transform: uppercase;
  color: var(--gold); margin-bottom: 28px;
  display: flex; align-items: center; gap: 10px;
}
.s-eyebrow::after { content: ''; flex: 1; height: 1px; background: var(--border); }

/* ── Stats ── */
.s-stats { background: var(--navy); }
.s-stats .s-inner { padding-top: 48px; padding-bottom: 48px; }
.s-stats .s-eyebrow { color: rgba(245,168,18,0.6); }
.s-stats .s-eyebrow::after { background: rgba(255,255,255,0.08); }

.stats-row {
  display: flex; gap: 0;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px; overflow: hidden;
  margin-bottom: 28px;
}
.stat-item {
  flex: 1; padding: 32px 28px;
  display: flex; flex-direction: column; gap: 6px;
  border-right: 1px solid rgba(255,255,255,0.08);
}
.stat-item:last-child { border-right: none; }
.stat-main { background: rgba(245,168,18,0.06); }

.stat-num {
  font-family: 'Fraunces', Georgia, serif;
  font-size: clamp(36px, 5vw, 52px);
  font-weight: 900; line-height: 1;
  color: #FFFFFF; letter-spacing: -1.5px;
  font-feature-settings: "tnum";
}
.stat-unit {
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 18px; font-weight: 500;
  color: rgba(255,255,255,0.55);
  margin-left: 4px; letter-spacing: 0;
}
.stat-label {
  font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.55);
  text-transform: uppercase; letter-spacing: 0.5px;
}
.stat-note {
  font-size: 11px; color: rgba(255,255,255,0.32); margin-top: 2px; line-height: 1.5;
}

.social-proof {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: rgba(255,255,255,0.45); font-weight: 400;
}
.social-proof strong { color: var(--gold-bright); font-weight: 700; }
.social-proof svg { color: var(--gold-bright); opacity: .7; flex-shrink: 0; }

/* ── Sistema ── */
.s-sistema { border-top: 1px solid var(--border); }
.sistema-hero {
  display: flex; align-items: baseline; gap: 16px;
  margin-bottom: 32px; padding-bottom: 28px;
  border-bottom: 1px solid var(--border);
}
.sist-num {
  font-family: 'Fraunces', Georgia, serif;
  font-size: 64px; font-weight: 900; line-height: 1;
  color: var(--gold); letter-spacing: -2px;
  font-feature-settings: "tnum";
}
.sist-kwp-label {
  font-size: 16px; font-weight: 500; color: var(--ink-2); letter-spacing: 0.3px;
}
.sist-sub-info {
  margin-left: auto; text-align: right;
  display: flex; flex-direction: column; gap: 3px;
}
.sist-sub-info span { font-size: 13px; color: var(--ink-3); }

.equip-table { display: flex; flex-direction: column; gap: 0; }
.equip-row {
  display: grid;
  grid-template-columns: 24px 200px 1fr;
  align-items: center; gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--border);
}
.equip-row:last-child { border-bottom: none; }
.equip-ico { color: var(--gold); display: flex; align-items: center; }
.equip-label {
  font-size: 12px; font-weight: 600; color: var(--ink-3);
  text-transform: uppercase; letter-spacing: 0.5px;
}
.equip-val { font-size: 14px; color: var(--ink-2); }

/* ── Itens ── */
.itens-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.itens-table th {
  font-family: 'DM Mono', monospace; font-size: 8px; font-weight: 500;
  letter-spacing: 1.5px; text-transform: uppercase; color: var(--ink-3);
  padding: 0 0 12px; border-bottom: 2px solid var(--ink);
}
.col-desc { text-align: left; }
.col-qtd  { text-align: center; width: 50px; }
.col-unit { text-align: right; width: 120px; }
.col-tot  { text-align: right; width: 130px; }

.itens-table td { padding: 14px 0; border-bottom: 1px solid var(--border); font-size: 14px; }
.itens-table tr:last-child td { border-bottom: none; }
.itens-table tr:nth-child(even) td { background: var(--bg-alt); }
.td-desc { font-weight: 600; color: var(--ink); text-align: left; }
.td-qtd  { text-align: center; color: var(--ink-3); }
.td-num  { text-align: right; color: var(--ink-2); font-family: 'DM Mono', monospace; font-size: 13px; }
.td-bold { color: var(--ink) !important; font-weight: 700; }

/* ── Investimento ── */
.s-invest { background: var(--navy); }
.s-invest .s-inner { text-align: center; padding-top: 52px; padding-bottom: 52px; }

.invest-valor {
  font-family: 'Fraunces', Georgia, serif;
  font-size: clamp(52px, 9vw, 76px);
  font-weight: 900; line-height: 1;
  color: #FFFFFF; letter-spacing: -2.5px;
  margin-bottom: 14px;
  font-feature-settings: "tnum";
}
.invest-forma {
  display: inline-block;
  background: rgba(245,168,18,0.15);
  border: 1px solid rgba(245,168,18,0.3);
  border-radius: 20px; padding: 7px 22px;
  font-size: 13px; font-weight: 500; color: var(--gold-bright);
  margin-bottom: 36px;
}
.invest-meta {
  display: flex; flex-wrap: wrap; justify-content: center; gap: 12px;
}
.imeta-card {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px; padding: 14px 22px;
  min-width: 160px; text-align: left;
}
.imeta-label {
  font-family: 'DM Mono', monospace; font-size: 8px; letter-spacing: 1.5px;
  text-transform: uppercase; color: rgba(255,255,255,0.35); margin-bottom: 6px;
}
.imeta-val { font-size: 15px; font-weight: 600; color: rgba(255,255,255,0.85); }

/* ── Observações ── */
.obs-text { font-size: 14px; line-height: 1.8; color: var(--ink-2); }

/* ── Diferenciais ── */
.s-difs { background: var(--bg-alt); }
.difs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px 40px; }
.dif-card {
  padding-top: 18px;
  border-top: 2px solid var(--gold-border);
}
.dif-txt { font-size: 14px; line-height: 1.7; color: var(--ink-2); }

/* ── Condições ── */
.conds-list { display: flex; flex-direction: column; gap: 13px; }
.cond-row {
  display: flex; align-items: flex-start; gap: 11px;
  font-size: 14px; color: var(--ink-2); line-height: 1.55;
}
.cond-ico { color: var(--gold); flex-shrink: 0; margin-top: 2px; }

/* ── Assinatura ── */
.s-assin { border-top: 1px solid var(--border); }
.assin-grid { display: grid; grid-template-columns: 1fr 1fr 0.8fr; gap: 32px; }
.assin-col { display: flex; flex-direction: column; }
.assin-col-date { }
.assin-linha {
  width: 100%; height: 1.5px; background: var(--border);
  margin-top: 52px; margin-bottom: 10px;
}
.assin-nome { font-size: 14px; font-weight: 600; color: var(--ink); }
.assin-cargo { font-size: 11px; color: var(--ink-3); margin-top: 3px; text-transform: uppercase; letter-spacing: 0.5px; }

/* ── Footer ── */
.doc-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 52px; background: var(--navy);
  border-top: 3px solid var(--gold);
}
.footer-logo { height: 28px; max-width: 120px; object-fit: contain; filter: brightness(0) invert(1); opacity: .8; }
.footer-brand-text {
  font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: 2.5px;
  text-transform: uppercase; color: rgba(255,255,255,0.45);
}
.footer-doc {
  font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: 1px;
  color: rgba(255,255,255,0.25); text-align: right; line-height: 1.7;
}

/* ── Print ── */
@media print {
  @page { margin: 0; size: A4 portrait; }
  *, *::before, *::after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  html, body { margin: 0 !important; background: white !important; }
  .bar { display: none !important; }
  .wrap { padding: 0 !important; }
  .doc { box-shadow: none !important; max-width: 100% !important; }
  .cover, section, .doc-footer { page-break-inside: avoid; break-inside: avoid; }
}
</style>
</head>
<body>

<div class="bar">
  <button class="bar-btn btn-close" onclick="window.close()">← Fechar</button>
  <span class="bar-doc">${docNum} &middot; ${d.dataEmissao}</span>
  <button class="bar-btn btn-pdf" id="btnPdf" onclick="gerarPDF()">&#8675; Salvar PDF</button>
</div>

<div class="wrap">
<div class="doc">

  <!-- COVER -->
  <div class="cover">
    <div class="cover-accent"></div>
    <div class="cover-left">
      <div class="cover-brand">
        ${d.logoUrl
          ? `<img src="${d.logoUrl}" crossorigin="anonymous" class="cover-logo" alt="${d.empresa}" onerror="this.style.display='none'">`
          : `<span class="cover-logo-text">${d.empresa}</span>`
        }
        <span class="cover-docbadge">${docNum}</span>
      </div>

      <div class="cover-headline">
        <p class="cover-tag">Proposta Comercial &middot; Energia Solar Fotovoltaica</p>
        <h1 class="cover-h1">A energia do sol<br>trabalhando por<br>você.</h1>
        ${hasSolar ? `
        <div class="cover-kwp">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
          ${(d.potenciaKwp!).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kWp instalados
        </div>` : ''}
      </div>

      <div class="cover-client">
        <div>
          <p class="cover-client-tag">Preparado para</p>
          <p class="cover-client-nome">${d.clienteNome}${d.clienteCidade ? `<br><span style="font-size:14px;font-weight:400;opacity:.6;">${d.clienteCidade}</span>` : ''}</p>
        </div>
        <div class="cover-meta">
          <div class="cover-meta-row">
            <span class="cover-meta-label">Emissão</span>
            <span class="cover-meta-val">${d.dataEmissao}</span>
          </div>
          <div class="cover-meta-row">
            <span class="cover-meta-label">Válida até</span>
            <span class="cover-meta-val">${validadeAte}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="cover-right">
      <img class="cover-photo" src="${imagemHero}" crossorigin="anonymous" alt="" onerror="this.style.display='none'">
    </div>
  </div>

  ${statsBlock}
  ${sistemaBlock}
  ${itemsBlock}
  ${investBlock}
  ${obsBlock}
  ${difsBlock}
  ${condsBlock}

  <!-- FOOTER -->
  <div class="doc-footer">
    ${d.logoUrl
      ? `<img src="${d.logoUrl}" crossorigin="anonymous" class="footer-logo" alt="${d.empresa}" onerror="this.style.display='none'">`
      : `<span class="footer-brand-text">${d.empresa}</span>`
    }
    <div class="footer-doc">
      Proposta N&ordm; ${docNum} &middot; Emitida em ${d.dataEmissao}<br>
      ${d.empresa} &middot; Sujeita a vistoria t&eacute;cnica
    </div>
  </div>

</div>
</div>

<script>
async function gerarPDF() {
  var btn = document.getElementById('btnPdf');
  var bar = document.querySelector('.bar');
  if (btn) { btn.textContent = '⏳ Gerando…'; btn.disabled = true; }
  if (bar) bar.style.visibility = 'hidden';

  var docEl = document.querySelector('.doc');
  docEl.style.width = '860px'; docEl.style.maxWidth = '860px'; docEl.style.minWidth = '860px';
  void docEl.offsetHeight;

  try {
    await document.fonts.ready;
    var { jsPDF } = window.jspdf;
    var pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    var pdfW = pdf.internal.pageSize.getWidth();
    var pdfH = pdf.internal.pageSize.getHeight();
    var pxPerMm = (860 * 2) / pdfW;

    var sels = '.cover, section.s-stats, section.s-sistema, section.s-items, section.s-invest, section.s-obs, section.s-difs, section.s-conds, section.s-assin, .doc-footer';
    var elems = Array.from(docEl.querySelectorAll(sels));
    var cvs = [];
    for (var i = 0; i < elems.length; i++) {
      var c = await html2canvas(elems[i], {
        scale: 2, useCORS: true, allowTaint: false,
        backgroundColor: null, logging: false,
        width: 860, windowWidth: 860, scrollX: 0, scrollY: 0,
      });
      cvs.push(c);
    }

    var groups = [], cur = [], curH = 0;
    for (var j = 0; j < cvs.length; j++) {
      var hMm = cvs[j].height / pxPerMm;
      if (cur.length > 0 && curH + hMm > pdfH) { groups.push(cur); cur = [j]; curH = hMm; }
      else { cur.push(j); curH += hMm; }
    }
    if (cur.length) groups.push(cur);

    for (var p = 0; p < groups.length; p++) {
      var grp = groups[p], totPx = 0;
      for (var k = 0; k < grp.length; k++) totPx += cvs[grp[k]].height;
      var pc = document.createElement('canvas');
      pc.width = cvs[grp[0]].width; pc.height = totPx;
      var ctx = pc.getContext('2d'), yy = 0;
      for (var m = 0; m < grp.length; m++) { ctx.drawImage(cvs[grp[m]], 0, yy); yy += cvs[grp[m]].height; }
      if (p > 0) pdf.addPage();
      pdf.addImage(pc.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pdfW, totPx / pxPerMm);
    }
    pdf.save('Proposta-Solar-${safeNome}.pdf');
  } catch(e) {
    alert('Erro ao gerar PDF: ' + (e.message || e));
  } finally {
    docEl.style.width = ''; docEl.style.maxWidth = ''; docEl.style.minWidth = '';
    if (btn) { btn.textContent = '&#8675; Salvar PDF'; btn.disabled = false; }
    if (bar) bar.style.visibility = 'visible';
  }
}
</script>
</body>
</html>`
}
