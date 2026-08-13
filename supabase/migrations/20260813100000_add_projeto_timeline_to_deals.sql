-- Migration: add_projeto_timeline_to_deals
-- Adiciona coluna JSONB para rastrear etapas do projeto de instalação solar.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS projeto_timeline JSONB DEFAULT NULL;

COMMENT ON COLUMN deals.projeto_timeline IS
  'Linha do tempo do projeto de instalação. Cada chave é uma etapa e o valor é a data de conclusão (ISO 8601). Ex: { "orcamento": "2026-01-15", "contrato": "2026-01-20", ... }';
