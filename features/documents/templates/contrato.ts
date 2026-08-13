import { LOGO_AUREON_B64 } from './logoBase64';
import type { FabricanteModulo, FabricanteInversor } from './fabricantes';

export interface ContratoData {
  // Comprador
  compradorNome: string;
  compradorCpfCnpj: string;
  compradorEndereco: string;
  compradorContato: string;

  // Instalação
  enderecoInstalacao: string;
  potenciaKwp: string;

  // Equipamentos
  inversorModelo: string;
  inversorQtd: string;
  moduloModelo: string;
  moduloQtd: string;
  estruturaTipo: string;
  estruturaQtd: string;

  // Financeiro
  valorTotal: string;
  valorExtenso: string;
  formaPagamento: string;
  numParcelas: string;
  valorParcela: string;
  vencimento: string;

  // Identificação
  numContrato: string;
  cidade: string;
  data: string;

  // Dados de garantia (preenchidos automaticamente pelo fabricante)
  moduloFabricanteData?: FabricanteModulo;
  inversorFabricanteData?: FabricanteInversor;
}

const empresa = 'F. R. C. CINTRA';
const fantasia = 'AUREON ENERGIX';
const cnpj = '33.071.872/0001-08';
const endEmpresa = 'Av. Octaviano de Arruda Campos, 921 - Vila Xavier - CEP 14.810-225 - Araraquara/SP';
const rep = 'Flávio Ronele Carvalho Cintra';
const cpfRep = '313.248.228-56';

const estiloBase = `
  @page { size: A4; margin: 25mm 20mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #000; background: #fff; }
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1a1a2e; padding-bottom: 10px; margin-bottom: 20px; }
  .logo { height: 55px; width: auto; }
  .company-info { text-align: right; font-size: 8.5pt; color: #333; line-height: 1.5; }
  .company-info strong { font-size: 10pt; color: #1a1a2e; display: block; }
  h1 { text-align: center; font-size: 13pt; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; color: #1a1a2e; }
  .subtitle { text-align: center; font-size: 9pt; color: #555; margin-bottom: 18px; }
  h2 { font-size: 11pt; font-weight: bold; text-transform: uppercase; margin: 18px 0 8px; color: #1a1a2e; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
  p { text-align: justify; line-height: 1.7; margin-bottom: 8px; font-size: 11pt; }
  .clausula { margin-bottom: 12px; }
  .clausula-titulo { font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10pt; page-break-inside: avoid; }
  th { background: #1a1a2e; color: #fff; padding: 6px 8px; text-align: left; font-size: 10pt; }
  td { border: 1px solid #ccc; padding: 5px 8px; }
  tr { page-break-inside: avoid; }
  tr:nth-child(even) td { background: #f7f7f7; }
  h2 { font-size: 11pt; font-weight: bold; text-transform: uppercase; margin: 18px 0 8px; color: #1a1a2e; border-bottom: 1px solid #ccc; padding-bottom: 3px; page-break-after: avoid; }
  .assinaturas { display: flex; justify-content: space-between; margin-top: 50px; gap: 40px; page-break-inside: avoid; }
  .ass-block { flex: 1; text-align: center; }
  .ass-line { border-top: 1px solid #000; margin-bottom: 6px; }
  .ass-nome { font-size: 10pt; font-weight: bold; }
  .ass-cpf { font-size: 9pt; color: #555; }
  .ass-papel { font-size: 9pt; }
  .num-contrato { text-align: right; font-size: 9pt; color: #666; margin-bottom: 6px; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } table { page-break-inside: avoid; } tr { page-break-inside: avoid; } .assinaturas { page-break-inside: avoid; } }
`;

const cabecalho = (numContrato: string) => `
  <div class="num-contrato">Contrato Nº: ${numContrato}</div>
  <div class="header">
    <img src="${LOGO_AUREON_B64}" alt="Aureon Energix" class="logo" />
    <div class="company-info">
      <strong>${fantasia}</strong>
      ${empresa} | CNPJ: ${cnpj}<br>
      ${endEmpresa}
    </div>
  </div>
`;

export function gerarContrato(d: ContratoData): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Contrato ${d.numContrato} - ${d.compradorNome}</title>
<style>${estiloBase}</style>
</head>
<body>
${cabecalho(d.numContrato)}

