/**
 * Evolution API Webhook Handler
 *
 * Recebe eventos da Evolution API (mensagens, status, conexão) e processa:
 * - messages.upsert → cria/atualiza conversa + insere mensagem + aciona IA
 * - messages.update → atualiza status da mensagem
 * - connection.update → log de estado
 *
 * Rota:
 * - `POST /functions/v1/messaging-webhook-evolution/<channel_id>`
 *
 * Deploy:
 * - `supabase functions deploy messaging-webhook-evolution --no-verify-jwt`
 */
import { createClient } from "npm:@supabase/supabase-js@2";

// =============================================================================
// TYPES
// =============================================================================

interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: Record<string, unknown>;
  destination?: string;
  server_url?: string;
  apikey?: string;
}

interface EvolutionMessageData {
  key?: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  pushName?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text: string };
    imageMessage?: { url: string; mimetype: string; caption?: string };
    videoMessage?: { url: string; mimetype: string; caption?: string };
    audioMessage?: { url: string; mimetype: string; ptt?: boolean };
    documentMessage?: {
      url: string;
      mimetype: string;
      fileName?: string;
      caption?: string;
    };
    stickerMessage?: { url: string; mimetype: string };
    locationMessage?: {
      degreesLatitude: number;
      degreesLongitude: number;
      name?: string;
      address?: string;
    };
  };
  messageType?: string;
  messageTimestamp?: number;
  source?: string;
}

interface EvolutionStatusData {
  key?: { remoteJid: string; fromMe: boolean; id: string };
  status?: string | number;
}

