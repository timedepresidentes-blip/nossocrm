'use client';

import React, { useState } from 'react';
import { Plus, Pencil, Trash2, X, Check, Zap } from 'lucide-react';
import {
  useQuickReplies,
  useCreateQuickReply,
  useUpdateQuickReply,
  useDeleteQuickReply,
  type QuickReply,
} from '@/lib/query/hooks/useQuickRepliesQuery';

interface FormState {
  shortcut: string;
  title: string;
  content: string;
}

const EMPTY: FormState = { shortcut: '', title: '', content: '' };

export function QuickRepliesSection() {
  const { data: replies = [], isLoading } = useQuickReplies();
  const create = useCreateQuickReply();
  const update = useUpdateQuickReply();
  const del = useDeleteQuickReply();

  const [editing, setEditing] = useState<string | null>(null); // id or 'new'
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState('');

  const startNew = () => { setEditing('new'); setForm(EMPTY); setError(''); };
  const startEdit = (r: QuickReply) => {
    setEditing(r.id);
    setForm({ shortcut: r.shortcut, title: r.title, content: r.content });
    setError('');
  };
  const cancel = () => { setEditing(null); setError(''); };

  const validate = (): boolean => {
    if (!form.shortcut.trim()) { setError('Atalho obrigatório'); return false; }
    if (!form.title.trim())    { setError('Título obrigatório'); return false; }
    if (!form.content.trim())  { setError('Mensagem obrigatória'); return false; }
    if (!/^[a-z0-9_-]+$/i.test(form.shortcut.replace(/^\//, ''))) {
      setError('Atalho deve conter apenas letras, números, _ ou -');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      if (editing === 'new') {
        await create.mutateAsync(form);
      } else {
        await update.mutateAsync({ id: editing!, ...form });
      }
      setEditing(null);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      const msg = (e as { message?: string })?.message ?? '';
      setError(code === '23505' || msg.includes('unique') ? 'Esse atalho já existe' : 'Erro ao salvar');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir essa resposta rápida?')) return;
    await del.mutateAsync(id);
    if (editing === id) setEditing(null);
  };

  const field = (key: keyof FormState, label: string, placeholder: string, multiline = false) => (
    <div>
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</label>
      {multiline ? (
        <textarea
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          rows={3}
          className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500/50 resize-none"
        />
      ) : (
        <input
          type="text"
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
        />
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            Respostas Rápidas
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Digite <code className="bg-slate-100 dark:bg-white/10 px-1 rounded">/atalho</code> no chat para inserir automaticamente
          </p>
        </div>
        {editing !== 'new' && (
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-600 text-white hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Nova resposta
          </button>
        )}
      </div>

      {/* Formulário novo / edição */}
      {editing && (
        <div className="rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/10 p-4 space-y-3">
          <p className="text-xs font-semibold text-primary-700 dark:text-primary-400">
            {editing === 'new' ? 'Nova resposta rápida' : 'Editar resposta rápida'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {field('shortcut', 'Atalho (sem /)', 'saudacao', false)}
            {field('title', 'Título', 'Saudação inicial', false)}
          </div>
          {field('content', 'Mensagem', 'Olá! Como posso ajudar você hoje?', true)}
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={cancel} className="px-3 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center gap-1">
              <X className="w-3.5 h-3.5" /> Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={create.isPending || update.isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" /> Salvar
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <p className="text-sm text-slate-400 text-center py-6">Carregando...</p>
      ) : replies.length === 0 && !editing ? (
        <div className="text-center py-8 text-slate-400">
          <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhuma resposta rápida criada</p>
          <p className="text-xs mt-1">Crie uma para agilizar o atendimento</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {replies.map(r => (
            <li key={r.id} className="py-3 flex items-start gap-3">
              <span className="mt-0.5 w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">/{r.shortcut}</span>
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-white">{r.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">{r.content}</p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => startEdit(r)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                  title="Editar"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title="Excluir"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