<h1>Contrato de Compra, Venda e Instalação</h1>
<p class="subtitle">Sistema de Energia Solar Fotovoltaica</p>

<h2>Qualificação das Partes</h2>
<p><strong>VENDEDORA/INSTALADORA:</strong> ${empresa}, nome fantasia ${fantasia}, inscrita no CNPJ sob nº ${cnpj}, com sede em ${endEmpresa}, neste ato representada por ${rep}, CPF ${cpfRep}.</p>
<p><strong>COMPRADOR(A):</strong> ${d.compradorNome}, CPF/CNPJ ${d.compradorCpfCnpj}, residente/sediado em ${d.compradorEndereco}, contato: ${d.compradorContato}.</p>

<h2>Cláusula 1ª – Do Objeto</h2>
<p class="clausula">O presente contrato tem por objeto a compra, venda e instalação de um sistema de geração de energia solar fotovoltaica com potência de <strong>${d.potenciaKwp} kWp</strong>, a ser instalado no endereço: <strong>${d.enderecoInstalacao}</strong>, conforme especificações técnicas descritas abaixo.</p>

<h2>Especificações Técnicas</h2>
<table>
  <tr><th>Item</th><th>Modelo/Tipo</th><th>Quantidade</th></tr>
  <tr><td>Inversor</td><td>${d.inversorModelo}</td><td>${d.inversorQtd}</td></tr>
  <tr><td>Módulos Fotovoltaicos</td><td>${d.moduloModelo}</td><td>${d.moduloQtd}</td></tr>
  <tr><td>Estrutura de Fixação</td><td>${d.estruturaTipo}</td><td>${d.estruturaQtd}</td></tr>
</table>

<h2>Cláusula 2ª – Do Preço e Forma de Pagamento</h2>
<p class="clausula">O valor total do sistema é de <strong>R$ ${d.valorTotal}</strong> (${d.valorExtenso}), a ser pago da seguinte forma: <strong>${d.formaPagamento}</strong>${d.numParcelas && d.numParcelas !== '1' ? `, em ${d.numParcelas} parcelas de R$ ${d.valorParcela}` : ''}, com vencimento em ${d.vencimento}.</p>

<h2>Cláusula 3ª – Do Prazo de Instalação</h2>
<p class="clausula">A VENDEDORA/INSTALADORA se compromete a realizar a instalação do sistema fotovoltaico em até 60 (sessenta) dias corridos após a confirmação do pagamento, ressalvados casos de força maior, atraso no fornecimento de equipamentos ou pendências junto à distribuidora de energia.</p>

<h2>Cláusula 4ª – Das Obrigações da Vendedora</h2>
<p class="clausula">a) Fornecer os equipamentos especificados neste contrato, com garantia dos fabricantes;<br>
b) Realizar a instalação por profissionais habilitados, com emissão de ART;<br>
c) Providenciar o projeto elétrico e a homologação junto à distribuidora local de energia;<br>
d) Prestar suporte técnico durante o período de garantia.</p>

<h2>Cláusula 5ª – Das Obrigações do Comprador</h2>
<p class="clausula">a) Efetuar os pagamentos conforme acordado;<br>
b) Fornecer acesso ao local de instalação nas datas e horários combinados;<br>
c) Assinar a procuração para representação junto à distribuidora de energia;<br>
d) Manter a estrutura de instalação em boas condições de conservação.</p>

<h2>Cláusula 6ª – Da Garantia</h2>
<p class="clausula">Os equipamentos possuem garantias conforme especificado no Anexo II – Quadro de Garantia de Equipamentos, que faz parte integrante deste contrato.</p>

<h2>Cláusula 7ª – Do Foro</h2>
<p class="clausula">As partes elegem o foro da Comarca de ${d.cidade} para dirimir quaisquer controvérsias oriundas deste contrato.</p>

