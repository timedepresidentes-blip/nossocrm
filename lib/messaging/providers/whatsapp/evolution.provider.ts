/**
 * @fileoverview Evolution API WhatsApp Provider
 *
 * WhatsApp provider usando Evolution API (open source, self-hosted).
 * Alternativa gratuita ao Z-API com funcionalidades similares.
 *
 * @see https://doc.evolution-api.com
 * @module lib/messaging/providers/whatsapp/evolution
 */

import { BaseChannelProvider } from '../base.provider';
import type {
  ChannelType,
  ProviderConfig,
  ValidationResult,
  ValidationError,
  ConnectionStatusResult,
  QrCodeResult,
  SendMessageParams,
  SendMessageResult,
  WebhookHandlerResult,
  MessageReceivedEvent,
  StatusUpdateEvent,
  ErrorEvent,
  MessageContent,
  TextContent,
  ImageContent,
  DocumentContent,
  AudioContent,
  VideoContent,
  StickerContent,
  LocationContent,
  ReactionContent,
  MessageStatus,
} from '../../types';

// =============================================================================
// TYPES
// =============================================================================

export interface EvolutionCredentials {
  serverUrl: string;
  apiKey: string;
  instanceName: string;
}

interface EvolutionConnectionState {
  instance?: { instanceName: string; state: string };
  state?: string;
}

interface EvolutionQrCodeResponse {
  pairingCode?: string | null;
  code?: string;
  base64?: string;
  count?: number;
}

interface EvolutionSendResponse {
  key?: { remoteJid: string; fromMe: boolean; id: string };
  message?: Record<string, unknown>;
  messageTimestamp?: string | number;
  status?: string;
}

export interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: EvolutionMessageData | EvolutionStatusData | EvolutionConnectionData;
  destination?: string;
  server_url?: string;
  apikey?: string;
}

interface EvolutionMessageData {
  key?: { remoteJid: string; fromMe: boolean; id: string };
  pushName?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text: string };
    imageMessage?: { url: string; mimetype: string; caption?: string };
    videoMessage?: { url: string; mimetype: string; caption?: string };
    audioMessage?: { url: string; mimetype: string; ptt?: boolean };
    documentMessage?: { url: string; mimetype: string; fileName?: string; caption?: string };
    stickerMessage?: { url: string; mimetype: string };
    locationMessage?: { degreesLatitude: number; degreesLongitude: number; name?: string; address?: string };
    reactionMessage?: { key: Record<string, unknown>; text: string };
  };
  messageType?: string;
  messageTimestamp?: number;
  instanceId?: string;
  source?: string;
}

interface EvolutionStatusData {
  key?: { remoteJid: string; fromMe: boolean; id: string };
  status?: string | number;
  ids?: string[];
}

interface EvolutionConnectionData {
  state?: string;
  statusReason?: number;
}

// =============================================================================
// PROVIDER
// =============================================================================

export class EvolutionWhatsAppProvider extends BaseChannelProvider {
  readonly channelType: ChannelType = 'whatsapp';
  readonly providerName = 'evolution';

  private serverUrl: string = '';
  private apiKey: string = '';
  private instanceName: string = '';

  async initialize(config: ProviderConfig): Promise<void> {
    await super.initialize(config);
    const creds = config.credentials as unknown as EvolutionCredentials;
    this.serverUrl = creds.serverUrl.replace(/\/+$/, '');
    this.apiKey = creds.apiKey;
    this.instanceName = creds.instanceName;
    this.log('info', 'Evolution provider initialized', { instanceName: this.instanceName });
  }

  async disconnect(): Promise<void> {
    this.log('info', 'Evolution provider disconnected');
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  async getStatus(): Promise<ConnectionStatusResult> {
    try {
      const res = await this.request<EvolutionConnectionState>(
        'GET',
        `/instance/connectionState/${this.instanceName}`
      );
      const state = res.instance?.state || res.state || 'unknown';

      if (state === 'open') {
        return { status: 'connected', message: 'Conectado ao WhatsApp' };
      }
      if (state === 'connecting') {
        return { status: 'connecting', message: 'Conectando... escaneie o QR code' };
      }
      return { status: 'disconnected', message: 'Desconectado. Escaneie o QR code para conectar.' };
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : 'Erro desconhecido' };
    }
  }

  async getQrCode(): Promise<QrCodeResult> {
    const res = await this.request<EvolutionQrCodeResponse>(
      'GET',
      `/instance/connect/${this.instanceName}`
    );

    if (!res.base64 && !res.code) {
      throw new Error('QR code não disponível. A instância pode já estar conectada.');
    }

    return {
      qrCode: res.base64 || res.code || '',
      expiresAt: new Date(Date.now() + 45_000).toISOString(),
    };
  }

