-- Adiciona custo de instalação ao deal e taxa por kWp nas configurações da org

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS custo_instalacao NUMERIC DEFAULT 0;

ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS custo_instalacao_por_kwp NUMERIC DEFAULT 190;