<h2>Garantias dos Equipamentos</h2>
<table>
  <colgroup><col style="width:20%"><col style="width:30%"><col style="width:18%"><col style="width:17%"><col style="width:15%"></colgroup>
  <tr><th>Equipamento</th><th>Modelo</th><th>Gar. Fornecedor</th><th>Gar. Fábrica</th><th>Gar. Desempenho</th></tr>
  <tr>
    <td>Inversor</td>
    <td>${d.inversorModelo} (${d.inversorQtd} un.)</td>
    <td>${d.inversorFabricanteData?.garantiaFornecedor ?? '—'}</td>
    <td>${d.inversorFabricanteData?.garantiaFabrica ?? '5 anos'}</td>
    <td>—</td>
  </tr>
  <tr>
    <td>Módulos Fotovoltaicos</td>
    <td>${d.moduloModelo} (${d.moduloQtd} un.)</td>
    <td>${d.moduloFabricanteData?.garantiaFornecedor ?? '—'}</td>
    <td>${d.moduloFabricanteData?.garantiaFabrica ?? '12 anos'}</td>
    <td>${d.moduloFabricanteData?.garantiaDesempenho ?? '25 anos'}</td>
  </tr>
  <tr><td>Instalação / Mão de Obra</td><td>—</td><td>—</td><td>1 ano</td><td>—</td></tr>
</table>

<p style="margin-top: 24px;">${d.cidade}, ${d.data}.</p>

<div class="assinaturas">
  <div class="ass-block">
    <div class="ass-line"></div>
    <div class="ass-nome">${empresa}</div>
    <div class="ass-papel">${fantasia}</div>
    <div class="ass-cpf">CNPJ: ${cnpj}</div>
    <div class="ass-cpf">Repr.: ${rep}</div>
  </div>
  <div class="ass-block">
    <div class="ass-line"></div>
    <div class="ass-nome">${d.compradorNome}</div>
    <div class="ass-papel">Comprador(a)</div>
    <div class="ass-cpf">CPF/CNPJ: ${d.compradorCpfCnpj}</div>
  </div>
</div>

<script>window.onload = () => window.print();</script>
</body>
</html>`;
}

export function gerarAnexoII(d: ContratoData): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Anexo II – Garantia – ${d.compradorNome}</title>
<style>${estiloBase}</style>
</head>
<body>
${cabecalho(d.numContrato)}

<h1>Anexo II – Quadro de Garantia de Equipamentos</h1>
<p class="subtitle">Referente ao Contrato Nº ${d.numContrato} – ${d.compradorNome}</p>

<table style="margin-top: 20px; font-size: 9.5pt;">
  <colgroup><col style="width:20%"><col style="width:30%"><col style="width:17%"><col style="width:17%"><col style="width:16%"></colgroup>
  <tr>
    <th>Equipamento</th>
    <th>Modelo</th>
    <th>Gar. Fornecedor</th>
    <th>Gar. Fábrica</th>
    <th>Gar. Desempenho</th>
  </tr>
  <tr>
    <td>Inversor Solar</td>
    <td>${d.inversorModelo} (${d.inversorQtd} un.)</td>
    <td>${d.inversorFabricanteData?.garantiaFornecedor ?? '—'}</td>
    <td>${d.inversorFabricanteData?.garantiaFabrica ?? '5 anos'}</td>
    <td>—</td>
  </tr>
  <tr>
    <td>Módulos Fotovoltaicos</td>
    <td>${d.moduloModelo} (${d.moduloQtd} un.)</td>
    <td>${d.moduloFabricanteData?.garantiaFornecedor ?? '—'}</td>
    <td>${d.moduloFabricanteData?.garantiaFabrica ?? '12 anos'}</td>
    <td>${d.moduloFabricanteData?.garantiaDesempenho ?? '25 anos'}</td>
  </tr>
  <tr>
    <td>Estrutura de Fixação</td>
    <td>${d.estruturaTipo} (${d.estruturaQtd} un.)</td>
    <td>—</td>
    <td>5 anos</td>
    <td>—</td>
  </tr>
  <tr>
    <td>Instalação e Mão de Obra</td>
    <td>—</td>
    <td>—</td>
    <td>1 ano</td>
    <td>—</td>
  </tr>
</table>
<p style="font-size:8pt;color:#555;margin-top:8px">
  <strong>Termos de garantia dos fabricantes:</strong><br>
  Inversor (${d.inversorFabricanteData?.nome ?? '—'}): ${d.inversorFabricanteData?.linkGarantia ?? '—'}<br>
  Módulos (${d.moduloFabricanteData?.nome ?? '—'}): ${d.moduloFabricanteData?.linkGarantia ?? '—'}
</p>

<h2 style="margin-top: 24px;">Condições Gerais de Garantia</h2>
<p>a) A garantia cobre defeitos de fabricação e falhas de instalação comprovadas;</p>
<p>b) A garantia não cobre danos causados por acidentes, mau uso, descuido, eventos naturais (raios, granizo, inundação) ou intervenções de terceiros não autorizados;</p>
<p>c) Para acionar a garantia, o COMPRADOR deverá entrar em contato com a ${fantasia} através dos canais de atendimento oficiais;</p>
<p>d) Os prazos de garantia são contados a partir da data de instalação e comissionamento do sistema.</p>

<p style="margin-top: 24px;">${d.cidade}, ${d.data}.</p>

<div class="assinaturas">
  <div class="ass-block">
    <div class="ass-line"></div>
    <div class="ass-nome">${empresa}</div>
    <div class="ass-papel">${fantasia}</div>
    <div class="ass-cpf">CNPJ: ${cnpj}</div>
  </div>
  <div class="ass-block">
    <div class="ass-line"></div>
    <div class="ass-nome">${d.compradorNome}</div>
    <div class="ass-papel">Comprador(a)</div>
    <div class="ass-cpf">CPF/CNPJ: ${d.compradorCpfCnpj}</div>
  </div>
</div>

<script>window.onload = () => window.print();</script>
</body>
</html>`;
}

