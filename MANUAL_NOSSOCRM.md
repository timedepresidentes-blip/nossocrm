# NossoCRM - Manual Completo do Usuário

## O que é o NossoCRM?

O NossoCRM é um sistema de gestão de relacionamento com clientes (CRM) completo, com inteligência artificial integrada, gestão de pipeline de vendas, mensagens (WhatsApp), contatos, atividades e relatórios.

---

## Como Acessar

- **URL na nuvem (Vercel):** será informada após o deploy
- **Instalar como App (PWA):** No Chrome, acesse a URL e clique no ícone de instalar na barra de endereço. O CRM ficará como um app no seu desktop/celular
- **Local (desenvolvimento):** `http://localhost:3000` (precisa rodar `npm start` na pasta do projeto)

---

## Navegação Principal

O CRM possui uma barra de navegação com as seguintes seções:

| Aba | Descrição |
|-----|-----------|
| **Inbox** | Central de tarefas e sugestões da IA |
| **Mensagens** | Conversas WhatsApp e outros canais |
| **Boards** | Pipeline de vendas (Kanban) |
| **Contatos** | Gestão de contatos e empresas |
| **Atividades** | Tarefas, reuniões e follow-ups |
| **Mais** | Dashboard, Relatórios, Configurações, Perfil |

---

## 1. Dashboard (Visão Geral)

**Caminho:** Menu "Mais" → Visão Geral

O Dashboard exibe um resumo completo do seu CRM:

- **Cards de métricas:** Total de negócios, valor do pipeline, contatos, empresas, negócios ganhos/perdidos, atividades do dia
- **Variação percentual:** Comparação com períodos anteriores (semana, mês, trimestre)
- **Gráfico de funil:** Visualização dos estágios do pipeline
- **Métricas de IA:** Performance do agente de IA (se configurado)
- **Métricas de Mensagens:** Volume de conversas, tempo de resposta
- **Feed de atividades:** Últimas atividades realizadas
- **Alertas do Pipeline:** Negócios parados ou em risco

**Filtro de período:** Selecione "Esta semana", "Este mês", "Este trimestre" etc.

---

## 2. Inbox (Central de Trabalho)

**Caminho:** Aba "Inbox"

O Inbox é seu centro de comando diário. Três modos de visualização:

### Modo Visão Geral
- Resumo rápido do dia: atividades atrasadas, reuniões, tarefas pendentes
- Sugestões da IA para ações

### Modo Lista
- Lista detalhada de todas as tarefas pendentes
- Filtros por tipo (atrasadas, hoje, próximas)
- Sugestões da IA expandíveis

### Modo Foco
- Uma tarefa por vez, estilo flashcard
- Botões de ação: Concluir, Adiar, Pular
- Navegação sequencial entre tarefas

**Ações disponíveis:**
- Completar atividade
- Adiar (snooze) para depois
- Descartar atividade
- Aceitar/rejeitar sugestões da IA

---

## 3. Mensagens (Messaging)

**Caminho:** Aba "Mensagens"

Central unificada de conversas com clientes via WhatsApp e outros canais.

### Lista de Conversas
- Todas as conversas organizadas por última mensagem
- Indicador de não lidas
- Status: aberta, pendente, fechada
- Busca por nome ou conteúdo

### Dentro de uma Conversa
- Enviar mensagens de texto
- Enviar imagens, documentos, áudio, vídeo
- Usar templates pré-aprovados (WhatsApp)
- Ver reações a mensagens
- Buscar mensagens dentro da conversa
- Marcar conversa como lida

### Templates
- Enviar templates do WhatsApp Business
- Sincronizar templates com o provedor

### Janela de 24h (WhatsApp)
- Indicador visual de quando a janela expira
- Após 24h sem resposta do cliente, só templates podem ser enviados

---

## 4. Boards (Pipeline de Vendas)

**Caminho:** Aba "Boards"

Gestão visual dos negócios em formato Kanban.

### Criando um Board
1. Clique em "+ Novo Board"
2. Use o **Assistente de IA** para gerar estrutura automaticamente:
   - Descreva seu negócio e a IA sugere estágios
   - Ou crie manualmente definindo os estágios

### Visualizações
- **Kanban:** Arraste cards entre estágios
- **Lista:** Visualização em tabela