interface MessageContent {
  type: string;
  text?: string;
  mediaUrl?: string;
  mimeType?: string;
  caption?: string;
  fileName?: string;
  latitude?: number;
  longitude?: number;
  name?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function getChannelIdFromPath(req: Request): string | null {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.findIndex((p) => p === "messaging-webhook-evolution");
  if (idx === -1) return null;
  return parts[idx + 1] ?? null;
}

function normalizePhone(remoteJid?: string): string | null {
  if (!remoteJid) return null;
  const digits = remoteJid.replace(/@.*$/, "").replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

function extractContent(data: EvolutionMessageData): MessageContent {
  const msg = data.message;
  if (!msg) return { type: "text", text: "[sem conteúdo]" };

  if (msg.conversation) return { type: "text", text: msg.conversation };
  if (msg.extendedTextMessage)
    return { type: "text", text: msg.extendedTextMessage.text };

  if (msg.imageMessage) {
    return {
      type: "image",
      mediaUrl: msg.imageMessage.url,
      mimeType: msg.imageMessage.mimetype || "image/jpeg",
      caption: msg.imageMessage.caption,
    };
  }
  if (msg.videoMessage) {
    return {
      type: "video",
      mediaUrl: msg.videoMessage.url,
      mimeType: msg.videoMessage.mimetype || "video/mp4",
      caption: msg.videoMessage.caption,
    };
  }
  if (msg.audioMessage) {
    return {
      type: "audio",
      mediaUrl: msg.audioMessage.url,
      mimeType: msg.audioMessage.mimetype || "audio/ogg",
    };
  }
  if (msg.documentMessage) {
    return {
      type: "document",
      mediaUrl: msg.documentMessage.url,
      fileName: msg.documentMessage.fileName || "document",
      mimeType: msg.documentMessage.mimetype || "application/pdf",
    };
  }
  if (msg.stickerMessage) {
    return {
      type: "sticker",
      mediaUrl: msg.stickerMessage.url,
      mimeType: "image/webp",
    };
  }
  if (msg.locationMessage) {
    return {
      type: "location",
      latitude: msg.locationMessage.degreesLatitude,
      longitude: msg.locationMessage.degreesLongitude,
      name: msg.locationMessage.name,
    };
  }

  return { type: "text", text: `[${data.messageType || "unknown"}]` };
}

function getMessagePreview(content: MessageContent): string {
  switch (content.type) {
    case "text":
      return (content.text || "").slice(0, 100);
    case "image":
      return content.caption || "[Imagem]";
    case "video":
      return content.caption || "[Vídeo]";
    case "audio":
      return "[Áudio]";
    case "document":
      return content.fileName || "[Documento]";
    case "sticker":
      return "[Sticker]";
    case "location":
      return content.name || "[Localização]";
    default:
      return "[Mensagem]";
  }
}

async function triggerAIProcessing(params: {
  conversationId: string;
  organizationId: string;
  messageText: string;
  messageId?: string;
}): Promise<void> {
  const appUrl =
    Deno.env.get("CRM_APP_URL") ?? "https://nossocrm-blush.vercel.app";
  const internalSecret =
    Deno.env.get("INTERNAL_API_SECRET") ??
    "314d1b5f953d6dd536f4a1740856ad6238d53be6cb77d234893ef3dceef96d78";

  try {
    const response = await fetch(`${appUrl}/api/messaging/ai/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": internalSecret,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[Evolution] AI processing failed: ${response.status} ${text}`);
      return;
    }
    console.log("[Evolution] AI processing triggered OK");
  } catch (error) {
    console.error("[Evolution] AI trigger error:", error);
  }
}

// =============================================================================
// LEAD ROUTING
// =============================================================================

async function getLeadRoutingRule(
  supabase: ReturnType<typeof createClient>,
  channelId: string
): Promise<{ boardId: string; stageId: string | null } | null> {
  const { data, error } = await supabase
    .from("lead_routing_rules")
    .select("board_id, stage_id, enabled")
    .eq("channel_id", channelId)
    .maybeSingle();

  if (error || !data?.enabled || !data.board_id) return null;
  return { boardId: data.board_id, stageId: data.stage_id };
}

async function autoCreateDeal(
  supabase: ReturnType<typeof createClient>,
  params: {
    organizationId: string;
    contactId: string;
    boardId: string;
    stageId?: string | null;
    conversationId: string;
    contactName: string;
    businessUnitName: string;
  }
) {
  try {
    let stageId = params.stageId;
    if (!stageId) {
      const { data: firstStage } = await supabase
        .from("board_stages")
        .select("id")
        .eq("board_id", params.boardId)
        .order("order", { ascending: true })
        .limit(1)
        .single();
      if (!firstStage) return;
      stageId = firstStage.id;
    }

    const { data: newDeal, error: dealErr } = await supabase
      .from("deals")
      .insert({
        organization_id: params.organizationId,
        board_id: params.boardId,
        stage_id: stageId,
        contact_id: params.contactId,
        title: `${params.contactName} - WhatsApp`,
        value: 0,
        source: "whatsapp",
        metadata: {
          auto_created: true,
          created_from: "evolution_webhook",
          conversation_id: params.conversationId,
          business_unit: params.businessUnitName,
        },
      })
      .select("id")
      .single();

    if (dealErr) {
      console.error("[Evolution] Error creating deal:", dealErr);
      return;
    }

    console.log(`[Evolution] Auto-created deal: ${newDeal.id}`);

    const { data: conv } = await supabase
      .from("messaging_conversations")
      .select("metadata")
      .eq("id", params.conversationId)
      .maybeSingle();

    await supabase
      .from("messaging_conversations")
      .update({
        metadata: {
          ...((conv?.metadata as Record<string, unknown>) || {}),
          deal_id: newDeal.id,
          auto_created_deal: true,
        },
      })
      .eq("id", params.conversationId);
  } catch (error) {
    console.error("[Evolution] autoCreateDeal error:", error);
  }
}

// =============================================================================
// INBOUND MESSAGE HANDLER
// =============================================================================

async function handleMessageUpsert(
  supabase: ReturnType<typeof createClient>,
  channel: {
    id: string;
    organization_id: string;
    business_unit_id: string;
    business_unit?: { id: string; name: string } | null;
  },
  data: EvolutionMessageData
) {
  if (!data.key || data.key.fromMe) {
    console.log("[Evolution] Ignoring own message or missing key");
    return;
  }

  const phone = normalizePhone(data.key.remoteJid);
  if (!phone) throw new Error("remoteJid inválido");

  // Ignore group messages
  if (data.key.remoteJid?.includes("@g.us")) {
    console.log("[Evolution] Ignoring group message");
    return;
  }

  const externalMessageId = data.key.id;
  const content = extractContent(data);
  const timestamp = data.messageTimestamp
    ? new Date(data.messageTimestamp * 1000)
    : new Date();

  // Find or create conversation
  const { data: existingConv } = await supabase
    .from("messaging_conversations")
    .select("id, contact_id, unread_count, message_count")
    .eq("channel_id", channel.id)
    .eq("external_contact_id", phone)
    .maybeSingle();

  let conversationId: string;
  let contactId: string | null = null;
  let isNewConversation = false;

  if (existingConv) {
    conversationId = existingConv.id;
    contactId = existingConv.contact_id;
  } else {
    isNewConversation = true;

    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", channel.organization_id)
      .eq("phone", phone)
      .is("deleted_at", null)
      .order("created_at")
      .limit(1)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
    } else {
      const contactName = data.pushName || phone;
      const { data: newContact } = await supabase
        .from("contacts")
        .insert({
          organization_id: channel.organization_id,
          name: contactName,
          phone,
          source: "whatsapp",
          metadata: {
            auto_created: true,
            created_from: "evolution_webhook",
            whatsapp_name: data.pushName,
            business_unit_id: channel.business_unit_id,
          },
        })
        .select("id")
        .single();

      if (newContact) {
        contactId = newContact.id;
        console.log(`[Evolution] Auto-created contact: ${contactId}`);
      }
    }

    const { data: newConv, error: convErr } = await supabase
      .from("messaging_conversations")
      .insert({
        organization_id: channel.organization_id,
        channel_id: channel.id,
        business_unit_id: channel.business_unit_id,
        external_contact_id: phone,
        external_contact_name: data.pushName || phone,
        contact_id: contactId,
        status: "open",
        priority: "normal",
      })
      .select("id")
      .single();

    if (convErr) throw convErr;
    conversationId = newConv.id;

    if (contactId) {
      const routingRule = await getLeadRoutingRule(supabase, channel.id);
      if (routingRule) {
        await autoCreateDeal(supabase, {
          organizationId: channel.organization_id,
          contactId,
          boardId: routingRule.boardId,
          stageId: routingRule.stageId,
          conversationId,
          contactName: data.pushName || phone,
          businessUnitName: channel.business_unit?.name || "Sem unidade",
        });
      }
    }
  }

