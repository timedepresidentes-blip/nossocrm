export const metadata = {
  title: 'Política de Privacidade — NossoCRM',
};

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontFamily: 'sans-serif', color: '#1a1a1a', lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Política de Privacidade</h1>
      <p style={{ color: '#666', marginBottom: 32 }}>Última atualização: maio de 2026</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32, marginBottom: 8 }}>1. Quem somos</h2>
      <p>O NossoCRM é uma plataforma de gestão de relacionamento com clientes (CRM) com inteligência artificial, desenvolvida para uso empresarial. Este aplicativo acessa a API do WhatsApp Business (Meta) exclusivamente para envio e recebimento de mensagens comerciais em nome das organizações cadastradas.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32, marginBottom: 8 }}>2. Dados coletados</h2>
      <p>Coletamos apenas os dados necessários para o funcionamento do CRM:</p>
      <ul style={{ paddingLeft: 20, marginTop: 8 }}>
        <li>Nome e número de telefone de contatos que iniciam conversa com a empresa</li>
        <li>Conteúdo das mensagens trocadas via WhatsApp Business</li>
        <li>Dados de cadastro dos usuários administradores da plataforma</li>
      </ul>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32, marginBottom: 8 }}>3. Uso dos dados</h2>
      <p>Os dados são utilizados exclusivamente para:</p>
      <ul style={{ paddingLeft: 20, marginTop: 8 }}>
        <li>Exibição do histórico de conversas no painel CRM</li>
        <li>Acionamento do agente de IA para respostas automáticas</li>
        <li>Gestão do pipeline de vendas da organização</li>
      </ul>
      <p style={{ marginTop: 8 }}>Não vendemos, compartilhamos ou usamos os dados para fins publicitários.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32, marginBottom: 8 }}>4. Armazenamento e segurança</h2>
      <p>Os dados são armazenados em servidores seguros (Supabase/PostgreSQL) com criptografia em trânsito (HTTPS/TLS). O acesso é restrito aos usuários autorizados de cada organização.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32, marginBottom: 8 }}>5. Retenção de dados</h2>
      <p>Os dados são mantidos enquanto a conta da organização estiver ativa. Após o cancelamento, os dados são excluídos em até 30 dias mediante solicitação.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32, marginBottom: 8 }}>6. Direitos do usuário</h2>
      <p>Qualquer pessoa pode solicitar acesso, correção ou exclusão dos seus dados entrando em contato pelo e-mail <strong>fcintra4@hotmail.com</strong>.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32, marginBottom: 8 }}>7. Uso da API do WhatsApp Business (Meta)</h2>
      <p>Este aplicativo utiliza a API oficial do WhatsApp Business Cloud (Meta Platforms) para troca de mensagens comerciais. Os dados de mensagens são processados conforme os <a href="https://www.whatsapp.com/legal/business-policy/" style={{ color: '#2563eb' }}>Termos de Serviço do WhatsApp Business</a>.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32, marginBottom: 8 }}>8. Contato</h2>
      <p>Dúvidas sobre esta política: <strong>fcintra4@hotmail.com</strong></p>

      <p style={{ marginTop: 48, color: '#999', fontSize: 13 }}>NossoCRM · Araraquara, SP · Brasil</p>
    </main>
  );
}