  async configureWebhook(webhookUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request('POST', `/webhook/set/${this.instanceName}`, {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: [
          'messages.upsert',
          'messages.update',
          'connection.update',
          'send.message',
        ],
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' };
    }
  }

  // ---------------------------------------------------------------------------
  // Messaging
  // ---------------------------------------------------------------------------

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const { to, content, replyToExternalId } = params;
    try {
      const number = to.replace(/\D/g, '');
      let response: EvolutionSendResponse;

      switch (content.type) {
        case 'text':
          response = await this.sendText(number, content as TextContent, replyToExternalId);
          break;
        case 'image':
          response = await this.sendMedia(number, content as ImageContent, 'image', replyToExternalId);
          break;
        case 'video':
          response = await this.sendMedia(number, content as VideoContent, 'video', replyToExternalId);
          break;
        case 'audio':
          response = await this.sendAudio(number, content as AudioContent, replyToExternalId);
          break;
        case 'document':
          response = await this.sendMedia(number, content as DocumentContent, 'document', replyToExternalId);
          break;
        case 'sticker':
          response = await this.sendSticker(number, content as StickerContent, replyToExternalId);
          break;
        case 'location':
          response = await this.sendLocation(number, content as LocationContent, replyToExternalId);
          break;
        case 'reaction':
          response = await this.sendReaction(number, content as ReactionContent);
          break;
        default:
          return this.errorResult('UNSUPPORTED_CONTENT', `Tipo "${content.type}" não suportado`);
      }

      const externalId = response.key?.id;
      if (!externalId) {
        return this.errorResult('NO_MESSAGE_ID', 'Resposta sem ID de mensagem');
      }
      return this.successResult(externalId);
    } catch (error) {
      this.log('error', 'Falha ao enviar mensagem', { error, to, type: content.type });
      return this.errorResult('REQUEST_FAILED', error instanceof Error ? error.message : 'Erro desconhecido');
    }
  }

  private async sendText(number: string, content: TextContent, quoted?: string): Promise<EvolutionSendResponse> {
    const body: Record<string, unknown> = { number, text: content.text };
    if (quoted) body.quoted = { key: { id: quoted } };
    return this.request('POST', `/message/sendText/${this.instanceName}`, body);
  }

  private async sendMedia(
    number: string,
    content: ImageContent | VideoContent | DocumentContent,
    mediatype: string,
    quoted?: string
  ): Promise<EvolutionSendResponse> {
    const body: Record<string, unknown> = {
      number,
      mediatype,
      media: content.mediaUrl,
      mimetype: content.mimeType,
    };
    if ('caption' in content && content.caption) body.caption = content.caption;
    if ('fileName' in content && content.fileName) body.fileName = content.fileName;
    if (quoted) body.quoted = { key: { id: quoted } };
    return this.request('POST', `/message/sendMedia/${this.instanceName}`, body);
  }

  private async sendAudio(number: string, content: AudioContent, quoted?: string): Promise<EvolutionSendResponse> {
    const body: Record<string, unknown> = { number, audio: content.mediaUrl };
    if (quoted) body.quoted = { key: { id: quoted } };
    return this.request('POST', `/message/sendWhatsAppAudio/${this.instanceName}`, body);
  }

  private async sendSticker(number: string, content: StickerContent, quoted?: string): Promise<EvolutionSendResponse> {
    const body: Record<string, unknown> = { number, sticker: content.mediaUrl };
    if (quoted) body.quoted = { key: { id: quoted } };
    return this.request('POST', `/message/sendSticker/${this.instanceName}`, body);
  }

  private async sendLocation(number: string, content: LocationContent, quoted?: string): Promise<EvolutionSendResponse> {
    const body: Record<string, unknown> = {
      number,
      latitude: content.latitude,
      longitude: content.longitude,
      name: content.name || '',
      address: content.address || '',
    };
    if (quoted) body.quoted = { key: { id: quoted } };
    return this.request('POST', `/message/sendLocation/${this.instanceName}`, body);
  }

  private async sendReaction(number: string, content: ReactionContent): Promise<EvolutionSendResponse> {
    return this.request('POST', `/message/sendReaction/${this.instanceName}`, {
      key: { remoteJid: `${number}@s.whatsapp.net`, id: content.messageId },
      reaction: content.emoji,
    });
  }

  // ---------------------------------------------------------------------------
  // Webhook Handler
  // ---------------------------------------------------------------------------

  async handleWebhook(payload: unknown): Promise<WebhookHandlerResult> {
    const data = payload as EvolutionWebhookPayload;

    if (data.event === 'messages.upsert') {
      return this.handleMessageUpsert(data.data as EvolutionMessageData, payload);
    }

    if (data.event === 'messages.update') {
      return this.handleMessageUpdate(data.data as EvolutionStatusData, payload);
    }

    if (data.event === 'connection.update') {
      const connData = data.data as EvolutionConnectionData;
      const errorData: ErrorEvent = {
        type: 'error',
        code: 'CONNECTION_UPDATE',
        message: `Estado: ${connData.state || 'unknown'}`,
        timestamp: new Date(),
      };
      return { type: 'error', data: errorData, raw: payload };
    }

    const errorData: ErrorEvent = {
      type: 'error',
      code: 'UNKNOWN_EVENT',
      message: `Evento desconhecido: ${data.event}`,
      timestamp: new Date(),
    };
    return { type: 'error', data: errorData, raw: payload };
  }

