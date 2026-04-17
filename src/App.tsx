import { useState, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";
import func2url from "../backend/func2url.json";

const AUTH_URL = func2url.auth;
const INVITES_URL = func2url.invites;

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = "chats" | "contacts" | "settings" | "profile";
type AuthScreen = "welcome" | "login" | "register";

interface User {
  id: number;
  phone: string;
  name: string;
  username?: string;
  about?: string;
}

interface InviteCode {
  code: string;
  is_used: boolean;
  created_at: string;
  used_at: string | null;
  used_by: string | null;
}

interface Message { id: number; text: string; time: string; own: boolean; }
interface Chat { id: number; name: string; avatar: string; lastMessage: string; time: string; unread: number; online: boolean; }
interface Contact { id: number; name: string; avatar: string; status: string; online: boolean; }

// ─── Mock data ────────────────────────────────────────────────────────────────

const CHATS: Chat[] = [
  { id: 1, name: "Алексей Громов", avatar: "АГ", lastMessage: "Договорились на завтра", time: "14:32", unread: 2, online: true },
  { id: 2, name: "Мария Кузнецова", avatar: "МК", lastMessage: "Спасибо за документы!", time: "13:15", unread: 0, online: true },
  { id: 3, name: "Рабочая группа", avatar: "РГ", lastMessage: "Встреча в пятницу в 10:00", time: "11:48", unread: 5, online: false },
  { id: 4, name: "Дмитрий Волков", avatar: "ДВ", lastMessage: "Посмотрю и отвечу", time: "Вчера", unread: 0, online: false },
];

const CONTACTS: Contact[] = [
  { id: 1, name: "Алексей Громов", avatar: "АГ", status: "В сети", online: true },
  { id: 2, name: "Мария Кузнецова", avatar: "МК", status: "В сети", online: true },
  { id: 3, name: "Ольга Смирнова", avatar: "ОС", status: "В сети", online: true },
  { id: 4, name: "Дмитрий Волков", avatar: "ДВ", status: "Был недавно", online: false },
  { id: 5, name: "Никита Орлов", avatar: "НО", status: "Недоступен", online: false },
];

const INIT_MESSAGES: Message[] = [
  { id: 1, text: "Привет! Как продвигается работа?", time: "14:10", own: false },
  { id: 2, text: "Всё идёт по плану.", time: "14:12", own: true },
  { id: 3, text: "Нужно согласовать детали по интеграции", time: "14:20", own: false },
  { id: 4, text: "Давай обсудим в 15:00?", time: "14:25", own: true },
  { id: 5, text: "Договорились на завтра", time: "14:32", own: false },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

// ─── UI atoms ────────────────────────────────────────────────────────────────

function AvatarBubble({ initials, size = "md", online }: { initials: string; size?: "sm" | "md" | "lg"; online?: boolean }) {
  const sizes = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-16 h-16 text-lg" };
  return (
    <div className="relative shrink-0">
      <div className={`${sizes[size]} rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center font-semibold text-primary`}>
        {initials}
      </div>
      {online !== undefined && (
        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-background ${online ? "bg-green-400" : "bg-muted-foreground/30"}`} />
      )}
    </div>
  );
}

function EncryptBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-primary/80 bg-primary/8 border border-primary/15 rounded px-1.5 py-0.5">
      <Icon name="Lock" size={9} />E2E
    </span>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${value ? "bg-primary" : "bg-secondary border border-border"}`}>
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${value ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

function Input({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1.5 block">{label}</label>
      <input
        className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-all"
        {...props}
      />
    </div>
  );
}

// ─── Auth screens ─────────────────────────────────────────────────────────────

function WelcomeScreen({ onLogin, onRegister }: { onLogin: () => void; onRegister: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center mb-6">
        <Icon name="Radio" size={28} className="text-primary" />
      </div>
      <h1 className="text-2xl font-bold mb-1">Sfera</h1>
      <p className="text-sm text-muted-foreground text-center mb-8 max-w-xs">
        Защищённый мессенджер со сквозным шифрованием. Вход только по приглашению.
      </p>
      <div className="w-full max-w-xs space-y-3">
        <button
          onClick={onLogin}
          className="w-full bg-primary text-primary-foreground font-medium py-3 rounded-xl hover:bg-primary/80 transition-colors"
        >
          Войти
        </button>
        <button
          onClick={onRegister}
          className="w-full bg-secondary border border-border text-foreground font-medium py-3 rounded-xl hover:bg-accent transition-colors"
        >
          У меня есть приглашение
        </button>
      </div>
      <div className="flex items-center gap-1.5 mt-8 text-xs text-muted-foreground">
        <Icon name="ShieldCheck" size={12} className="text-primary" />
        Сквозное E2E шифрование
      </div>
    </div>
  );
}

function LoginScreen({ onBack, onSuccess }: { onBack: () => void; onSuccess: (user: User, token: string) => void }) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(AUTH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Ошибка входа"); return; }
      onSuccess(data.user, data.token);
    } catch {
      setError("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full px-6 pt-8 animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
        <Icon name="ArrowLeft" size={15} />
        Назад
      </button>
      <div className="flex-1 flex flex-col justify-center max-w-xs mx-auto w-full">
        <h2 className="text-xl font-bold mb-1">Добро пожаловать</h2>
        <p className="text-sm text-muted-foreground mb-6">Введите номер телефона</p>
        <div className="space-y-4">
          <Input label="Номер телефона" type="tel" placeholder="+7 900 000-00-00" value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} autoFocus />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            onClick={submit}
            disabled={loading || !phone.trim()}
            className="w-full bg-primary text-primary-foreground font-medium py-3 rounded-xl hover:bg-primary/80 transition-colors disabled:opacity-50"
          >
            {loading ? "Входим..." : "Войти"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RegisterScreen({ onBack, onSuccess }: { onBack: () => void; onSuccess: (user: User, token: string) => void }) {
  const [step, setStep] = useState<"invite" | "details">("invite");
  const [inviteCode, setInviteCode] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!phone.trim() || !name.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(AUTH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register", phone: phone.trim(), name: name.trim(), invite_code: inviteCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Ошибка регистрации"); return; }
      onSuccess(data.user, data.token);
    } catch {
      setError("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full px-6 pt-8 animate-fade-in">
      <button onClick={step === "invite" ? onBack : () => setStep("invite")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
        <Icon name="ArrowLeft" size={15} />
        Назад
      </button>
      <div className="flex-1 flex flex-col justify-center max-w-xs mx-auto w-full">
        {step === "invite" ? (
          <>
            <h2 className="text-xl font-bold mb-1">Код приглашения</h2>
            <p className="text-sm text-muted-foreground mb-6">Введите уникальный код, который вам отправили</p>
            <div className="space-y-4">
              <Input
                label="Пригласительный код"
                placeholder="SF-XXXXXXXX"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && inviteCode.trim() && setStep("details")}
                className="font-mono uppercase"
                autoFocus
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <button
                onClick={() => { setError(""); setStep("details"); }}
                disabled={!inviteCode.trim()}
                className="w-full bg-primary text-primary-foreground font-medium py-3 rounded-xl hover:bg-primary/80 transition-colors disabled:opacity-50"
              >
                Продолжить
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold mb-1">Создать профиль</h2>
            <p className="text-sm text-muted-foreground mb-6">Введите ваши данные</p>
            <div className="space-y-4">
              <Input label="Имя" placeholder="Иван Иванов" value={name} onChange={e => setName(e.target.value)} autoFocus />
              <Input label="Номер телефона" type="tel" placeholder="+7 900 000-00-00" value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <button
                onClick={submit}
                disabled={loading || !phone.trim() || !name.trim()}
                className="w-full bg-primary text-primary-foreground font-medium py-3 rounded-xl hover:bg-primary/80 transition-colors disabled:opacity-50"
              >
                {loading ? "Создаём профиль..." : "Создать профиль"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── App sections ─────────────────────────────────────────────────────────────

function ChatsPage() {
  const [activeChat, setActiveChat] = useState<Chat>(CHATS[0]);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>(INIT_MESSAGES);

  const sendMessage = () => {
    if (!message.trim()) return;
    const now = new Date();
    setMessages(prev => [...prev, { id: prev.length + 1, text: message, time: now.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" }), own: true }]);
    setMessage("");
  };

  return (
    <div className="flex h-full">
      <div className="w-72 border-r border-border flex flex-col shrink-0">
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Icon name="Search" size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input className="w-full bg-secondary rounded-lg pl-8 pr-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/40" placeholder="Поиск..." />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {CHATS.map((chat) => (
            <button key={chat.id} onClick={() => setActiveChat(chat)} className={`w-full flex items-center gap-3 px-3 py-3 hover:bg-accent transition-colors text-left border-b border-border/40 ${activeChat?.id === chat.id ? "bg-primary/6" : ""}`}>
              <AvatarBubble initials={chat.avatar} online={chat.online} />
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
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AvatarBubble initials={activeChat.avatar} online={activeChat.online} />
            <div>
              <div className="flex items-center gap-2"><span className="font-semibold text-sm">{activeChat.name}</span><EncryptBadge /></div>
              <span className="text-xs text-muted-foreground">{activeChat.online ? "В сети" : "Был недавно"}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground"><Icon name="Phone" size={15} /></button>
            <button className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground"><Icon name="Video" size={15} /></button>
            <button className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground"><Icon name="MoreVertical" size={15} /></button>
          </div>
        </div>
        <div className="mx-auto mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground bg-secondary rounded-full px-3 py-1">
          <Icon name="ShieldCheck" size={11} className="text-primary" />
          Сообщения защищены сквозным шифрованием
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.own ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-xs lg:max-w-md px-3.5 py-2.5 rounded-2xl text-sm ${msg.own ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border border-border text-foreground rounded-bl-sm"}`}>
                <p className="leading-relaxed">{msg.text}</p>
                <span className={`text-[10px] mt-1 block text-right ${msg.own ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                  {msg.time}{msg.own && <Icon name="CheckCheck" size={10} className="inline ml-1" />}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-border">
          <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2">
            <button className="text-muted-foreground hover:text-foreground transition-colors"><Icon name="Paperclip" size={15} /></button>
            <input className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" placeholder="Сообщение..." value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} />
            <button onClick={sendMessage} className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center hover:bg-primary/80 active:scale-95 transition-all">
              <Icon name="Send" size={13} className="text-primary-foreground" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContactsPage() {
  const online = CONTACTS.filter(c => c.online);
  const offline = CONTACTS.filter(c => !c.online);
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Icon name="Search" size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full bg-secondary rounded-lg pl-8 pr-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/40" placeholder="Поиск контактов..." />
        </div>
        <button className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm px-3 py-2 rounded-lg hover:bg-primary/80 transition-colors shrink-0">
          <Icon name="UserPlus" size={13} />Добавить
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {[{ label: "В сети", items: online }, { label: "Недавно", items: offline }].map((group) => (
          <div key={group.label}>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">{group.label} · {group.items.length}</p>
            <div className="space-y-0.5">
              {group.items.map((contact) => (
                <div key={contact.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent transition-colors cursor-pointer">
                  <AvatarBubble initials={contact.avatar} online={contact.online} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{contact.name}</p>
                    <p className="text-xs text-muted-foreground">{contact.status}</p>
                  </div>
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

function InvitesSection({ token }: { token: string }) {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(INVITES_URL, { headers: { "X-Session-Token": token } });
      const data = await res.json();
      if (res.ok) setCodes(data.codes || []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(INVITES_URL, { method: "POST", headers: { "X-Session-Token": token } });
      if (res.ok) await load();
    } finally {
      setGenerating(false);
    }
  };

  const copy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const available = codes.filter(c => !c.is_used);
  const used = codes.filter(c => c.is_used);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Icon name="Mail" size={13} className="text-primary" />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Пригласить друга</span>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="flex items-center gap-1.5 text-xs bg-primary/15 text-primary border border-primary/25 px-2.5 py-1 rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          <Icon name="Plus" size={11} />
          {generating ? "Создаём..." : "Новый код"}
        </button>
      </div>

      {loading ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">Загрузка...</div>
      ) : (
        <div className="px-4 py-3 space-y-2">
          {available.length === 0 && used.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-3">Нажмите «Новый код», чтобы создать приглашение</p>
          )}
          {available.map(c => (
            <div key={c.code} className="flex items-center justify-between p-2.5 bg-secondary rounded-lg">
              <div>
                <span className="font-mono text-sm text-primary">{c.code}</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">Не использован</p>
              </div>
              <button
                onClick={() => copy(c.code)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent"
              >
                <Icon name={copied === c.code ? "Check" : "Copy"} size={12} />
                {copied === c.code ? "Скопировано" : "Копировать"}
              </button>
            </div>
          ))}
          {used.length > 0 && (
            <details className="mt-1">
              <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors py-1">
                Использованные коды · {used.length}
              </summary>
              <div className="space-y-1.5 mt-2">
                {used.map(c => (
                  <div key={c.code} className="flex items-center justify-between p-2.5 bg-secondary/50 rounded-lg opacity-60">
                    <span className="font-mono text-sm line-through text-muted-foreground">{c.code}</span>
                    <span className="text-[11px] text-muted-foreground">{c.used_by || "Использован"}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function SettingsPage({ token }: { token: string }) {
  const [notif, setNotif] = useState(true);
  const [sounds, setSounds] = useState(true);
  const [twoFactor, setTwoFactor] = useState(false);
  const [autoDelete, setAutoDelete] = useState(false);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-lg mx-auto p-5 space-y-3">
        <h2 className="text-base font-semibold mb-4">Настройки</h2>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Icon name="Bell" size={13} className="text-primary" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Уведомления</span>
          </div>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between px-4 py-3.5">
              <div><p className="text-sm font-medium">Push-уведомления</p><p className="text-xs text-muted-foreground mt-0.5">Уведомления на устройстве</p></div>
              <Toggle value={notif} onChange={() => setNotif(v => !v)} />
            </div>
            <div className="flex items-center justify-between px-4 py-3.5">
              <div><p className="text-sm font-medium">Звуки</p><p className="text-xs text-muted-foreground mt-0.5">Звуковые сигналы</p></div>
              <Toggle value={sounds} onChange={() => setSounds(v => !v)} />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Icon name="Shield" size={13} className="text-primary" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Безопасность</span>
          </div>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between px-4 py-3.5">
              <div><p className="text-sm font-medium">Двухфакторная аутентификация</p><p className="text-xs text-muted-foreground mt-0.5">Дополнительный уровень защиты</p></div>
              <Toggle value={twoFactor} onChange={() => setTwoFactor(v => !v)} />
            </div>
            <div className="flex items-center justify-between px-4 py-3.5">
              <div><p className="text-sm font-medium">Автоудаление сообщений</p><p className="text-xs text-muted-foreground mt-0.5">Через 30 дней</p></div>
              <Toggle value={autoDelete} onChange={() => setAutoDelete(v => !v)} />
            </div>
          </div>
        </div>

        <InvitesSection token={token} />

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Icon name="ShieldCheck" size={13} className="text-primary" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Шифрование</span>
          </div>
          <div className="px-4 py-4">
            <div className="flex items-start gap-3 p-3 bg-primary/6 border border-primary/15 rounded-lg">
              <Icon name="Lock" size={16} className="text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-primary">Сквозное шифрование активно</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Все сообщения защищены по протоколу E2E. Никто, кроме участников, не может их прочитать.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfilePage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const initials = getInitials(user.name);
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-lg mx-auto p-5">
        <div className="flex flex-col items-center py-6 animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/40 to-primary/10 border-2 border-primary/30 flex items-center justify-center text-xl font-bold text-primary mb-3">
            {initials}
          </div>
          <h2 className="text-lg font-semibold">{user.name}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{user.phone}</p>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 pulse-dot" />
            <span className="text-xs text-muted-foreground">В сети</span>
          </div>
          <button className="mt-4 flex items-center gap-2 text-sm bg-secondary border border-border px-4 py-2 rounded-lg hover:bg-accent transition-colors">
            <Icon name="Edit2" size={13} />
            Редактировать
          </button>
        </div>
        <div className="space-y-3">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Icon name="User" size={13} className="text-primary" />
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Личные данные</span>
            </div>
            <div className="divide-y divide-border">
              {[
                { label: "Имя", value: user.name },
                { label: "Телефон", value: user.phone },
                { label: "О себе", value: user.about || "—" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">{row.label}</span>
                  <span className="text-sm">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Icon name="Key" size={13} className="text-primary" />
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Ключи шифрования</span>
            </div>
            <div className="px-4 py-4 space-y-3">
              <div className="p-3 bg-secondary rounded-lg">
                <p className="text-[11px] text-muted-foreground mb-1">Публичный ключ</p>
                <p className="text-xs font-mono break-all leading-relaxed text-foreground">sf1x9Km2...pQ8nR4vT</p>
              </div>
              <button className="w-full flex items-center justify-center gap-2 text-xs border border-border py-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
                <Icon name="RefreshCw" size={12} />
                Обновить ключи
              </button>
            </div>
          </div>
          <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 text-sm text-destructive border border-destructive/20 bg-destructive/5 py-3 rounded-xl hover:bg-destructive/10 transition-colors">
            <Icon name="LogOut" size={14} />
            Выйти из аккаунта
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
  const [authScreen, setAuthScreen] = useState<AuthScreen>("welcome");
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string>(() => localStorage.getItem("sf_token") || "");
  const [tab, setTab] = useState<Tab>("chats");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!token) { setChecking(false); return; }
    fetch(AUTH_URL, { headers: { "X-Session-Token": token } })
      .then(r => r.json())
      .then(data => {
        if (data.user) setUser(data.user);
        else { localStorage.removeItem("sf_token"); setToken(""); }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  const handleAuth = (u: User, t: string) => {
    setUser(u);
    setToken(t);
    localStorage.setItem("sf_token", t);
  };

  const handleLogout = () => {
    setUser(null);
    setToken("");
    localStorage.removeItem("sf_token");
    setAuthScreen("welcome");
  };

  const totalUnread = CHATS.reduce((acc, c) => acc + c.unread, 0);

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
      <div className="h-screen bg-background text-foreground flex flex-col">
        <div className="flex-1 overflow-hidden">
          {authScreen === "welcome" && <WelcomeScreen onLogin={() => setAuthScreen("login")} onRegister={() => setAuthScreen("register")} />}
          {authScreen === "login" && <LoginScreen onBack={() => setAuthScreen("welcome")} onSuccess={handleAuth} />}
          {authScreen === "register" && <RegisterScreen onBack={() => setAuthScreen("welcome")} onSuccess={handleAuth} />}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Main content */}
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="h-11 flex items-center px-5 border-b border-border shrink-0">
          <div className="w-6 h-6 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center mr-3">
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
          {tab === "settings" && <SettingsPage token={token} />}
          {tab === "profile" && <ProfilePage user={user} onLogout={handleLogout} />}
        </div>
      </main>

      {/* Bottom nav */}
      <nav className="h-16 flex items-center justify-around px-2 border-t border-border bg-card shrink-0">
        {NAV.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`relative flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${
              tab === item.id ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === item.id && (
              <span className="absolute inset-0 bg-primary/8 rounded-xl" />
            )}
            <div className="relative">
              <Icon name={item.icon} size={19} />
              {item.id === "chats" && totalUnread > 0 && (
                <span className="absolute -top-1 -right-1.5 w-3.5 h-3.5 bg-primary rounded-full text-[9px] text-primary-foreground font-bold flex items-center justify-center">{totalUnread > 9 ? "9+" : totalUnread}</span>
              )}
            </div>
            <span className={`text-[10px] font-medium relative ${tab === item.id ? "text-primary" : ""}`}>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
