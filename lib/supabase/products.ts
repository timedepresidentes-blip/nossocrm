/**
 * @fileoverview Serviço Supabase para catálogo de produtos/serviços.
 *
 * Observação:
 * - O CRM é "adaptável": o catálogo é um acelerador (defaults).
 * - No deal, ainda permitimos itens personalizados (product_id pode ser NULL em deal_items).
 */

import { supabase } from './client';
import { Product, ProductCharacteristic, ProductCostItem } from '@/types';
import { sanitizeUUID } from './utils';

// =============================================================================
// Organization inference (client-side, RLS-safe)
// =============================================================================
let cachedOrgId: string | null = null;
let cachedOrgUserId: string | null = null;

async function getCurrentOrganizationId(): Promise<string | null> {
  if (!supabase) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  if (cachedOrgUserId === user.id && cachedOrgId) return cachedOrgId;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle();

  if (error) return null;

  const orgId = sanitizeUUID((profile as any)?.organization_id);
  cachedOrgUserId = user.id;
  cachedOrgId = orgId;
  return orgId;
}

type DbProduct = {
  id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  price: number;
  cost_price: number | null;
  cost_items: ProductCostItem[] | null;
  sku: string | null;
  observations: string | null;
  characteristics: ProductCharacteristic[] | null;
  active: boolean | null;
  created_at: string;
  updated_at: string;
  owner_id: string | null;
};

const PRODUCT_SELECT = 'id, organization_id, name, description, price, cost_price, cost_items, sku, observations, characteristics, active, created_at, updated_at, owner_id';

function transformProduct(db: DbProduct): Product {
  const costItems: ProductCostItem[] = db.cost_items?.length
    ? db.cost_items
    : db.cost_price && db.cost_price > 0
      ? [{ label: 'Custo', value: Number(db.cost_price) }]
      : [];

  const totalCost = costItems.reduce((s, i) => s + i.value, 0);

  return {
    id: db.id,
    organizationId: db.organization_id || undefined,
    name: db.name,
    description: db.description || undefined,
    price: Number(db.price ?? 0),
    costPrice: totalCost,
    costItems,
    sku: db.sku || undefined,
    observations: db.observations || undefined,
    characteristics: db.characteristics || [],
    active: db.active ?? true,
  };
}

export const productsService = {
  async getAll(): Promise<{ data: Product[]; error: Error | null }> {
    try {
      if (!supabase) return { data: [], error: new Error('Supabase não configurado') };

      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .order('created_at', { ascending: false });

      if (error) return { data: [], error };

      const rows = (data || []) as DbProduct[];
      // Por padrão mostramos só ativos na UI do deal; mas aqui retorna tudo para o Settings.
      return { data: rows.map(transformProduct), error: null };
    } catch (e) {
      return { data: [], error: e as Error };
    }
  },

  async getActive(): Promise<{ data: Product[]; error: Error | null }> {
    try {
      if (!supabase) return { data: [], error: new Error('Supabase não configurado') };

      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (error) return { data: [], error };

      const rows = (data || []) as DbProduct[];
      return { data: rows.map(transformProduct), error: null };
    } catch (e) {
      return { data: [], error: e as Error };
    }
  },

  async create(input: { name: string; price: number; costPrice?: number; costItems?: ProductCostItem[]; sku?: string; description?: string; observations?: string; characteristics?: ProductCharacteristic[] }): Promise<{ data: Product | null; error: Error | null }> {
    try {
      if (!supabase) return { data: null, error: new Error('Supabase não configurado') };

      const { data: { user } } = await supabase.auth.getUser();
      const organizationId = await getCurrentOrganizationId();
      const costItems = input.costItems ?? [];
      const totalCost = costItems.reduce((s, i) => s + i.value, 0);

      const { data, error } = await supabase
        .from('products')
        .insert({
          name: input.name,
          price: input.price,
          cost_price: totalCost,
          cost_items: costItems,
          sku: input.sku || null,
          description: input.description || null,
          observations: input.observations || null,
          characteristics: input.characteristics ?? [],
          active: true,
          owner_id: sanitizeUUID(user?.id),
          organization_id: organizationId,
        })
        .select(PRODUCT_SELECT)
        .single();

      if (error) return { data: null, error };
      return { data: transformProduct(data as DbProduct), error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  async update(id: string, updates: Partial<{ name: string; price: number; costPrice: number; costItems: ProductCostItem[]; sku?: string; description?: string; observations?: string; characteristics?: ProductCharacteristic[]; active: boolean }>): Promise<{ error: Error | null }> {
    try {
      if (!supabase) return { error: new Error('Supabase não configurado') };

      const payload: Record<string, unknown> = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.price !== undefined) payload.price = updates.price;
      if (updates.costItems !== undefined) {
        payload.cost_items = updates.costItems;
        payload.cost_price = updates.costItems.reduce((s, i) => s + i.value, 0);
      } else if (updates.costPrice !== undefined) {
        payload.cost_price = updates.costPrice;
      }
      if (updates.sku !== undefined) payload.sku = updates.sku || null;
      if (updates.description !== undefined) payload.description = updates.description || null;
      if (updates.observations !== undefined) payload.observations = updates.observations || null;
      if (updates.characteristics !== undefined) payload.characteristics = updates.characteristics;
      if (updates.active !== undefined) payload.active = updates.active;
      payload.updated_at = new Date().toISOString();

      const { error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', sanitizeUUID(id));

      return { error: error ?? null };
    } catch (e) {
      return { error: e as Error };
    }
  },

  async delete(id: string): Promise<{ error: Error | null }> {
    try {
      if (!supabase) return { error: new Error('Supabase não configurado') };
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', sanitizeUUID(id));

      return { error: error ?? null };
    } catch (e) {
      return { error: e as Error };
    }
  },
};