export function gerarTermoCiencia(d: ContratoData): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Termo de Ciência – ${d.compradorNome}</title>
<style>${estiloBase}</style>
</head>
<body>
${cabecalho(d.numContrato)}

<h1>Termo de Ciência Técnica</h1>
<p class="subtitle">Referente ao Contrato Nº ${d.numContrato}</p>

<p style="margin-top: 16px;">Eu, <strong>${d.compradorNome}</strong>, CPF/CNPJ <strong>${d.compradorCpfCnpj}</strong>, declaro ter ciência e concordância com as seguintes informações técnicas e operacionais referentes ao sistema de energia solar fotovoltaica adquirido:</p>

<h2>1. Funcionamento do Sistema</h2>
<p>O sistema fotovoltaico gera energia elétrica apenas durante o período diurno com incidência solar. A geração é variável conforme as condições climáticas e estações do ano. O sistema está conectado à rede da distribuidora (on-grid) e não armazena energia — eventuais créditos gerados são compensados na conta de energia conforme regulamentação da ANEEL.</p>

<h2>2. Estimativa de Geração</h2>
<p>A estimativa de geração apresentada durante a negociação é baseada em médias históricas de irradiação solar da localidade. Variações climáticas podem resultar em geração acima ou abaixo do estimado, sem constituir inadimplência contratual.</p>

<h2>3. Manutenção</h2>
<p>Para manter a eficiência do sistema, recomenda-se: limpeza periódica dos módulos (frequência conforme sujidade local), monitoramento via aplicativo do inversor, e revisão técnica anual. Danos decorrentes de falta de manutenção não são cobertos pela garantia.</p>

<h2>4. Homologação</h2>
<p>O processo de homologação junto à distribuidora de energia local poderá levar entre 30 e 120 dias, conforme prazos da distribuidora. Durante este período, o sistema pode estar instalado mas ainda não compensando créditos de energia.</p>

<h2>5. Alterações Futuras</h2>
<p>Qualquer ampliação ou alteração no sistema deverá ser comunicada previamente à ${fantasia} para avaliação técnica e, se necessário, novo processo de homologação junto à distribuidora.</p>

<h2>6. Declaração</h2>
<p>Declaro ter sido informado sobre todos os aspectos técnicos, operacionais e limitações do sistema fotovoltaico, e que estou adquirindo o produto com pleno entendimento de seu funcionamento.</p>

<p style="margin-top: 24px;">${d.cidade}, ${d.data}.</p>

<div class="assinaturas">
  <div class="ass-block">
    <div class="ass-line"></div>
    <div class="ass-nome">${d.compradorNome}</div>
    <div class="ass-papel">Declarante</div>
    <div class="ass-cpf">CPF/CNPJ: ${d.compradorCpfCnpj}</div>
  </div>
  <div class="ass-block">
    <div class="ass-line"></div>
    <div class="ass-nome">${empresa}</div>
    <div class="ass-papel">${fantasia} — Testemunha</div>
    <div class="ass-cpf">CNPJ: ${cnpj}</div>
  </div>
</div>

<script>window.onload = () => window.print();</script>
</body>
</html>`;
}