  private handleMessageUpsert(data: EvolutionMessageData, raw: unknown): WebhookHandlerResult {
    if (!data.key || data.key.fromMe) {
      const errorData: ErrorEvent = {
        type: 'error',
        code: 'IGNORED',
        message: 'Mensagem própria ou sem key',
        timestamp: new Date(),
      };
      return { type: 'error', data: errorData, raw };
    }

    const content = this.extractContent(data);
    const phone = data.key.remoteJid?.replace(/@.*$/, '') || '';
    const timestamp = data.messageTimestamp
      ? new Date(data.messageTimestamp * 1000)
      : new Date();

    const event: MessageReceivedEvent = {
      type: 'message_received',
      from: phone,
      fromName: data.pushName,
      content,
      externalMessageId: data.key.id,
      timestamp,
    };

    return { type: 'message_received', externalId: data.key.id, data: event, raw };
  }

  private handleMessageUpdate(data: EvolutionStatusData, raw: unknown): WebhookHandlerResult {
    const statusMap: Record<string, MessageStatus> = {
      'DELIVERY_ACK': 'delivered',
      'READ': 'read',
      'PLAYED': 'read',
      '3': 'delivered',
      '4': 'read',
      '5': 'read',
    };

    const status = statusMap[String(data.status)] || 'sent';
    const event: StatusUpdateEvent = {
      type: 'status_update',
      externalMessageId: data.key?.id || '',
      status,
      timestamp: new Date(),
    };

    return { type: 'status_update', externalId: data.key?.id, data: event, raw };
  }

  private extractContent(data: EvolutionMessageData): MessageContent {
    const msg = data.message;
    if (!msg) return { type: 'text', text: '[sem conteúdo]' };

    if (msg.conversation) return { type: 'text', text: msg.conversation };
    if (msg.extendedTextMessage) return { type: 'text', text: msg.extendedTextMessage.text };

    if (msg.imageMessage) {
      return {
        type: 'image',
        mediaUrl: msg.imageMessage.url,
        mimeType: msg.imageMessage.mimetype || 'image/jpeg',
        caption: msg.imageMessage.caption,
      };
    }

    if (msg.videoMessage) {
      return {
        type: 'video',
        mediaUrl: msg.videoMessage.url,
        mimeType: msg.videoMessage.mimetype || 'video/mp4',
        caption: msg.videoMessage.caption,
      };
    }

    if (msg.audioMessage) {
      return {
        type: 'audio',
        mediaUrl: msg.audioMessage.url,
        mimeType: msg.audioMessage.mimetype || 'audio/ogg',
      };
    }

    if (msg.documentMessage) {
      return {
        type: 'document',
        mediaUrl: msg.documentMessage.url,
        fileName: msg.documentMessage.fileName || 'document',
        mimeType: msg.documentMessage.mimetype || 'application/pdf',
      };
    }

    if (msg.stickerMessage) {
      return { type: 'sticker', mediaUrl: msg.stickerMessage.url, mimeType: 'image/webp' };
    }

    if (msg.locationMessage) {
      return {
        type: 'location',
        latitude: msg.locationMessage.degreesLatitude,
        longitude: msg.locationMessage.degreesLongitude,
        name: msg.locationMessage.name,
      };
    }

    return { type: 'text', text: `[${data.messageType || 'unknown'}]` };
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  validateConfig(config: ProviderConfig): ValidationResult {
    const base = super.validateConfig(config);
    if (!base.valid) return base;

    const errors: ValidationError[] = [];
    const creds = config.credentials as unknown as EvolutionCredentials;

    if (!creds.serverUrl) {
      errors.push({ field: 'credentials.serverUrl', message: 'URL do servidor é obrigatória', code: 'REQUIRED' });
    }
    if (!creds.apiKey) {
      errors.push({ field: 'credentials.apiKey', message: 'API Key é obrigatória', code: 'REQUIRED' });
    }
    if (!creds.instanceName) {
      errors.push({ field: 'credentials.instanceName', message: 'Nome da instância é obrigatório', code: 'REQUIRED' });
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  // ---------------------------------------------------------------------------
  // HTTP Client
  // ---------------------------------------------------------------------------

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.serverUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: this.apiKey,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Evolution API ${response.status}: ${text.slice(0, 300)}`);
    }

    return JSON.parse(text) as T;
  }
}

export default EvolutionWhatsAppProvider;