### Gerenciando Negócios (Deals)
- **Criar:** Clique em "+" no estágio desejado
- **Mover:** Arraste o card para outro estágio
- **Detalhes:** Clique no card para ver/editar
  - Título, valor, contato associado
  - Notas e histórico
  - Produtos/serviços vinculados
  - Atividades relacionadas
- **Ganhar:** Marcar negócio como ganho
- **Perder:** Marcar como perdido (com motivo)
- **Reabrir:** Reativar negócio fechado

### Cockpit do Negócio
- Visão 360° de cada negócio
- Briefing gerado por IA
- Sugestões de próximos passos
- Rascunho de email por IA
- Respostas para objeções por IA

### Proteção contra Duplicatas
- O sistema impede criar dois negócios para o mesmo contato no mesmo estágio

---

## 5. Contatos

**Caminho:** Aba "Contatos"

### Abas de Visualização
- **Contatos:** Pessoas
- **Empresas:** Organizações

### Gerenciando Contatos
- **Criar:** Botão "+ Novo Contato"
- **Editar:** Clique no contato para abrir detalhes
- **Campos:** Nome, email, telefone, empresa, notas, tags, campos personalizados
- **Estágios do ciclo de vida:** Lead, Qualificado, Oportunidade, Cliente, etc.
- **Status:** Ativo, Inativo

### Funcionalidades Avançadas

**Importação:**
- Importar contatos via arquivo CSV
- Mapeamento de colunas

**Exportação:**
- Exportar contatos para CSV

**Detecção de Duplicatas:**
- Banner automático quando duplicatas são encontradas
- Comparação lado a lado

**Merge (Fusão):**
- Combinar dois contatos duplicados em um
- Dados são mesclados automaticamente (deals, conversas, atividades)
- Snapshot do contato original mantido no log

**Pausar IA:**
- Campo `ai_paused`: quando ativado, a IA não responde automaticamente para este contato

### Filtros
- Por estágio do ciclo de vida
- Por status (ativo/inativo)
- Busca por nome, email, telefone

---

## 6. Atividades

**Caminho:** Aba "Atividades"

Gerenciamento de tarefas e compromissos.

### Tipos de Atividade
- Tarefas
- Reuniões
- Ligações
- Follow-ups
- Notas

### Ações
- Criar nova atividade
- Vincular a contato e/ou negócio
- Definir data e horário
- Marcar como concluída
- Adiar

---

## 7. Relatórios

**Caminho:** Menu "Mais" → Relatórios

Análises e métricas do seu negócio.

### Métricas Disponíveis
- **Receita ganha:** Total e tendência ao longo do tempo
- **Taxa de conversão (Win Rate):** Percentual de negócios ganhos
- **Ciclo de vendas:** Tempo médio, mais rápido e mais lento
- **Valor do pipeline:** Total em aberto
- **Top Deals:** Maiores negócios
- **Motivos de perda:** Ranking dos motivos mais comuns
- **Gráfico de tendência:** Receita ao longo do tempo

### Filtros
- Período: semana, mês, trimestre, ano
- Board específico

### Exportar
- **Gerar PDF:** Botão para exportar relatório completo em PDF com logo da empresa

---

## 8. Configurações

**Caminho:** Menu "Mais" → Configurações

### Aba "Geral"
- **Página inicial:** Escolher qual tela abre ao iniciar o CRM
- **Tags:** Criar e gerenciar tags para organizar contatos/negócios
- **Campos personalizados:** Criar campos extras (texto, número, select, data, etc.)

### Aba "Produtos/Serviços" (Admin)
- Catálogo de produtos e serviços
- Vincular a negócios com quantidade e valor

### Aba "Unidades" (Admin)
- Criar unidades de negócio (filiais, equipes)
- Atribuir membros a unidades

### Aba "Integrações" (Admin)

**Canais (Messaging):**
- Configurar canais de WhatsApp (Z-API, Meta oficial)
- Conectar via QR Code
- Gerenciar múltiplos números

**Webhooks:**
- Configurar webhooks de entrada e saída
- Monitorar entregas

**API:**
- Gerar chaves de API (`ncrm_...`)
- Documentação da API REST pública
- Endpoints disponíveis: contatos, empresas, negócios, atividades, boards

**MCP (Model Context Protocol):**
- Conectar ferramentas de IA externas ao CRM

