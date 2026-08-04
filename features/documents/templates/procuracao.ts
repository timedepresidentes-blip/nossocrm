import { LOGO_AUREON_B64 } from './logoBase64';

interface ProcuracaoData {
  // Titular da UC (conta de luz)
  titularNome: string;
  titularCpf: string;
  titularEndereco: string;
  titularCep: string;
  titularCidade: string;
  titularUf: string;

  // Se titular diferente do comprador
  titularDiferente: boolean;
  compradorNome?: string;

  // Dados da distribuidora
  distribuidora: string;

  // Número de referência e data
  refNumero: string;
  cidade: string;
  data: string;
}

export function gerarProcuracao(d: ProcuracaoData): string {
  const empresa = 'F. R. C. CINTRA (AUREON ENERGIX)';
  const cnpjEmpresa = '33.071.872/0001-08';
  const endEmpresa = 'Av. Octaviano de Arruda Campos, 921 - Vila Xavier - CEP 14.810-225 - Araraquara/SP';
  const rep = 'Flávio Ronele Carvalho Cintra';
  const cpfRep = '313.248.228-56';

  const titularDisplay = `${d.titularNome}, portador(a) do CPF: ${d.titularCpf}, residente e domiciliado(a) no endereço: ${d.titularEndereco} - ${d.titularCep} - ${d.titularCidade}/${d.titularUf}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Procuração - ${d.titularNome}</title>
<style>
  @page { size: A4; margin: 25mm 20mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; color: #000; background: #fff; }
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1a1a2e; padding-bottom: 12px; margin-bottom: 24px; }
  .logo { height: 60px; width: auto; }
  .company-info { text-align: right; font-size: 9pt; color: #333; line-height: 1.5; }
  .company-info strong { font-size: 11pt; color: #1a1a2e; display: block; }
  h1 { text-align: center; font-size: 15pt; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 24px; color: #1a1a2e; }
  .body-text { text-align: justify; line-height: 1.8; font-size: 12pt; margin-bottom: 32px; }
  .footer-info { margin-bottom: 48px; font-size: 11pt; }
  .footer-info p { margin-bottom: 6px; }
  .signature-block { display: flex; flex-direction: column; align-items: center; margin-top: 60px; }
  .signature-line { border-top: 1px solid #000; width: 300px; margin-bottom: 8px; }
  .signature-name { font-size: 11pt; font-weight: bold; text-align: center; }
  .signature-cpf { font-size: 10pt; text-align: center; color: #444; }
  .ref { margin-top: 32px; font-size: 9pt; color: #666; text-align: center; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="header">
    <img src="${LOGO_AUREON_B64}" alt="Aureon Energix" class="logo" />
    <div class="company-info">
      <strong>AUREON ENERGIX</strong>
      F. R. C. CINTRA<br>
      CNPJ: 33.071.872/0001-08<br>
      ${endEmpresa}
    </div>
  </div>

  <h1>Procuração</h1>

  <div class="body-text">
    <p>Pelo presente instrumento particular de procuração, <strong>${titularDisplay}</strong>, nomeia e constitui seu procurador a empresa <strong>${empresa}</strong>, portadora do CNPJ: <strong>${cnpjEmpresa}</strong>, situada no endereço: <strong>${endEmpresa}</strong>, neste ato representada por <strong>${rep}</strong>, portador do CPF <strong>${cpfRep}</strong>, para representá-la junto à <strong>Companhia de Energia ${d.distribuidora}</strong>, com a finalidade específica e única de promover a Viabilidade para carga no projeto de homologação energia solar, executar projeto elétrico de geração distribuída de energia solar fotovoltaica, solicitação de viabilidade, alteração de carga, inspeção, fiscalização, assinar ART, solicitação de acesso, compensação de créditos de energia elétrica até mesmo depois do sistema fotovoltaico homologado pela CIA de Energia e/ou quaisquer serviços necessários para instalação, homologação e demais serviços relacionadas à manutenção da usina solar fotovoltaica.</p>
  </div>

  <div class="footer-info">
    <p>${d.cidade}, ${d.data}.</p>
  </div>

  <div class="signature-block">
    <div class="signature-line"></div>
    <div class="signature-name">${d.titularNome}</div>
    <div class="signature-cpf">CPF: ${d.titularCpf}</div>
  </div>

  <div class="ref">PROCURAÇÃO REF Nº: ${d.refNumero}</div>

  <script>window.onload = () => window.print();</script>
</body>
</html>`;
}
