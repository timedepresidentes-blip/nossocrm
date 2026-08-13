import { z } from 'zod';

// Converte string de moeda BR ("R$ 8.000,00" ou "8000.00") ou número para número JS
function parseBRNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const s = String(v).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

const brNum = z.preprocess(parseBRNum, z.number().nullable());

export const FichaClienteSchema = z.object({
  // Dados pessoais
  nomeCompleto:    z.string().nullable().describe('Nome completo do cliente.'),
  cpfCnpj:        z.string().nullable().describe('CPF ou CNPJ do cliente. Formato: 000.000.000-00 ou 00.000.000/0000-00.'),
  rg:             z.string().nullable().describe('RG do cliente se mencionado.'),
  telefone:       z.string().nullable().describe('Telefone principal do cliente.'),
  email:          z.string().nullable().describe('E-mail do cliente.'),
  estadoCivil:    z.string().nullable().describe('Estado civil se mencionado.'),
  // Endereço do cliente
  enderecoRua:    z.string().nullable().describe('Rua e número do endereço do cliente.'),
  enderecoBairro: z.string().nullable().describe('Bairro do endereço do cliente.'),
  enderecoCidade: z.string().nullable().describe('Cidade do cliente.'),
  enderecoEstado: z.string().nullable().describe('Estado (UF) do cliente.'),
  enderecoCep:    z.string().nullable().describe('CEP do cliente.'),
  // Local de instalação (pode diferir do endereço)
  instalacaoEndereco:   z.string().nullable().describe('Endereço completo do local de instalação, se diferente do endereço do cliente.'),
  instalacaoCidade:     z.string().nullable().describe('Cidade do local de instalação.'),
  instalacaoTipoImovel: z.string().nullable().describe('Tipo de imóvel: Residencial, Comercial, Rural, Industrial.'),
  instalacaoTelhado:    z.string().nullable().describe('Tipo de telhado: Cerâmica, Metálica, Fibrocimento, Laje, Solo.'),
  instalacaoFases:      z.string().nullable().describe('Fases elétricas: Monofásico, Bifásico, Trifásico.'),
  instalacaoDisjuntor:  z.string().nullable().describe('Amperagem do disjuntor principal se mencionado.'),
  // Dados do sistema solar acordado
  potenciaKwp:     brNum.describe('Potência total do sistema em kWp.'),
  numPaineis:      brNum.describe('Quantidade de painéis solares.'),
  modeloPainel:    z.string().nullable().describe('Marca e modelo do painel solar.'),
  potenciaPainelW: brNum.describe('Potência unitária do painel em Watts.'),
  modeloInversor:  z.string().nullable().describe('Marca e modelo do inversor.'),
  tipoInversor:    z.string().nullable().describe('Tipo: Microinversor ou Inversor String.'),
  qtdInversores:   brNum.describe('Quantidade de inversores.'),
  tipoEstrutura:   z.string().nullable().describe('Tipo de estrutura de fixação.'),
  // Dados financeiros e condições comerciais
  valorTotal:         brNum.describe('Valor total da venda acordado em R$. IMPORTANTE: extraia o número puro, ex: 8000.00'),
  formaPagamento:     z.string().nullable().describe('Forma de pagamento combinada (ex: Financiado, À vista, Parcelado).'),
  condicoesPagamento: z.string().nullable().describe('Detalhes das condições: prazo, parcelas, entrada etc.'),
  prazoEntrega:       z.string().nullable().describe('Prazo de entrega ou instalação combinado.'),
  // Dados de consumo/distribuidora
  consumoMensalKwh: brNum.describe('Consumo médio mensal em kWh.'),
  valorContaAtual:  brNum.describe('Valor atual da conta de energia em R$.'),
  distribuidora:    z.string().nullable().describe('Nome da distribuidora de energia.'),
  // Observações gerais
  observacoes: z.string().nullable().describe('Qualquer outra informação relevante mencionada.'),
});

export type FichaClienteData = z.infer<typeof FichaClienteSchema>;