### Aba "Central de I.A."
- **Agente de IA por estágio:** Configurar prompts e comportamento da IA para cada estágio do pipeline
- **Templates de qualificação:** BANT, SPIN, MEDDIC, GPCT, Simple
- **Feature flags de IA:** Habilitar/desabilitar funcionalidades de IA
- **Prompt base:** Personalizar o tom e identidade da IA
- **Confiança HITL:** Configurar threshold para sugestões de avanço de estágio
- **Takeover automático:** Tempo para IA assumir conversa quando operador não responde
- **Limite de tokens:** Orçamento mensal de uso de IA

### Aba "Dados"
- Gerenciamento de armazenamento
- Limpeza de dados

### Aba "Equipe" (Admin)
- Listar membros da equipe
- Convidar novos usuários (por email)
- Definir roles: Admin ou Membro
- Remover usuários

---

## 9. Perfil

**Caminho:** Menu "Mais" → Perfil

- Editar nome e avatar
- Alterar senha
- Configurações pessoais

---

## 10. Funcionalidades de IA

O NossoCRM possui inteligência artificial integrada em várias áreas:

### Chat com IA
- Assistente de IA conversacional dentro do CRM
- Contexto dos seus dados (contatos, deals, atividades)

### Briefing de Negócio
- Resumo gerado por IA de cada negócio
- Histórico, contexto e próximos passos sugeridos

### Geração de Emails
- Rascunho de email para cada negócio

### Respostas para Objeções
- IA sugere como responder objeções comuns

### Qualificação Automática
- Templates: BANT, SPIN, MEDDIC, GPCT
- Score de qualificação automático

### HITL (Human-in-the-Loop)
- IA sugere avançar negócio de estágio
- Operador aprova ou rejeita
- Confiança mínima configurável

### Atendimento Automático
- IA responde mensagens de WhatsApp automaticamente
- Configurável por estágio do pipeline
- Takeover quando operador demora para responder
- Pode ser pausado por contato

### Geração de Estrutura de Board
- Descreva seu negócio e a IA cria os estágios do pipeline

---

## 11. API Pública

O CRM possui API REST completa para integrações externas.

### Endpoints Disponíveis
- `GET/POST /api/public/v1/contacts` — Listar e criar contatos
- `GET/PUT /api/public/v1/contacts/:id` — Detalhe e atualizar contato
- `GET/POST /api/public/v1/companies` — Empresas
- `GET/POST /api/public/v1/deals` — Negócios
- `POST /api/public/v1/deals/:id/mark-won` — Marcar como ganho
- `POST /api/public/v1/deals/:id/mark-lost` — Marcar como perdido
- `POST /api/public/v1/deals/:id/move-stage` — Mover de estágio
- `GET/POST /api/public/v1/boards` — Boards e estágios
- `GET/POST /api/public/v1/activities` — Atividades
- `GET /api/public/v1/me` — Dados do usuário autenticado
- `GET /api/public/v1/docs` — Documentação interativa
- `GET /api/public/v1/openapi.json` — Spec OpenAPI

### Autenticação
- Use uma API Key gerada em Configurações → Integrações → API
- Header: `Authorization: Bearer ncrm_...`

---

## 12. Decisões (IA)

**Caminho:** Menu "Decisões"

- Lista de sugestões da IA pendentes de aprovação
- Aprovar ou rejeitar avanços de estágio sugeridos pela IA
- Histórico de decisões

---

## 13. Atalhos e Dicas

- **Arrastar e soltar:** Mova negócios entre estágios no Kanban
- **Busca rápida:** Use a barra de busca em contatos e mensagens
- **PWA:** Instale como app para acesso rápido
- **Temas:** O CRM suporta modo claro e escuro
- **Responsivo:** Funciona em desktop e celular

---

## 14. Glossário

| Termo | Significado |
|-------|-------------|
| **Board** | Pipeline/funil de vendas com estágios |
| **Deal** | Negócio/oportunidade de venda |
| **Stage** | Estágio dentro de um pipeline |
| **Contact** | Pessoa (lead, prospect, cliente) |
| **Activity** | Tarefa, reunião ou follow-up |
| **HITL** | Human-in-the-Loop (aprovação humana para ações da IA) |
| **Takeover** | IA assume conversa quando operador demora |
| **PWA** | Progressive Web App (instalar como aplicativo) |
| **MCP** | Model Context Protocol (integração de IA) |

---

*Manual gerado em 2026-04-23 para NossoCRM v0.1.0*
