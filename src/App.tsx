import { useState, useEffect, useCallback, useRef } from "react";
import Icon from "@/components/ui/icon";
import func2url from "../backend/func2url.json";

const AUTH_URL = func2url.auth;
const INVITES_URL = func2url.invites;
const MSG_URL = func2url.messages;
const GROUPS_URL = func2url.groups;
const MEDIA_URL = func2url.media;

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "chats" | "groups" | "settings" | "profile";
type AuthStep = "welcome" | "phone" | "code" | "register_invite" | "register_name";
type SettingsTab = "notifications" | "security" | "privacy" | "invites" | "developer" | "about";
type ChatKind = "dm" | "group" | "channel";

interface User {
  id: number; phone: string; name: string; username?: string; about?: string;
  display_id?: string; hide_phone?: boolean; hide_last_seen?: boolean;
  last_seen_visibility?: string; phone_visibility?: string; last_seen?: string;
  avatar_url?: string; is_developer?: boolean;
}
interface RealChat {
  conv_id: number; other_id: number; name: string; display_id: string;
  last_seen_label: string; online: boolean; last_text: string;
  last_time: string | null; unread: number; avatar_url?: string; username?: string;
}
interface RealMessage {
  id: number; sender_id: number; sender_name?: string; sender_username?: string;
  sender_avatar?: string; text: string; is_read?: boolean;
  media_url?: string; media_type?: string;
  created_at: string; own: boolean;
}
interface GroupChat {
  id: number; type: "group" | "channel"; name: string; description: string;
  avatar_url?: string; invite_code?: string; is_owner: boolean;
  members: number; last_text: string; last_time: string | null;
}
interface InviteCode {
  code: string; is_used: boolean; created_at: string;
  used_at?: string; used_by?: string;
}
interface FoundUser {
  id: number; name: string; username: string; display_id: string;
  about?: string; avatar_url?: string; online: boolean; last_seen_label: string;
}

// ─── Emoji sets ───────────────────────────────────────────────────────────────

const EMOJIS = ["😀","😂","🥹","😍","🥰","😎","🤔","😅","🤣","❤️","🔥","👍","👎","🙏","💯","😭","🎉","✅","❌","💀","🤦","🫡","😮","🤯","🥳","🫶","💪","🤝","👀","💬","📱","🚀","⭐","🌙","☀️","🌊","🎯","💡","🔒","🛡️"];

// ─── Utils ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function fmtTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 86400) return d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  if (diff < 172800) return "Вчера";
  return d.toLocaleDateString("ru", { day: "2-digit", month: "2-digit" });
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Atoms ───────────────────────────────────────────────────────────────────