  // Insert message
  const { error: msgErr } = await supabase.from("messaging_messages").insert({
    conversation_id: conversationId,
    external_id: externalMessageId,
    direction: "inbound",
    content_type: content.type,
    content,
    status: "delivered",
    delivered_at: timestamp.toISOString(),
    sender_name: data.pushName,
    metadata: {
      evolution_source: data.source,
      message_type: data.messageType,
    },
  });

  if (msgErr && !msgErr.message.toLowerCase().includes("duplicate")) {
    throw msgErr;
  }

  // Update conversation
  await supabase
    .from("messaging_conversations")
    .update({
      last_message_at: timestamp.toISOString(),
      last_message_preview: getMessagePreview(content),
      last_message_direction: "inbound",
      status: "open",
    })
    .eq("id", conversationId);

  // Trigger AI (text messages only)
  if (content.type === "text" && content.text) {
    triggerAIProcessing({
      conversationId,
      organizationId: channel.organization_id,
      messageText: content.text,
      messageId: externalMessageId,
    }).catch((err) => console.error("[Evolution] AI trigger error:", err));
  }
}

// =============================================================================
// STATUS UPDATE HANDLER
// =============================================================================

async function handleMessageUpdate(
  supabase: ReturnType<typeof createClient>,
  data: EvolutionStatusData
) {
  if (!data.key?.id) return;

  const statusMap: Record<string, string> = {
    DELIVERY_ACK: "delivered",
    READ: "read",
    PLAYED: "read",
    "3": "delivered",
    "4": "read",
    "5": "read",
  };

  const newStatus = statusMap[String(data.status)];
  if (!newStatus) return;

  const { data: result, error } = await supabase.rpc(
    "update_message_status_if_newer",
    {
      p_external_id: data.key.id,
      p_new_status: newStatus,
      p_timestamp: new Date().toISOString(),
      p_error_code: null,
      p_error_message: null,
    }
  );

  if (error) {
    console.error(`[Evolution] Status update RPC error:`, error);
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Método não permitido" });
  }

  const channelId = getChannelIdFromPath(req);
  if (!channelId) {
    return json(404, { error: "channel_id ausente na URL" });
  }

  let payload: EvolutionWebhookPayload;
  try {
    payload = (await req.json()) as EvolutionWebhookPayload;
  } catch {
    return json(400, { error: "JSON inválido" });
  }

  if (!payload.event) {
    return json(400, { error: "Campo 'event' ausente" });
  }

  // Setup Supabase
  const supabaseUrl =
    Deno.env.get("CRM_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
  const serviceKey =
    Deno.env.get("CRM_SUPABASE_SECRET_KEY") ??
    Deno.env.get("CRM_SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: "Supabase não configurado" });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Fetch channel
  const { data: channel, error: channelErr } = await supabase
    .from("messaging_channels")
    .select(`
      id,
      organization_id,
      business_unit_id,
      external_identifier,
      credentials,
      status,
      business_unit:business_units(id, name)
    `)
    .eq("id", channelId)
    .is("deleted_at", null)
    .maybeSingle();

  if (channelErr || !channel) {
    return json(404, { error: "Canal não encontrado" });
  }

  // Validate apikey if channel has one configured
  const channelApiKey = (channel.credentials as Record<string, unknown>)
    ?.webhookApiKey;
  if (channelApiKey) {
    const reqApiKey =
      req.headers.get("apikey") || req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!reqApiKey || String(channelApiKey) !== String(reqApiKey)) {
      return json(401, { error: "API key inválida" });
    }
  }

  // Log webhook event for dedup
  const eventId = `evo_${payload.event}_${
    (payload.data as EvolutionMessageData)?.key?.id ||
    Date.now().toString(36)
  }`;

  const { error: eventInsertErr } = await supabase
    .from("messaging_webhook_events")
    .insert({
      channel_id: channelId,
      event_type: payload.event,
      external_event_id: eventId,
      payload: payload as unknown as Record<string, unknown>,
      processed: false,
    });

  if (eventInsertErr?.message?.toLowerCase().includes("duplicate")) {
    return json(200, { ok: true, duplicate: true });
  }

  // Skip non-message events
  const SKIP_EVENTS = new Set([
    "connection.update",
    "presence.update",
    "contacts.update",
    "contacts.upsert",
    "groups.update",
    "groups.upsert",
    "chats.update",
    "chats.upsert",
    "chats.delete",
    "labels.edit",
    "labels.association",
  ]);

  if (SKIP_EVENTS.has(payload.event)) {
    await supabase
      .from("messaging_webhook_events")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("channel_id", channelId)
      .eq("external_event_id", eventId);
    return json(200, { ok: true, skipped: true, event: payload.event });
  }

  try {
    if (payload.event === "messages.upsert") {
      await handleMessageUpsert(
        supabase,
        channel,
        payload.data as EvolutionMessageData
      );
    } else if (payload.event === "messages.update") {
      await handleMessageUpdate(supabase, payload.data as EvolutionStatusData);
    } else if (payload.event === "send.message") {
      // Outbound confirmation — just mark as processed
    }

    await supabase
      .from("messaging_webhook_events")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("channel_id", channelId)
      .eq("external_event_id", eventId);

    return json(200, { ok: true, event: payload.event });
  } catch (error) {
    console.error("[Evolution] Webhook error:", error);

    await supabase
      .from("messaging_webhook_events")
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      })
      .eq("channel_id", channelId)
      .eq("external_event_id", eventId);

    return json(200, {
      ok: false,
      error: error instanceof Error ? error.message : "Erro ao processar",
    });
  }
});
