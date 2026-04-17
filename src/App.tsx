import { useState, useEffect, useCallback, useRef } from "react";
import Icon from "@/components/ui/icon";
import func2url from "../backend/func2url.json";

const AUTH_URL = func2url.auth;
const INVITES_URL = func2url.invites;

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "chats" | "contacts" | "settings" | "profile";
type AuthStep = "welcome" | "phone" | "code" | "register_invite" | "register_name";
type SettingsTab = "notifications" | "security" | "privacy" | "invites" | "about";

interface User {
  id: number; phone: string; name: string; username?: string; about?: string;
  display_id?: string; hide_phone?: boolean; hide_last_seen?: boolean;
  last_seen_visibility?: string; phone_visibility?: string; last_seen?: string;
}
interface InviteCode {
  code: string; is_used: boolean; created_at: string;
  used_at?: string; used_by?: string; used_by_display_id?: string;
}
interface Message { id: number; text: string; time: string; own: boolean; }
interface Chat { id: number; name: string; avatar: string; lastMessage: string; time: string; unread: number; online: boolean; }
interface Contact { id: number; name: string; avatar: string; status: string; online: boolean; }

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_CHATS: Chat[] = [
  { id: 1, name: "Алексей Громов", avatar: "АГ", lastMessage: "Договорились на завтра", time: "14:32", unread: 2, online: true },
  { id: 2, name: "Мария Кузнецова", avatar: "МК", lastMessage: "Спасибо за документы!", time: "13:15", unread: 0, online: true },
  { id: 3, name: "Рабочая группа", avatar: "РГ", lastMessage: "Встреча в пятницу в 10:00", time: "11:48", unread: 5, online: false },
  { id: 4, name: "Дмитрий Волков", avatar: "ДВ", lastMessage: "Посмотрю и отвечу", time: "Вчера", unread: 0, online: false },
];
const MOCK_CONTACTS: Contact[] = [
  { id: 1, name: "Алексей Громов", avatar: "АГ", status: "В сети", online: true },
  { id: 2, name: "Мария Кузнецова", avatar: "МК", status: "В сети", online: true },
  { id: 3, name: "Ольга Смирнова", avatar: "ОС", status: "В сети", online: true },
  { id: 4, name: "Дмитрий Волков", avatar: "ДВ", status: "Был недавно", online: false },
  { id: 5, name: "Никита Орлов", avatar: "НО", status: "Недоступен", online: false },
];
const MOCK_MSGS: Message[] = [
  { id: 1, text: "Привет! Как продвигается работа?", time: "14:10", own: false },
  { id: 2, text: "Всё идёт по плану.", time: "14:12", own: true },
  { id: 3, text: "Нужно согласовать детали по интеграции", time: "14:20", own: false },
  { id: 4, text: "Давай обсудим в 15:00?", time: "14:25", own: true },
  { id: 5, text: "Договорились на завтра", time: "14:32", own: false },
];

// ─── Atoms ────────────────────────────────────────────────────────────────────