function Avatar({ src, name, size = "md", online }: { src?: string | null; name: string; size?: "sm" | "md" | "lg"; online?: boolean }) {
  const s = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-16 h-16 text-lg" }[size];
  return (
    <div className="relative shrink-0">
      {src
        ? <img src={src} alt={name} className={`${s} rounded-full object-cover border border-border`} />
        : <div className={`${s} rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center font-semibold text-primary`}>{initials(name)}</div>
      }
      {online !== undefined && (
        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-background ${online ? "bg-green-400" : "bg-muted-foreground/30"}`} />
      )}
    </div>
  );
}

function E2EBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-primary/80 bg-primary/8 border border-primary/15 rounded px-1.5 py-0.5">
      <Icon name="Lock" size={9} />E2E
    </span>
  );
}

function Toggle({ value, onChange, label, desc }: { value: boolean; onChange: () => void; label?: string; desc?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      {label && <div className="min-w-0"><p className="text-sm font-medium">{label}</p>{desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}</div>}
      <button onClick={onChange} className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${value ? "bg-primary" : "bg-secondary border border-border"}`}>
        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${value ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1.5 block">{label}</label>
      <input className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/50 transition-all" {...props} />
    </div>
  );
}

function Textarea({ label, ...props }: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1.5 block">{label}</label>
      <textarea className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/50 transition-all resize-none" rows={3} {...props} />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1.5 block">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-primary/50 transition-all">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Card({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Icon name={icon} size={13} className="text-primary" />
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Media upload ─────────────────────────────────────────────────────────────

async function uploadMedia(file: File, token: string): Promise<{ url: string; media_type: string } | null> {
  try {
    const data = await fileToBase64(file);
    const res = await fetch(MEDIA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Session-Token": token },
      body: JSON.stringify({ content_type: file.type, data }),
    });
    const json = await res.json();
    return res.ok ? json : null;
  } catch {
    return null;
  }
}

// ─── Emoji picker ─────────────────────────────────────────────────────────────

function EmojiPicker({ onSelect, onClose }: { onSelect: (e: string) => void; onClose: () => void }) {
  return (
    <div className="absolute bottom-full mb-2 left-0 z-50 bg-card border border-border rounded-xl shadow-lg p-3 w-72 animate-fade-in">
      <div className="flex flex-wrap gap-1">
        {EMOJIS.map(e => (
          <button key={e} onClick={() => { onSelect(e); onClose(); }}
            className="w-8 h-8 text-lg hover:bg-accent rounded-lg transition-colors flex items-center justify-center">
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, showSender }: { msg: RealMessage; showSender?: boolean }) {
  return (
    <div className={`flex ${msg.own ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[75%] ${msg.own ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
        {showSender && !msg.own && (
          <span className="text-[11px] text-primary font-medium px-1">
            {msg.sender_username ? `@${msg.sender_username}` : msg.sender_name}
          </span>
        )}
        <div className={`px-3.5 py-2.5 rounded-2xl text-sm ${msg.own ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border border-border rounded-bl-sm"}`}>
          {msg.media_url && msg.media_type === "image" && (
            <img src={msg.media_url} alt="фото" className="rounded-lg mb-1.5 max-w-full max-h-60 object-cover" />
          )}
          {msg.media_url && msg.media_type === "video" && (
            <video src={msg.media_url} controls className="rounded-lg mb-1.5 max-w-full max-h-60" />
          )}
          {msg.media_url && msg.media_type === "audio" && (
            <audio src={msg.media_url} controls className="w-full mb-1.5" />
          )}
          {msg.text && <p className="leading-relaxed break-words">{msg.text}</p>}
          <span className={`text-[10px] mt-1 block text-right ${msg.own ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
            {fmtTime(msg.created_at)}
            {msg.own && <Icon name={msg.is_read ? "CheckCheck" : "Check"} size={10} className="inline ml-1" />}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Chat input ───────────────────────────────────────────────────────────────

function ChatInput({ onSend, token }: {
  onSend: (text: string, mediaUrl?: string, mediaType?: string) => void;
  token: string;
}) {
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const send = () => {
    if (!text.trim()) return;
    onSend(text.trim()); setText("");
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const result = await uploadMedia(file, token);
    setUploading(false);
    if (result) onSend("", result.url, result.media_type);
    e.target.value = "";
  };

  const toggleRecord = async () => {
    if (recording) {
      mediaRef.current?.stop(); setRecording(false); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], "voice.webm", { type: "audio/webm" });
        setUploading(true);
        const result = await uploadMedia(file, token);
        setUploading(false);
        if (result) onSend("", result.url, "audio");
      };
      mr.start(); mediaRef.current = mr; setRecording(true);
    } catch {
      alert("Нет доступа к микрофону");
    }
  };

  return (
    <div className="px-3 py-3 border-t border-border shrink-0 relative">
      {showEmoji && <EmojiPicker onSelect={e => setText(p => p + e)} onClose={() => setShowEmoji(false)} />}
      <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2">
        <button onClick={() => setShowEmoji(v => !v)} className={`text-muted-foreground hover:text-foreground transition-colors shrink-0 ${showEmoji ? "text-primary" : ""}`}>
          <Icon name="Smile" size={17} />
        </button>
        <input
          ref={fileRef} type="file" accept="image/*,video/*,audio/*" className="hidden"
          onChange={handleFile}
        />
        <button onClick={() => fileRef.current?.click()} disabled={uploading} className="text-muted-foreground hover:text-foreground transition-colors shrink-0 disabled:opacity-40">
          {uploading ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Paperclip" size={16} />}
        </button>
        <input
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder="Сообщение..." value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
        />
        <button onClick={toggleRecord} className={`shrink-0 transition-colors ${recording ? "text-destructive animate-pulse" : "text-muted-foreground hover:text-foreground"}`}>
          <Icon name={recording ? "Square" : "Mic"} size={16} />
        </button>
        {text.trim()
          ? <button onClick={send} className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center hover:bg-primary/80 active:scale-95 transition-all shrink-0">
              <Icon name="Send" size={13} className="text-primary-foreground" />
            </button>
          : null
        }
      </div>
    </div>
  );
}

// ─── DM Chat view ─────────────────────────────────────────────────────────────

function DMChatView({ chat, token, onBack }: { chat: RealChat; token: string; onBack: () => void }) {
  const [messages, setMessages] = useState<RealMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const post = useCallback(async (body: object) => {
    const res = await fetch(MSG_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Session-Token": token }, body: JSON.stringify(body) });
    return res.json();
  }, [token]);

  const load = useCallback(async (afterId = 0) => {
    const data = await post({ action: "get_messages", conv_id: chat.conv_id, after_id: afterId });
    if (data.messages?.length) {
      setMessages(prev => {
        const ids = new Set(prev.map((m: RealMessage) => m.id));
        return [...prev, ...data.messages.filter((m: RealMessage) => !ids.has(m.id))];
      });
      lastIdRef.current = data.messages[data.messages.length - 1].id;
    }
  }, [chat.conv_id, post]);

  useEffect(() => {
    load(0); post({ action: "mark_read", conv_id: chat.conv_id });
    pollRef.current = setInterval(() => load(lastIdRef.current), 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [chat.conv_id, load, post]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async (text: string, mediaUrl?: string, mediaType?: string) => {
    const data = await post({ action: "send", conv_id: chat.conv_id, text, media_url: mediaUrl, media_type: mediaType });
    if (data.message) { setMessages(p => [...p, data.message]); lastIdRef.current = data.message.id; }
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="px-3 py-3 border-b border-border flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="p-1.5 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground shrink-0">
          <Icon name="ArrowLeft" size={18} />
        </button>
        <Avatar src={chat.avatar_url} name={chat.name} online={chat.online} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate">{chat.name}</span>
            <E2EBadge />
          </div>
          <span className="text-xs text-muted-foreground">{chat.username ? `@${chat.username} · ` : ""}{chat.last_seen_label}</span>
        </div>
      </div>
      <div className="flex justify-center py-2 shrink-0">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-secondary rounded-full px-3 py-1">
          <Icon name="ShieldCheck" size={11} className="text-primary" />Сообщения защищены сквозным шифрованием
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-2">
        {messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Напишите первое сообщение</p>
          </div>
        )}
        {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
        <div ref={bottomRef} />
      </div>
      <ChatInput onSend={send} token={token} />
    </div>
  );
}

// ─── Group chat view ──────────────────────────────────────────────────────────

function GroupChatView({ group, token, onBack }: { group: GroupChat; token: string; onBack: () => void }) {
  const [messages, setMessages] = useState<RealMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const post = useCallback(async (body: object) => {
    const res = await fetch(GROUPS_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Session-Token": token }, body: JSON.stringify(body) });
    return res.json();
  }, [token]);

  const load = useCallback(async (afterId = 0) => {
    const data = await post({ action: "get_messages", group_id: group.id, after_id: afterId });
    if (data.messages?.length) {
      setMessages(prev => {
        const ids = new Set(prev.map((m: RealMessage) => m.id));
        return [...prev, ...data.messages.filter((m: RealMessage) => !ids.has(m.id))];
      });
      lastIdRef.current = data.messages[data.messages.length - 1].id;
    }
  }, [group.id, post]);

  useEffect(() => {
    load(0);
    pollRef.current = setInterval(() => load(lastIdRef.current), 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [group.id, load]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async (text: string, mediaUrl?: string, mediaType?: string) => {
    const data = await post({ action: "send", group_id: group.id, text, media_url: mediaUrl, media_type: mediaType });
    if (data.message) { setMessages(p => [...p, data.message]); lastIdRef.current = data.message.id; }
  };

  const isChannel = group.type === "channel";

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="px-3 py-3 border-b border-border flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="p-1.5 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground shrink-0">
          <Icon name="ArrowLeft" size={18} />
        </button>
        <Avatar src={group.avatar_url} name={group.name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate">{group.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isChannel ? "bg-blue-500/15 text-blue-400" : "bg-primary/15 text-primary"}`}>
              {isChannel ? "Канал" : "Группа"}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">{group.members} участников</span>
        </div>
        {group.is_owner && group.invite_code && (
          <button onClick={() => { navigator.clipboard.writeText(group.invite_code!); }}
            className="p-1.5 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground shrink-0" title="Скопировать ссылку">
            <Icon name="Link" size={15} />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-2">
        {messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Нет сообщений</p>
          </div>
        )}
        {messages.map(msg => <MessageBubble key={msg.id} msg={msg} showSender />)}
        <div ref={bottomRef} />
      </div>
      {(!isChannel || group.is_owner) && <ChatInput onSend={send} token={token} />}
      {isChannel && !group.is_owner && (
        <div className="px-4 py-3 border-t border-border text-center text-xs text-muted-foreground">
          Только администраторы могут писать в канале
        </div>
      )}
    </div>
  );
}

// ─── New DM search ────────────────────────────────────────────────────────────

function NewChatSearch({ token, onOpenChat, onClose }: {
  token: string; onOpenChat: (c: RealChat) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoundUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true); setError("");
    const res = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Session-Token": token },
      body: JSON.stringify({ action: "search_user", query: q }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) setResults(data.users || []);
    else setError(data.error || "Ошибка");
  }, [token]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => search(query.replace(/^@/, "")), 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, search]);

  const openDM = async (user: FoundUser) => {
    const res = await fetch(MSG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Session-Token": token },
      body: JSON.stringify({ action: "open_chat", other_id: user.id }),
    });
    const data = await res.json();
    if (res.ok) {
      onOpenChat({ conv_id: data.conv_id, other_id: user.id, name: user.name, display_id: user.display_id, username: user.username, last_seen_label: user.last_seen_label, online: user.online, last_text: "", last_time: null, unread: 0, avatar_url: user.avatar_url });
    }
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border shrink-0">
        <button onClick={onClose} className="p-1.5 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground">
          <Icon name="ArrowLeft" size={18} />
        </button>
        <span className="font-semibold text-sm">Новый чат</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
          <input
            className="w-full bg-secondary border border-border rounded-xl pl-8 pr-4 py-3 text-sm placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/50 transition-all"
            placeholder="username" value={query} onChange={e => setQuery(e.target.value)} autoFocus
          />
          {loading && <Icon name="Loader2" size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="space-y-1">
          {results.map(u => (
            <button key={u.id} onClick={() => openDM(u)} className="w-full flex items-center gap-3 p-3 bg-card border border-border rounded-xl hover:bg-accent transition-colors text-left">
              <Avatar src={u.avatar_url} name={u.name} online={u.online} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{u.name}</p>
                <p className="text-xs text-muted-foreground">@{u.username} · {u.last_seen_label}</p>
              </div>
            </button>
          ))}
          {!loading && query.length >= 2 && results.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Пользователь не найден</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DM Chats ─────────────────────────────────────────────────────────────────

function ChatsPage({ token }: { token: string }) {
  const [chats, setChats] = useState<RealChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [openChat, setOpenChat] = useState<RealChat | null>(null);
  const [newChat, setNewChat] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadChats = useCallback(async () => {
    const res = await fetch(MSG_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Session-Token": token }, body: JSON.stringify({ action: "list_chats" }) });
    const data = await res.json();
    if (res.ok) setChats(data.chats || []);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    loadChats();
    pollRef.current = setInterval(loadChats, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadChats]);

  if (openChat) return <DMChatView chat={openChat} token={token} onBack={() => { setOpenChat(null); loadChats(); }} />;
  if (newChat) return <NewChatSearch token={token} onOpenChat={c => { setNewChat(false); setOpenChat(c); }} onClose={() => setNewChat(false)} />;

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border shrink-0 flex items-center gap-2">
        <div className="relative flex-1">
          <Icon name="Search" size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full bg-secondary rounded-lg pl-8 pr-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/40" placeholder="Поиск..." />
        </div>
        <button onClick={() => setNewChat(true)} className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/80 transition-colors shrink-0" title="Новый чат">
          <Icon name="Plus" size={15} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="flex items-center justify-center h-32"><Icon name="Loader2" size={20} className="animate-spin text-muted-foreground" /></div>}
        {!loading && chats.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 px-6 text-center">
            <Icon name="MessageSquare" size={28} className="text-primary/30" />
            <p className="text-sm text-muted-foreground">Нажмите <span className="text-primary font-bold">+</span> и введите @username чтобы начать переписку</p>
          </div>
        )}
        {chats.map(chat => (
          <button key={chat.conv_id} onClick={() => setOpenChat(chat)} className="w-full flex items-center gap-3 px-3 py-3 hover:bg-accent transition-colors text-left border-b border-border/40">
            <Avatar src={chat.avatar_url} name={chat.name} online={chat.online} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium truncate">{chat.name}</span>
                <span className="text-[11px] text-muted-foreground shrink-0 ml-2">{fmtTime(chat.last_time)}</span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-xs text-muted-foreground truncate">{chat.username ? `@${chat.username}` : ""} {chat.last_text || "Нет сообщений"}</span>
                {chat.unread > 0 && <span className="ml-2 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 shrink-0">{chat.unread}</span>}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Groups page ──────────────────────────────────────────────────────────────

function GroupsPage({ token }: { token: string }) {
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [openGroup, setOpenGroup] = useState<GroupChat | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<"group" | "channel">("group");
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(GROUPS_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Session-Token": token }, body: JSON.stringify({ action: "list" }) });
    const data = await res.json();
    if (res.ok) setGroups(data.groups || []);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 8000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch(GROUPS_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Session-Token": token }, body: JSON.stringify({ action: "create", name: newName, description: newDesc, type: newType }) });
    setCreating(false);
    if (res.ok) { setShowCreate(false); setNewName(""); setNewDesc(""); load(); }
  };

  const join = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    const res = await fetch(GROUPS_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Session-Token": token }, body: JSON.stringify({ action: "join", invite_code: joinCode.trim() }) });
    const data = await res.json();
    setJoining(false);
    if (res.ok) { setShowJoin(false); setJoinCode(""); load(); }
    else alert(data.error || "Ошибка");
  };

  if (openGroup) return <GroupChatView group={openGroup} token={token} onBack={() => { setOpenGroup(null); load(); }} />;

  if (showCreate) return (
    <div className="flex flex-col h-full animate-fade-in">
      <button onClick={() => setShowCreate(false)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-5 h-12 border-b border-border shrink-0">
        <Icon name="ArrowLeft" size={15} /><span className="font-medium text-foreground">Создать</span>
      </button>
      <div className="p-5 space-y-4">
        <div className="flex gap-2">
          {(["group", "channel"] as const).map(t => (
            <button key={t} onClick={() => setNewType(t)} className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${newType === t ? "bg-primary text-primary-foreground border-primary" : "bg-secondary border-border hover:bg-accent"}`}>
              {t === "group" ? "Группа" : "Канал"}
            </button>
          ))}
        </div>
        <Field label="Название" placeholder="Название группы или канала" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
        <Textarea label="Описание (необязательно)" placeholder="О чём эта группа?" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
        <button onClick={create} disabled={creating || !newName.trim()} className="w-full bg-primary text-primary-foreground font-medium py-3 rounded-xl hover:bg-primary/80 transition-colors disabled:opacity-50">
          {creating ? "Создаём..." : `Создать ${newType === "group" ? "группу" : "канал"}`}
        </button>
      </div>
    </div>
  );

  if (showJoin) return (
    <div className="flex flex-col h-full animate-fade-in">
      <button onClick={() => setShowJoin(false)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-5 h-12 border-b border-border shrink-0">
        <Icon name="ArrowLeft" size={15} /><span className="font-medium text-foreground">Вступить</span>
      </button>
      <div className="p-5 space-y-4">
        <Field label="Код приглашения группы или канала" placeholder="GRP-XXXXXXXXXXXX" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} autoFocus />
        <button onClick={join} disabled={joining || !joinCode.trim()} className="w-full bg-primary text-primary-foreground font-medium py-3 rounded-xl hover:bg-primary/80 transition-colors disabled:opacity-50">
          {joining ? "Вступаем..." : "Вступить"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border shrink-0 flex items-center gap-2">
        <div className="relative flex-1">
          <Icon name="Search" size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full bg-secondary rounded-lg pl-8 pr-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/40" placeholder="Поиск групп..." />
        </div>
        <button onClick={() => setShowJoin(true)} className="p-2 bg-secondary border border-border rounded-lg hover:bg-accent transition-colors shrink-0" title="Вступить">
          <Icon name="LogIn" size={15} />
        </button>
        <button onClick={() => setShowCreate(true)} className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/80 transition-colors shrink-0" title="Создать">
          <Icon name="Plus" size={15} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="flex items-center justify-center h-32"><Icon name="Loader2" size={20} className="animate-spin text-muted-foreground" /></div>}
        {!loading && groups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 px-6 text-center">
            <Icon name="Users" size={28} className="text-primary/30" />
            <p className="text-sm text-muted-foreground">Нажмите <span className="text-primary font-bold">+</span> создать группу или канал, или войдите по коду</p>
          </div>
        )}
        {groups.map(g => (
          <button key={g.id} onClick={() => setOpenGroup(g)} className="w-full flex items-center gap-3 px-3 py-3 hover:bg-accent transition-colors text-left border-b border-border/40">
            <div className="relative shrink-0">
              {g.avatar_url
                ? <img src={g.avatar_url} alt={g.name} className="w-10 h-10 rounded-full object-cover border border-border" />
                : <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-500/20 to-primary/10 border border-border text-sm font-semibold text-primary">{initials(g.name)}</div>
              }
              <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background flex items-center justify-center ${g.type === "channel" ? "bg-blue-500" : "bg-primary"}`}>
                <Icon name={g.type === "channel" ? "Radio" : "Users"} size={6} className="text-white" />
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium truncate">{g.name}</span>
                <span className="text-[11px] text-muted-foreground shrink-0 ml-2">{fmtTime(g.last_time)}</span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-xs text-muted-foreground truncate">{g.last_text || "Нет сообщений"}</span>
                <span className="text-[11px] text-muted-foreground shrink-0 ml-2">{g.members} чел.</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function AuthFlow({ onSuccess }: { onSuccess: (user: User, token: string) => void }) {
  const [step, setStep] = useState<AuthStep>("welcome");
  const [isLogin, setIsLogin] = useState(true);
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [devCode, setDevCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (countdown > 0) { timerRef.current = setTimeout(() => setCountdown(c => c - 1), 1000); }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [countdown]);

  const post = async (body: object) => {
    const res = await fetch(AUTH_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, data: await res.json() };
  };

  const sendCode = async () => {
    if (!phone.trim()) return;
    setLoading(true); setError("");
    const { ok, data } = await post({ action: "send_code", phone: phone.trim() });
    setLoading(false);
    if (!ok) { setError(data.error || "Ошибка отправки"); return; }
    if (data.dev_code) setDevCode(data.dev_code);
    setCountdown(60); setStep("code");
  };

  const verifyCode = async () => {
    if (!smsCode.trim()) return;
    setLoading(true); setError("");
    const { ok, data } = await post({ action: "verify_code", phone: phone.trim(), code: smsCode.trim() });
    setLoading(false);
    if (!ok) { setError(data.error || "Неверный код"); return; }
    if (isLogin) {
      const { ok: lok, data: ld } = await post({ action: "login", phone: phone.trim() });
      if (!lok) {
        if (ld.error?.includes("не найден")) { setIsLogin(false); setStep("register_invite"); }
        else setError(ld.error || "Ошибка входа");
        return;
      }
      onSuccess(ld.user, ld.token);
    } else { setStep("register_invite"); }
  };

  const register = async () => {
    if (!name.trim() || !inviteCode.trim()) return;
    setLoading(true); setError("");
    const { ok, data } = await post({ action: "register", phone: phone.trim(), name: name.trim(), invite_code: inviteCode.trim() });
    setLoading(false);
    if (!ok) { setError(data.error || "Ошибка регистрации"); return; }
    onSuccess(data.user, data.token);
  };

  const back = () => {
    setError("");
    const prev: Record<AuthStep, AuthStep> = { welcome: "welcome", phone: "welcome", code: "phone", register_invite: "code", register_name: "register_invite" };
    setStep(prev[step]);
  };

  if (step === "welcome") return (
    <div className="flex flex-col items-center justify-center h-full px-6 animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center mb-6">
        <Icon name="Radio" size={28} className="text-primary" />
      </div>
      <h1 className="text-2xl font-bold mb-1">Sfera</h1>
      <p className="text-sm text-muted-foreground text-center mb-8 max-w-xs leading-relaxed">Защищённый мессенджер. Вход только по приглашению.</p>
      <div className="w-full max-w-xs space-y-3">
        <button onClick={() => { setIsLogin(true); setStep("phone"); }} className="w-full bg-primary text-primary-foreground font-medium py-3 rounded-xl hover:bg-primary/80 transition-colors">Войти</button>
        <button onClick={() => { setIsLogin(false); setStep("phone"); }} className="w-full bg-secondary border border-border font-medium py-3 rounded-xl hover:bg-accent transition-colors">У меня есть приглашение</button>
      </div>
      <div className="flex items-center gap-1.5 mt-8 text-xs text-muted-foreground"><Icon name="ShieldCheck" size={12} className="text-primary" />E2E шифрование</div>
    </div>
  );

  return (
    <div className="flex flex-col h-full px-6 pt-8">
      <button onClick={back} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 w-fit">
        <Icon name="ArrowLeft" size={15} />Назад
      </button>
      <div className="flex-1 flex flex-col justify-center max-w-xs mx-auto w-full animate-fade-in">
        {step === "phone" && (<>
          <h2 className="text-xl font-bold mb-1">{isLogin ? "Войти" : "Регистрация"}</h2>
          <p className="text-sm text-muted-foreground mb-6">Введите номер — отправим код</p>
          <div className="space-y-4">
            <Field label="Номер телефона" type="tel" placeholder="+7 900 000-00-00" value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === "Enter" && sendCode()} autoFocus />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button onClick={sendCode} disabled={loading || !phone.trim()} className="w-full bg-primary text-primary-foreground font-medium py-3 rounded-xl hover:bg-primary/80 transition-colors disabled:opacity-50">{loading ? "Отправляем..." : "Получить код"}</button>
          </div>
        </>)}
        {step === "code" && (<>
          <h2 className="text-xl font-bold mb-1">Введите код</h2>
          <p className="text-sm text-muted-foreground mb-6">Отправили SMS на <span className="text-foreground font-medium">{phone}</span></p>
          {devCode && <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg"><p className="text-xs text-yellow-400">Тест-режим — код: <span className="font-mono font-bold">{devCode}</span></p></div>}
          <div className="space-y-4">
            <input className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-2xl font-mono tracking-[0.5em] text-center outline-none focus:ring-1 focus:ring-primary/50 transition-all" placeholder="000000" maxLength={6} value={smsCode} onChange={e => setSmsCode(e.target.value.replace(/\D/g, ""))} onKeyDown={e => e.key === "Enter" && verifyCode()} autoFocus />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button onClick={verifyCode} disabled={loading || smsCode.length < 6} className="w-full bg-primary text-primary-foreground font-medium py-3 rounded-xl hover:bg-primary/80 transition-colors disabled:opacity-50">{loading ? "Проверяем..." : "Подтвердить"}</button>
            <button onClick={() => { setSmsCode(""); setDevCode(""); sendCode(); }} disabled={countdown > 0} className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 py-1">{countdown > 0 ? `Повторить через ${countdown}с` : "Отправить повторно"}</button>
          </div>
        </>)}
        {step === "register_invite" && (<>
          <h2 className="text-xl font-bold mb-1">Код приглашения</h2>
          <p className="text-sm text-muted-foreground mb-6">Введите код от пригласившего вас</p>
          <div className="space-y-4">
            <Field label="Код" placeholder="SFERA-XXXX-XXXX-XXXX" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && inviteCode.trim() && setStep("register_name")} autoFocus />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button onClick={() => { setError(""); setStep("register_name"); }} disabled={!inviteCode.trim()} className="w-full bg-primary text-primary-foreground font-medium py-3 rounded-xl hover:bg-primary/80 transition-colors disabled:opacity-50">Продолжить</button>
          </div>
        </>)}
        {step === "register_name" && (<>
          <h2 className="text-xl font-bold mb-1">Ваше имя</h2>
          <p className="text-sm text-muted-foreground mb-6">Как вас будут видеть другие</p>
          <div className="space-y-4">
            <Field label="Имя" placeholder="Иван Иванов" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && register()} autoFocus />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button onClick={register} disabled={loading || !name.trim()} className="w-full bg-primary text-primary-foreground font-medium py-3 rounded-xl hover:bg-primary/80 transition-colors disabled:opacity-50">{loading ? "Создаём профиль..." : "Создать профиль"}</button>
          </div>
        </>)}
      </div>
    </div>
  );
}

// ─── Invites tab ──────────────────────────────────────────────────────────────

function InvitesTab({ token }: { token: string }) {
  const [invitedCount, setInvitedCount] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(INVITES_URL, { headers: { "X-Session-Token": token } })
      .then(r => r.json())
      .then(d => { if (d.invited_count !== undefined) setInvitedCount(d.invited_count); })
      .finally(() => setLoading(false));
  }, [token]);

  const generate = async () => {
    setGenerating(true); setGeneratedCode(null); setCopied(false);
    const res = await fetch(INVITES_URL, { method: "POST", headers: { "X-Session-Token": token } });
    const data = await res.json();
    if (res.ok) setGeneratedCode(data.code);
    setGenerating(false);
  };

  const copy = () => {
    if (generatedCode) { navigator.clipboard.writeText(generatedCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-4 bg-card border border-border rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0"><Icon name="Users" size={18} className="text-primary" /></div>
          <div><p className="text-sm font-medium">Приглашено</p><p className="text-xs text-muted-foreground">Вступили по вашим кодам</p></div>
        </div>
        <span className="text-2xl font-bold text-primary">{loading ? "..." : invitedCount}</span>
      </div>
      <Card icon="Mail" title="Пригласить пользователя">
        <div className="px-4 py-4 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">Каждый раз генерируется новый уникальный одноразовый код. Передайте его тому, кого хотите пригласить.</p>
          <button onClick={generate} disabled={generating} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-medium py-2.5 rounded-xl hover:bg-primary/80 transition-colors disabled:opacity-50">
            <Icon name="RefreshCw" size={14} className={generating ? "animate-spin" : ""} />
            {generating ? "Генерируем..." : "Сгенерировать код"}
          </button>
          {generatedCode && (
            <div className="p-3 bg-secondary rounded-xl border border-border">
              <p className="text-[11px] text-muted-foreground mb-1.5">Ваш код приглашения</p>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm text-primary break-all">{generatedCode}</span>
                <button onClick={copy} className="flex items-center gap-1 text-xs shrink-0 px-2 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors">
                  <Icon name={copied ? "Check" : "Copy"} size={12} />{copied ? "Скопировано!" : "Копировать"}
                </button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── Profile edit ─────────────────────────────────────────────────────────────

function ProfileEdit({ user, token, onSave, onClose }: { user: User; token: string; onSave: (u: Partial<User>) => void; onClose: () => void }) {
  const [name, setName] = useState(user.name);
  const [about, setAbout] = useState(user.about || "");
  const [username, setUsername] = useState(user.username || "");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "ok" | "taken" | "invalid">("idle");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url || "");
  const fileRef = useRef<HTMLInputElement>(null);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    const u = username.trim().toLowerCase();
    if (!u) { setUsernameStatus("idle"); return; }
    if (u === user.username) { setUsernameStatus("ok"); return; }
    setUsernameStatus("checking");
    checkTimer.current = setTimeout(async () => {
      const res = await fetch(AUTH_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check_username", username: u }) });
      const data = await res.json();
      if (!res.ok) setUsernameStatus("invalid");
      else setUsernameStatus(data.available ? "ok" : "taken");
    }, 500);
  }, [username, user.username]);

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    const result = await uploadMedia(file, token);
    setUploadingAvatar(false);
    if (result) setAvatarUrl(result.url);
    e.target.value = "";
  };

  const save = async () => {
    if (!name.trim()) return;
    if (usernameStatus === "taken" || usernameStatus === "invalid") return;
    setSaving(true);
    const patch: Partial<User> & { avatar_url: string } = { name: name.trim(), about: about.trim(), avatar_url: avatarUrl };
    if (username.trim()) patch.username = username.trim().toLowerCase();
    await fetch(AUTH_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Session-Token": token }, body: JSON.stringify({ action: "update_profile", ...patch }) });
    onSave(patch);
    setSaving(false);
    onClose();
  };

  const uStatus = {
    idle: null,
    checking: <span className="text-xs text-muted-foreground">Проверяем...</span>,
    ok: <span className="text-xs text-green-400 flex items-center gap-1"><Icon name="Check" size={11} />Доступен</span>,
    taken: <span className="text-xs text-destructive flex items-center gap-1"><Icon name="X" size={11} />Занят</span>,
    invalid: <span className="text-xs text-destructive">Только буквы, цифры и _</span>,
  }[usernameStatus];

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border shrink-0">
        <button onClick={onClose} className="p-1.5 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground">
          <Icon name="ArrowLeft" size={18} />
        </button>
        <span className="font-semibold text-sm flex-1">Редактировать профиль</span>
        <button onClick={save} disabled={saving || usernameStatus === "taken" || usernameStatus === "invalid"} className="text-sm text-primary font-medium hover:opacity-70 transition-opacity disabled:opacity-40">
          {saving ? "Сохраняем..." : "Сохранить"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            {avatarUrl
              ? <img src={avatarUrl} alt="avatar" className="w-20 h-20 rounded-full object-cover border-2 border-primary/30" />
              : <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/40 to-primary/10 border-2 border-primary/30 flex items-center justify-center text-xl font-bold text-primary">{initials(name)}</div>
            }
            <button onClick={() => fileRef.current?.click()} className="absolute bottom-0 right-0 w-7 h-7 bg-primary rounded-full border-2 border-background flex items-center justify-center hover:bg-primary/80 transition-colors">
              {uploadingAvatar ? <Icon name="Loader2" size={12} className="text-primary-foreground animate-spin" /> : <Icon name="Camera" size={12} className="text-primary-foreground" />}
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
          <p className="text-xs text-muted-foreground">Нажмите на аватар чтобы изменить</p>
        </div>
        <div className="space-y-4">
          <Field label="Имя" value={name} onChange={e => setName(e.target.value)} placeholder="Ваше имя" />
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Юзернейм</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
              <input className="w-full bg-secondary border border-border rounded-xl pl-8 pr-4 py-3 text-sm placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/50 transition-all" placeholder="username" value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} />
            </div>
            <div className="mt-1.5 px-1">{uStatus}</div>
            <p className="text-[11px] text-muted-foreground mt-1 px-1">Буквы, цифры и _ · 3–32 символа. По нему вас будут находить.</p>
          </div>
          <Textarea label="О себе" value={about} onChange={e => setAbout(e.target.value)} placeholder="Расскажите о себе..." />
        </div>
      </div>
    </div>
  );
}

// ─── Privacy tab ─────────────────────────────────────────────────────────────

function PrivacyTab({ user, token, onUpdate }: { user: User; token: string; onUpdate: (u: Partial<User>) => void }) {
  const [saving, setSaving] = useState(false);
  const [local, setLocal] = useState({
    hide_phone: user.hide_phone || false, hide_last_seen: user.hide_last_seen || false,
    last_seen_visibility: user.last_seen_visibility || "everyone", phone_visibility: user.phone_visibility || "everyone",
  });
  const save = async (patch: Partial<typeof local>) => {
    const next = { ...local, ...patch };
    setLocal(next); setSaving(true);
    await fetch(AUTH_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Session-Token": token }, body: JSON.stringify({ action: "update_profile", ...patch }) });
    onUpdate(patch); setSaving(false);
  };
  const visOpts = [{ value: "everyone", label: "Все" }, { value: "contacts", label: "Только контакты" }, { value: "nobody", label: "Никто" }];
  return (
    <div className="space-y-3">
      <Card icon="Phone" title="Номер телефона">
        <div className="divide-y divide-border">
          <div className="px-4 py-3.5"><Toggle label="Скрыть номер" desc="Другие не увидят ваш номер" value={local.hide_phone} onChange={() => save({ hide_phone: !local.hide_phone })} /></div>
          <div className="px-4 py-3.5"><SelectField label="Кто видит номер" value={local.phone_visibility} onChange={v => save({ phone_visibility: v })} options={visOpts} /></div>
        </div>
      </Card>
      <Card icon="Clock" title="Время в сети">
        <div className="divide-y divide-border">
          <div className="px-4 py-3.5"><Toggle label="Скрыть время визита" desc="Другие увидят «Был недавно»" value={local.hide_last_seen} onChange={() => save({ hide_last_seen: !local.hide_last_seen })} /></div>
          <div className="px-4 py-3.5"><SelectField label="Кто видит время" value={local.last_seen_visibility} onChange={v => save({ last_seen_visibility: v })} options={visOpts} /></div>
        </div>
      </Card>
      {saving && <p className="text-xs text-muted-foreground text-center animate-pulse">Сохраняем...</p>}
    </div>
  );
}

// ─── Settings ────────────────────────────────────────────────────────────────

const SETTINGS_TABS: { id: SettingsTab; icon: string; label: string; desc: string; devOnly?: boolean }[] = [
  { id: "notifications", icon: "Bell", label: "Уведомления", desc: "Push, звуки" },
  { id: "security", icon: "Shield", label: "Безопасность", desc: "2FA, шифрование" },
  { id: "privacy", icon: "Eye", label: "Приватность", desc: "Номер, время онлайн" },
  { id: "invites", icon: "Mail", label: "Пригласить друга", desc: "Коды приглашения" },
  { id: "developer", icon: "Code2", label: "Режим разработчика", desc: "Инструменты разработки", devOnly: true },
  { id: "about", icon: "Info", label: "О приложении", desc: "Версия, протокол" },
];

function SettingsPage({ user, token, onUpdate }: { user: User; token: string; onUpdate: (u: Partial<User>) => void }) {
  const [activeTab, setActiveTab] = useState<SettingsTab | null>(null);
  const [notif, setNotif] = useState(true);
  const [sounds, setSounds] = useState(true);
  const [twoFactor, setTwoFactor] = useState(false);

  const tabs = SETTINGS_TABS.filter(t => !t.devOnly || user.is_developer);

  if (activeTab) {
    const tabMeta = tabs.find(t => t.id === activeTab);
    return (
      <div className="h-full flex flex-col">
        <button onClick={() => setActiveTab(null)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-5 h-12 border-b border-border shrink-0">
          <Icon name="ArrowLeft" size={15} /><span className="font-medium text-foreground">{tabMeta?.label}</span>
        </button>
        <div className="flex-1 overflow-y-auto p-5 animate-fade-in">
          {activeTab === "notifications" && (
            <Card icon="Bell" title="Уведомления">
              <div className="divide-y divide-border">
                <div className="px-4 py-3.5"><Toggle label="Push-уведомления" desc="Уведомления на устройстве" value={notif} onChange={() => setNotif(v => !v)} /></div>
                <div className="px-4 py-3.5"><Toggle label="Звуки" desc="Звук при новом сообщении" value={sounds} onChange={() => setSounds(v => !v)} /></div>
              </div>
            </Card>
          )}
          {activeTab === "security" && (
            <div className="space-y-3">
              <Card icon="Shield" title="Безопасность">
                <div className="divide-y divide-border">
                  <div className="px-4 py-3.5"><Toggle label="Двухфакторная аутентификация" desc="Дополнительный уровень защиты" value={twoFactor} onChange={() => setTwoFactor(v => !v)} /></div>
                </div>
              </Card>
              <Card icon="Lock" title="Шифрование">
                <div className="px-4 py-4">
                  <div className="flex items-start gap-3 p-3 bg-primary/6 border border-primary/15 rounded-lg">
                    <Icon name="ShieldCheck" size={16} className="text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-primary">E2E шифрование активно</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Все личные сообщения защищены сквозным шифрованием.</p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}
          {activeTab === "privacy" && <PrivacyTab user={user} token={token} onUpdate={onUpdate} />}
          {activeTab === "invites" && <InvitesTab token={token} />}
          {activeTab === "developer" && (
            <div className="space-y-3">
              <Card icon="Code2" title="Режим разработчика">
                <div className="px-4 py-4 space-y-3">
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <p className="text-xs text-yellow-400 font-medium">⚠️ Только для разработчиков</p>
                    <p className="text-xs text-muted-foreground mt-1">Функционал в разработке. Здесь будут инструменты отладки и тестирования.</p>
                  </div>
                  {[
                    { label: "User ID", value: String(user.id) },
                    { label: "Display ID", value: user.display_id || "—" },
                    { label: "Username", value: user.username ? `@${user.username}` : "не задан" },
                    { label: "Auth", value: "Token-based" },
                    { label: "DB", value: "PostgreSQL" },
                    { label: "Backend", value: "Python 3.11 CF" },
                  ].map(r => (
                    <div key={r.label} className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">{r.label}</span>
                      <span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded">{r.value}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
          {activeTab === "about" && (
            <Card icon="Info" title="О приложении">
              <div className="divide-y divide-border">
                {[{ label: "Версия", value: "1.0.0" }, { label: "Протокол", value: "Signal E2E" }, { label: "Платформа", value: "Web PWA" }].map(r => (
                  <div key={r.label} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm">{r.label}</span><span className="text-sm text-muted-foreground font-mono">{r.value}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-lg mx-auto p-5">
        <h2 className="text-base font-semibold mb-4">Настройки</h2>
        <div className="space-y-2">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className="w-full flex items-center gap-3 px-4 py-3.5 bg-card border border-border rounded-xl hover:bg-accent transition-colors text-left">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tab.devOnly ? "bg-yellow-500/15" : "bg-primary/10"}`}>
                <Icon name={tab.icon} size={16} className={tab.devOnly ? "text-yellow-400" : "text-primary"} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{tab.label}</p>
                <p className="text-xs text-muted-foreground">{tab.desc}</p>
              </div>
              <Icon name="ChevronRight" size={15} className="text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Profile ──────────────────────────────────────────────────────────────────

function ProfilePage({ user, token, onLogout, onUpdate }: { user: User; token: string; onLogout: () => void; onUpdate: (u: Partial<User>) => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <ProfileEdit user={user} token={token} onSave={onUpdate} onClose={() => setEditing(false)} />;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-lg mx-auto p-5">
        <div className="flex flex-col items-center py-6">
          <Avatar src={user.avatar_url} name={user.name} size="lg" />
          <h2 className="text-lg font-semibold mt-3">{user.name}</h2>
          {user.username && <p className="text-sm text-primary mt-0.5">@{user.username}</p>}
          {user.display_id && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs text-muted-foreground">ID:</span>
              <span className="font-mono text-xs text-muted-foreground bg-secondary border border-border px-2 py-0.5 rounded">{user.display_id}</span>
            </div>
          )}
          {user.about && <p className="text-xs text-muted-foreground text-center mt-2 max-w-xs">{user.about}</p>}
          <div className="flex items-center gap-1.5 mt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" /><span className="text-xs text-muted-foreground">В сети</span>
          </div>
          <button onClick={() => setEditing(true)} className="mt-4 flex items-center gap-2 text-sm bg-secondary border border-border px-4 py-2 rounded-lg hover:bg-accent transition-colors">
            <Icon name="Edit2" size={13} />Редактировать профиль
          </button>
        </div>
        <div className="space-y-3">
          <Card icon="User" title="Данные профиля">
            <div className="divide-y divide-border">
              {[
                { label: "Имя", value: user.name },
                { label: "Username", value: user.username ? `@${user.username}` : "не задан" },
                { label: "Телефон", value: user.hide_phone ? "Скрыт" : user.phone },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">{r.label}</span>
                  <span className="text-sm font-mono">{r.value}</span>
                </div>
              ))}
            </div>
          </Card>
          <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 text-sm text-destructive border border-destructive/20 bg-destructive/5 py-3 rounded-xl hover:bg-destructive/10 transition-colors">
            <Icon name="LogOut" size={14} />Выйти из аккаунта
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const NAV: { id: Tab; icon: string; label: string }[] = [
  { id: "chats", icon: "MessageSquare", label: "Личные" },
  { id: "groups", icon: "Users", label: "Группы" },
  { id: "settings", icon: "Settings", label: "Настройки" },
  { id: "profile", icon: "User", label: "Профиль" },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState(() => localStorage.getItem("sf_token") || "");
  const [tab, setTab] = useState<Tab>("chats");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!token) { setChecking(false); return; }
    fetch(AUTH_URL, { headers: { "X-Session-Token": token } })
      .then(r => r.json())
      .then(d => { if (d.user) setUser(d.user); else { localStorage.removeItem("sf_token"); setToken(""); } })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  const handleAuth = (u: User, t: string) => { setUser(u); setToken(t); localStorage.setItem("sf_token", t); };
  const handleLogout = () => { setUser(null); setToken(""); localStorage.removeItem("sf_token"); };
  const handleUpdate = (patch: Partial<User>) => setUser(p => p ? { ...p, ...patch } : p);

  if (checking) return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
        <Icon name="Radio" size={18} className="text-primary" />
      </div>
    </div>
  );

  if (!user) return (
    <div className="h-screen bg-background text-foreground">
      <AuthFlow onSuccess={handleAuth} />
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="h-11 flex items-center px-4 border-b border-border shrink-0">
          <div className="w-6 h-6 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center mr-2.5">
            <Icon name="Radio" size={12} className="text-primary" />
          </div>
          <span className="font-semibold text-sm">{NAV.find(n => n.id === tab)?.label}</span>
          <div className="ml-auto flex items-center gap-1.5">
            <Icon name="Lock" size={10} className="text-primary" />
            <span className="font-mono text-[10px] text-muted-foreground">E2E</span>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {tab === "chats" && <ChatsPage token={token} />}
          {tab === "groups" && <GroupsPage token={token} />}
          {tab === "settings" && <SettingsPage user={user} token={token} onUpdate={handleUpdate} />}
          {tab === "profile" && <ProfilePage user={user} token={token} onLogout={handleLogout} onUpdate={handleUpdate} />}
        </div>
      </main>
      <nav className="h-16 flex items-center justify-around px-2 border-t border-border bg-card shrink-0">
        {NAV.map(item => (
          <button key={item.id} onClick={() => setTab(item.id)} className={`relative flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${tab === item.id ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            {tab === item.id && <span className="absolute inset-0 bg-primary/8 rounded-xl" />}
            <Icon name={item.icon} size={19} />
            <span className="text-[10px] font-medium relative">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}