function Avatar({ initials, size = "md", online }: { initials: string; size?: "sm" | "md" | "lg"; online?: boolean }) {
  const s = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-16 h-16 text-lg" }[size];
  return (
    <div className="relative shrink-0">
      <div className={`${s} rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center font-semibold text-primary`}>{initials}</div>
      {online !== undefined && <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-background ${online ? "bg-green-400" : "bg-muted-foreground/30"}`} />}
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
      {label && (
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
        </div>
      )}
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
      <input className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-all" {...props} />
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
    if (countdown > 0) {
      timerRef.current = setTimeout(() => setCountdown(c => c - 1), 1000);
    }
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
    } else {
      setStep("register_invite");
    }
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
    const prev: Record<AuthStep, AuthStep> = {
      welcome: "welcome", phone: "welcome", code: "phone",
      register_invite: "code", register_name: "register_invite",
    };
    setStep(prev[step]);
  };

  // Welcome
  if (step === "welcome") {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center mb-6">
          <Icon name="Radio" size={28} className="text-primary" />
        </div>
        <h1 className="text-2xl font-bold mb-1">Sfera</h1>
        <p className="text-sm text-muted-foreground text-center mb-8 max-w-xs leading-relaxed">Защищённый мессенджер со сквозным шифрованием. Вход только по приглашению.</p>
        <div className="w-full max-w-xs space-y-3">
          <button onClick={() => { setIsLogin(true); setStep("phone"); }} className="w-full bg-primary text-primary-foreground font-medium py-3 rounded-xl hover:bg-primary/80 transition-colors">Войти</button>
          <button onClick={() => { setIsLogin(false); setStep("phone"); }} className="w-full bg-secondary border border-border font-medium py-3 rounded-xl hover:bg-accent transition-colors">У меня есть приглашение</button>
        </div>
        <div className="flex items-center gap-1.5 mt-8 text-xs text-muted-foreground">
          <Icon name="ShieldCheck" size={12} className="text-primary" />Сквозное E2E шифрование
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full px-6 pt-8">
      <button onClick={back} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 w-fit">
        <Icon name="ArrowLeft" size={15} />Назад
      </button>
      <div className="flex-1 flex flex-col justify-center max-w-xs mx-auto w-full animate-fade-in">

        {step === "phone" && (
          <>
            <h2 className="text-xl font-bold mb-1">{isLogin ? "Войти" : "Регистрация"}</h2>
            <p className="text-sm text-muted-foreground mb-6">Введите номер — отправим код подтверждения</p>
            <div className="space-y-4">
              <Field label="Номер телефона" type="tel" placeholder="+7 900 000-00-00" value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === "Enter" && sendCode()} autoFocus />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <button onClick={sendCode} disabled={loading || !phone.trim()} className="w-full bg-primary text-primary-foreground font-medium py-3 rounded-xl hover:bg-primary/80 transition-colors disabled:opacity-50">{loading ? "Отправляем..." : "Получить код"}</button>
            </div>
          </>
        )}

        {step === "code" && (
          <>
            <h2 className="text-xl font-bold mb-1">Введите код</h2>
            <p className="text-sm text-muted-foreground mb-6">Отправили SMS на <span className="text-foreground font-medium">{phone}</span></p>
            {devCode && (
              <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-xs text-yellow-400">Тестовый режим — код: <span className="font-mono font-bold">{devCode}</span></p>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Код из SMS</label>
                <input
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-2xl font-mono tracking-[0.5em] text-center placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/50 transition-all"
                  placeholder="000000" maxLength={6} value={smsCode}
                  onChange={e => setSmsCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={e => e.key === "Enter" && verifyCode()} autoFocus
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <button onClick={verifyCode} disabled={loading || smsCode.length < 6} className="w-full bg-primary text-primary-foreground font-medium py-3 rounded-xl hover:bg-primary/80 transition-colors disabled:opacity-50">{loading ? "Проверяем..." : "Подтвердить"}</button>
              <button onClick={() => { setSmsCode(""); setDevCode(""); sendCode(); }} disabled={countdown > 0} className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 py-1">
                {countdown > 0 ? `Повторить через ${countdown}с` : "Отправить повторно"}
              </button>
            </div>
          </>
        )}

        {step === "register_invite" && (
          <>
            <h2 className="text-xl font-bold mb-1">Код приглашения</h2>
            <p className="text-sm text-muted-foreground mb-6">Введите код, который вам отправили</p>
            <div className="space-y-4">
              <Field label="Пригласительный код" placeholder="SFERA-XXXX-XXXX-XXXX" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && inviteCode.trim() && setStep("register_name")} autoFocus />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <button onClick={() => { setError(""); setStep("register_name"); }} disabled={!inviteCode.trim()} className="w-full bg-primary text-primary-foreground font-medium py-3 rounded-xl hover:bg-primary/80 transition-colors disabled:opacity-50">Продолжить</button>
            </div>
          </>
        )}

        {step === "register_name" && (
          <>
            <h2 className="text-xl font-bold mb-1">Ваше имя</h2>
            <p className="text-sm text-muted-foreground mb-6">Как вас будут видеть другие</p>
            <div className="space-y-4">
              <Field label="Имя" placeholder="Иван Иванов" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && register()} autoFocus />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <button onClick={register} disabled={loading || !name.trim()} className="w-full bg-primary text-primary-foreground font-medium py-3 rounded-xl hover:bg-primary/80 transition-colors disabled:opacity-50">{loading ? "Создаём профиль..." : "Создать профиль"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Chat view (full screen) ──────────────────────────────────────────────────

function ChatView({ chat, onBack }: { chat: Chat; onBack: () => void }) {
  const [messages, setMessages] = useState<Message[]>(MOCK_MSGS);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = () => {
    if (!text.trim()) return;
    const now = new Date();
    setMessages(p => [...p, { id: p.length + 1, text, time: now.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" }), own: true }]);
    setText("");
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="px-3 py-3 border-b border-border flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="p-1.5 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground shrink-0">
          <Icon name="ArrowLeft" size={18} />
        </button>
        <Avatar initials={chat.avatar} online={chat.online} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate">{chat.name}</span>
            <E2EBadge />
          </div>
          <span className="text-xs text-muted-foreground">{chat.online ? "В сети" : "Был недавно"}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground"><Icon name="Phone" size={15} /></button>
          <button className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground"><Icon name="Video" size={15} /></button>
          <button className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground"><Icon name="MoreVertical" size={15} /></button>
        </div>
      </div>

      <div className="flex justify-center py-2 shrink-0">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-secondary rounded-full px-3 py-1">
          <Icon name="ShieldCheck" size={11} className="text-primary" />Сообщения защищены сквозным шифрованием
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-2">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.own ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-xs lg:max-w-md px-3.5 py-2.5 rounded-2xl text-sm ${msg.own ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border border-border rounded-bl-sm"}`}>
              <p className="leading-relaxed">{msg.text}</p>
              <span className={`text-[10px] mt-1 block text-right ${msg.own ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                {msg.time}{msg.own && <Icon name="CheckCheck" size={10} className="inline ml-1" />}
              </span>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 py-3 border-t border-border shrink-0">
        <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2">
          <button className="text-muted-foreground hover:text-foreground transition-colors"><Icon name="Paperclip" size={15} /></button>
          <input className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" placeholder="Сообщение..." value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} />
          <button onClick={send} className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center hover:bg-primary/80 active:scale-95 transition-all">
            <Icon name="Send" size={13} className="text-primary-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Chats list ───────────────────────────────────────────────────────────────

function ChatsPage() {
  const [openChat, setOpenChat] = useState<Chat | null>(null);
  if (openChat) return <ChatView chat={openChat} onBack={() => setOpenChat(null)} />;

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border shrink-0">
        <div className="relative">
          <Icon name="Search" size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full bg-secondary rounded-lg pl-8 pr-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/40" placeholder="Поиск..." />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {MOCK_CHATS.map(chat => (
          <button key={chat.id} onClick={() => setOpenChat(chat)} className="w-full flex items-center gap-3 px-3 py-3 hover:bg-accent transition-colors text-left border-b border-border/40">
            <Avatar initials={chat.avatar} online={chat.online} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium truncate">{chat.name}</span>
                <span className="text-[11px] text-muted-foreground shrink-0 ml-2">{chat.time}</span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-xs text-muted-foreground truncate">{chat.lastMessage}</span>
                {chat.unread > 0 && <span className="ml-2 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 shrink-0">{chat.unread}</span>}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Contacts ────────────────────────────────────────────────────────────────

function ContactsPage() {
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <div className="relative flex-1">
          <Icon name="Search" size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full bg-secondary rounded-lg pl-8 pr-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/40" placeholder="Поиск контактов..." />
        </div>
        <button className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm px-3 py-2 rounded-lg hover:bg-primary/80 transition-colors shrink-0">
          <Icon name="UserPlus" size={13} />Добавить
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {[
          { label: "В сети", items: MOCK_CONTACTS.filter(c => c.online) },
          { label: "Недавно", items: MOCK_CONTACTS.filter(c => !c.online) },
        ].map(g => (
          <div key={g.label}>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">{g.label} · {g.items.length}</p>
            <div className="space-y-0.5">
              {g.items.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent transition-colors cursor-pointer">
                  <Avatar initials={c.avatar} online={c.online} />
                  <div className="flex-1"><p className="text-sm font-medium">{c.name}</p><p className="text-xs text-muted-foreground">{c.status}</p></div>
                  <div className="flex gap-1">
                    <button className="p-1.5 hover:bg-card rounded-lg transition-colors text-muted-foreground hover:text-foreground"><Icon name="MessageCircle" size={14} /></button>
                    <button className="p-1.5 hover:bg-card rounded-lg transition-colors text-muted-foreground hover:text-foreground"><Icon name="Phone" size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Invites tab ──────────────────────────────────────────────────────────────

function InvitesTab({ token }: { token: string }) {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [invitedCount, setInvitedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(INVITES_URL, { headers: { "X-Session-Token": token } });
    const data = await res.json();
    if (res.ok) { setCodes(data.codes || []); setInvitedCount(data.invited_count || 0); }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    await fetch(INVITES_URL, { method: "POST", headers: { "X-Session-Token": token } });
    await load();
    setGenerating(false);
  };

  const copy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code); setTimeout(() => setCopied(null), 2000);
  };

  const available = codes.filter(c => !c.is_used);
  const used = codes.filter(c => c.is_used);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-4 bg-card border border-border rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Icon name="Users" size={18} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">Приглашено</p>
            <p className="text-xs text-muted-foreground">Вступили по вашим кодам</p>
          </div>
        </div>
        <span className="text-2xl font-bold text-primary">{invitedCount}</span>
      </div>

      <Card icon="Mail" title="Пригласительные коды">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Каждый код одноразовый</p>
          <button onClick={generate} disabled={generating} className="flex items-center gap-1.5 text-xs bg-primary/15 text-primary border border-primary/25 px-2.5 py-1.5 rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50">
            <Icon name="Plus" size={11} />{generating ? "Создаём..." : "Создать"}
          </button>
        </div>
        <div className="px-4 py-3 space-y-2">
          {loading && <p className="text-sm text-muted-foreground text-center py-3">Загрузка...</p>}
          {!loading && available.length === 0 && <p className="text-sm text-muted-foreground text-center py-3">Нажмите «Создать», чтобы сгенерировать приглашение</p>}
          {available.map(c => (
            <div key={c.code} className="flex items-center justify-between p-3 bg-secondary rounded-lg gap-3">
              <span className="font-mono text-xs text-primary break-all">{c.code}</span>
              <button onClick={() => copy(c.code)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0 px-2 py-1 hover:bg-accent rounded transition-colors">
                <Icon name={copied === c.code ? "Check" : "Copy"} size={12} />{copied === c.code ? "Скопировано" : "Копировать"}
              </button>
            </div>
          ))}
          {used.length > 0 && (
            <details>
              <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground py-1 list-none flex items-center gap-1 mt-1">
                <Icon name="ChevronRight" size={12} />Использованные · {used.length}
              </summary>
              <div className="space-y-1.5 mt-2">
                {used.map(c => (
                  <div key={c.code} className="flex items-center justify-between p-2.5 bg-secondary/40 rounded-lg gap-2">
                    <span className="font-mono text-xs line-through text-muted-foreground truncate">{c.code}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">{c.used_by || "—"}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── Privacy tab ─────────────────────────────────────────────────────────────

function PrivacyTab({ user, token, onUpdate }: { user: User; token: string; onUpdate: (u: Partial<User>) => void }) {
  const [saving, setSaving] = useState(false);
  const [local, setLocal] = useState({
    hide_phone: user.hide_phone || false,
    hide_last_seen: user.hide_last_seen || false,
    last_seen_visibility: user.last_seen_visibility || "everyone",
    phone_visibility: user.phone_visibility || "everyone",
  });

  const save = async (patch: Partial<typeof local>) => {
    const next = { ...local, ...patch };
    setLocal(next); setSaving(true);
    await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Session-Token": token },
      body: JSON.stringify({ action: "update_profile", ...patch }),
    });
    onUpdate(patch); setSaving(false);
  };

  const visOpts = [
    { value: "everyone", label: "Все пользователи" },
    { value: "contacts", label: "Только контакты" },
    { value: "nobody", label: "Никто" },
  ];

  return (
    <div className="space-y-3">
      <Card icon="Phone" title="Номер телефона">
        <div className="divide-y divide-border">
          <div className="px-4 py-3.5">
            <Toggle label="Скрыть номер телефона" desc="Другие пользователи не увидят ваш номер" value={local.hide_phone} onChange={() => save({ hide_phone: !local.hide_phone })} />
          </div>
          <div className="px-4 py-3.5">
            <SelectField label="Кто видит ваш номер" value={local.phone_visibility} onChange={v => save({ phone_visibility: v })} options={visOpts} />
          </div>
        </div>
      </Card>

      <Card icon="Clock" title="Время в сети">
        <div className="divide-y divide-border">
          <div className="px-4 py-3.5">
            <Toggle label="Скрыть время последнего визита" desc="Вместо времени другие увидят «Был недавно»" value={local.hide_last_seen} onChange={() => save({ hide_last_seen: !local.hide_last_seen })} />
          </div>
          <div className="px-4 py-3.5">
            <SelectField label="Кто видит время вашего визита" value={local.last_seen_visibility} onChange={v => save({ last_seen_visibility: v })} options={visOpts} />
          </div>
        </div>
      </Card>

      {saving && <p className="text-xs text-muted-foreground text-center animate-pulse">Сохраняем...</p>}
    </div>
  );
}

// ─── Settings ────────────────────────────────────────────────────────────────

const SETTINGS_TABS: { id: SettingsTab; icon: string; label: string; desc: string }[] = [
  { id: "notifications", icon: "Bell", label: "Уведомления", desc: "Push, звуки" },
  { id: "security", icon: "Shield", label: "Безопасность", desc: "2FA, автоудаление" },
  { id: "privacy", icon: "Eye", label: "Приватность", desc: "Номер, время онлайн" },
  { id: "invites", icon: "Mail", label: "Пригласить друга", desc: "Коды приглашения" },
  { id: "about", icon: "Info", label: "О приложении", desc: "Версия, протокол" },
];

function SettingsPage({ user, token, onUpdate }: { user: User; token: string; onUpdate: (u: Partial<User>) => void }) {
  const [activeTab, setActiveTab] = useState<SettingsTab | null>(null);
  const [notif, setNotif] = useState(true);
  const [sounds, setSounds] = useState(true);
  const [twoFactor, setTwoFactor] = useState(false);
  const [autoDelete, setAutoDelete] = useState(false);

  if (activeTab) {
    const tabMeta = SETTINGS_TABS.find(t => t.id === activeTab);
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
                <div className="px-4 py-3.5"><Toggle label="Звуки" desc="Звуковые сигналы при сообщениях" value={sounds} onChange={() => setSounds(v => !v)} /></div>
              </div>
            </Card>
          )}
          {activeTab === "security" && (
            <div className="space-y-3">
              <Card icon="Shield" title="Безопасность">
                <div className="divide-y divide-border">
                  <div className="px-4 py-3.5"><Toggle label="Двухфакторная аутентификация" desc="Дополнительный уровень защиты" value={twoFactor} onChange={() => setTwoFactor(v => !v)} /></div>
                  <div className="px-4 py-3.5"><Toggle label="Автоудаление сообщений" desc="Через 30 дней" value={autoDelete} onChange={() => setAutoDelete(v => !v)} /></div>
                </div>
              </Card>
              <Card icon="ShieldCheck" title="Шифрование">
                <div className="px-4 py-4">
                  <div className="flex items-start gap-3 p-3 bg-primary/6 border border-primary/15 rounded-lg">
                    <Icon name="Lock" size={16} className="text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-primary">Сквозное шифрование активно</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Все сообщения защищены по протоколу E2E. Никто, кроме участников, не может их прочитать.</p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}
          {activeTab === "privacy" && <PrivacyTab user={user} token={token} onUpdate={onUpdate} />}
          {activeTab === "invites" && <InvitesTab token={token} />}
          {activeTab === "about" && (
            <Card icon="Info" title="О приложении">
              <div className="divide-y divide-border">
                {[{ label: "Версия", value: "1.0.0" }, { label: "Протокол", value: "Signal E2E" }, { label: "Маршрутизация", value: "P2P Mesh" }].map(r => (
                  <div key={r.label} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm">{r.label}</span>
                    <span className="text-sm text-muted-foreground font-mono">{r.value}</span>
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
          {SETTINGS_TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className="w-full flex items-center gap-3 px-4 py-3.5 bg-card border border-border rounded-xl hover:bg-accent transition-colors text-left">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Icon name={tab.icon} size={16} className="text-primary" />
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

function ProfilePage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const initials = user.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-lg mx-auto p-5">
        <div className="flex flex-col items-center py-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/40 to-primary/10 border-2 border-primary/30 flex items-center justify-center text-xl font-bold text-primary mb-3">
            {initials}
          </div>
          <h2 className="text-lg font-semibold">{user.name}</h2>
          {user.display_id && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-xs text-muted-foreground">ID:</span>
              <span className="font-mono text-xs text-primary bg-primary/8 border border-primary/15 px-2 py-0.5 rounded">{user.display_id}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 pulse-dot" />
            <span className="text-xs text-muted-foreground">В сети</span>
          </div>
          <button className="mt-4 flex items-center gap-2 text-sm bg-secondary border border-border px-4 py-2 rounded-lg hover:bg-accent transition-colors">
            <Icon name="Edit2" size={13} />Редактировать
          </button>
        </div>

        <div className="space-y-3">
          <Card icon="User" title="Личные данные">
            <div className="divide-y divide-border">
              {[
                { label: "Имя", value: user.name },
                { label: "Телефон", value: user.hide_phone ? "Скрыт" : user.phone },
                { label: "ID", value: user.display_id || "—" },
                { label: "О себе", value: user.about || "—" },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">{r.label}</span>
                  <span className="text-sm font-mono">{r.value}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card icon="Key" title="Ключи шифрования">
            <div className="px-4 py-4 space-y-3">
              <div className="p-3 bg-secondary rounded-lg">
                <p className="text-[11px] text-muted-foreground mb-1">Публичный ключ</p>
                <p className="text-xs font-mono break-all leading-relaxed">sf1x9Km2...pQ8nR4vT</p>
              </div>
              <button className="w-full flex items-center justify-center gap-2 text-xs border border-border py-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
                <Icon name="RefreshCw" size={12} />Обновить ключи
              </button>
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
  { id: "chats", icon: "MessageSquare", label: "Чаты" },
  { id: "contacts", icon: "Users", label: "Контакты" },
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

  const totalUnread = MOCK_CHATS.reduce((a, c) => a + c.unread, 0);

  if (checking) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
          <Icon name="Radio" size={18} className="text-primary" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen bg-background text-foreground">
        <AuthFlow onSuccess={handleAuth} />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="h-11 flex items-center px-4 border-b border-border shrink-0">
          <div className="w-6 h-6 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center mr-2.5">
            <Icon name="Radio" size={12} className="text-primary" />
          </div>
          <span className="font-semibold text-sm">{NAV.find(n => n.id === tab)?.label}</span>
          <div className="ml-auto flex items-center gap-1.5 text-muted-foreground">
            <Icon name="Lock" size={10} className="text-primary" />
            <span className="font-mono text-[10px]">E2E encrypted</span>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {tab === "chats" && <ChatsPage />}
          {tab === "contacts" && <ContactsPage />}
          {tab === "settings" && <SettingsPage user={user} token={token} onUpdate={handleUpdate} />}
          {tab === "profile" && <ProfilePage user={user} onLogout={handleLogout} />}
        </div>
      </main>

      <nav className="h-16 flex items-center justify-around px-2 border-t border-border bg-card shrink-0">
        {NAV.map(item => (
          <button key={item.id} onClick={() => setTab(item.id)} className={`relative flex flex-col items-center gap-1 px-5 py-2 rounded-xl transition-all ${tab === item.id ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            {tab === item.id && <span className="absolute inset-0 bg-primary/8 rounded-xl" />}
            <div className="relative">
              <Icon name={item.icon} size={19} />
              {item.id === "chats" && totalUnread > 0 && (
                <span className="absolute -top-1 -right-1.5 w-3.5 h-3.5 bg-primary rounded-full text-[9px] text-primary-foreground font-bold flex items-center justify-center">
                  {totalUnread > 9 ? "9+" : totalUnread}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium relative">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
