import { useState } from "react";
import Icon from "@/components/ui/icon";

type Tab = "chats" | "contacts" | "settings" | "profile";

interface Message {
  id: number;
  text: string;
  time: string;
  own: boolean;
}

interface Chat {
  id: number;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
}

interface Contact {
  id: number;
  name: string;
  avatar: string;
  status: string;
  online: boolean;
}

const CHATS: Chat[] = [
  { id: 1, name: "Алексей Громов", avatar: "АГ", lastMessage: "Договорились на завтра", time: "14:32", unread: 2, online: true },
  { id: 2, name: "Мария Кузнецова", avatar: "МК", lastMessage: "Спасибо за документы!", time: "13:15", unread: 0, online: true },
  { id: 3, name: "Рабочая группа", avatar: "РГ", lastMessage: "Встреча в пятницу в 10:00", time: "11:48", unread: 5, online: false },
  { id: 4, name: "Дмитрий Волков", avatar: "ДВ", lastMessage: "Посмотрю и отвечу", time: "Вчера", unread: 0, online: false },
  { id: 5, name: "Команда продукта", avatar: "КП", lastMessage: "Новый релиз готов", time: "Вчера", unread: 1, online: false },
];

const CONTACTS: Contact[] = [
  { id: 1, name: "Алексей Громов", avatar: "АГ", status: "В сети", online: true },
  { id: 2, name: "Мария Кузнецова", avatar: "МК", status: "В сети", online: true },
  { id: 3, name: "Ольга Смирнова", avatar: "ОС", status: "В сети", online: true },
  { id: 4, name: "Дмитрий Волков", avatar: "ДВ", status: "Был недавно", online: false },
  { id: 5, name: "Никита Орлов", avatar: "НО", status: "Недоступен", online: false },
  { id: 6, name: "Павел Иванов", avatar: "ПИ", status: "Был вчера", online: false },
];

const INIT_MESSAGES: Message[] = [
  { id: 1, text: "Привет! Как продвигается работа над проектом?", time: "14:10", own: false },
  { id: 2, text: "Всё идёт по плану. Закончу к завтрашнему утру.", time: "14:12", own: true },
  { id: 3, text: "Нужно ещё согласовать детали по интеграции", time: "14:20", own: false },
  { id: 4, text: "Давай обсудим в 15:00? Я буду свободен", time: "14:25", own: true },
  { id: 5, text: "Договорились на завтра", time: "14:32", own: false },
];

function AvatarBubble({ initials, size = "md", online }: { initials: string; size?: "sm" | "md" | "lg"; online?: boolean }) {
  const sizes = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-14 h-14 text-lg" };
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
      <Icon name="Lock" size={9} />
      E2E
    </span>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${value ? "bg-primary" : "bg-secondary border border-border"}`}
    >
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${value ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

function ChatsPage() {
  const [activeChat, setActiveChat] = useState<Chat>(CHATS[0]);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>(INIT_MESSAGES);

  const sendMessage = () => {
    if (!message.trim()) return;
    const now = new Date();
    setMessages(prev => [...prev, {
      id: prev.length + 1,
      text: message,
      time: now.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" }),
      own: true
    }]);
    setMessage("");
  };

  return (
    <div className="flex h-full">
      <div className="w-72 border-r border-border flex flex-col shrink-0">
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Icon name="Search" size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              className="w-full bg-secondary rounded-lg pl-8 pr-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/40"
              placeholder="Поиск..."
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {CHATS.map((chat) => (
            <button
              key={chat.id}
              onClick={() => setActiveChat(chat)}
              className={`w-full flex items-center gap-3 px-3 py-3 hover:bg-accent transition-colors text-left border-b border-border/40 ${activeChat?.id === chat.id ? "bg-primary/6" : ""}`}
            >
              <AvatarBubble initials={chat.avatar} online={chat.online} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate">{chat.name}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0 ml-2">{chat.time}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs text-muted-foreground truncate">{chat.lastMessage}</span>
                  {chat.unread > 0 && (
                    <span className="ml-2 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 shrink-0">
                      {chat.unread}
                    </span>
                  )}
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
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{activeChat.name}</span>
                <EncryptBadge />
              </div>
              <span className="text-xs text-muted-foreground">{activeChat.online ? "В сети" : "Был недавно"}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground">
              <Icon name="Phone" size={15} />
            </button>
            <button className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground">
              <Icon name="Video" size={15} />
            </button>
            <button className="p-2 hover:bg-accent rounded-lg transition-colors text-muted-foreground hover:text-foreground">
              <Icon name="MoreVertical" size={15} />
            </button>
          </div>
        </div>

        <div className="mx-auto mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground bg-secondary rounded-full px-3 py-1">
          <Icon name="ShieldCheck" size={11} className="text-primary" />
          Сообщения защищены сквозным шифрованием
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.own ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-xs lg:max-w-md px-3.5 py-2.5 rounded-2xl text-sm ${
                msg.own
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-card border border-border text-foreground rounded-bl-sm"
              }`}>
                <p className="leading-relaxed">{msg.text}</p>
                <span className={`text-[10px] mt-1 block text-right ${msg.own ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                  {msg.time}
                  {msg.own && <Icon name="CheckCheck" size={10} className="inline ml-1" />}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-border">
          <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2">
            <button className="text-muted-foreground hover:text-foreground transition-colors">
              <Icon name="Paperclip" size={15} />
            </button>
            <input
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Сообщение..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <button
              onClick={sendMessage}
              className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center hover:bg-primary/80 active:scale-95 transition-all"
            >
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
          <input
            className="w-full bg-secondary rounded-lg pl-8 pr-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/40"
            placeholder="Поиск контактов..."
          />
        </div>
        <button className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm px-3 py-2 rounded-lg hover:bg-primary/80 transition-colors shrink-0">
          <Icon name="UserPlus" size={13} />
          Добавить
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {[{ label: "В сети", items: online }, { label: "Недавно", items: offline }].map((group) => (
          <div key={group.label}>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
              {group.label} · {group.items.length}
            </p>
            <div className="space-y-0.5">
              {group.items.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent transition-colors cursor-pointer"
                >
                  <AvatarBubble initials={contact.avatar} online={contact.online} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{contact.name}</p>
                    <p className="text-xs text-muted-foreground">{contact.status}</p>
                  </div>
                  <div className="flex gap-1">
                    <button className="p-1.5 hover:bg-card rounded-lg transition-colors text-muted-foreground hover:text-foreground">
                      <Icon name="MessageCircle" size={14} />
                    </button>
                    <button className="p-1.5 hover:bg-card rounded-lg transition-colors text-muted-foreground hover:text-foreground">
                      <Icon name="Phone" size={14} />
                    </button>
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

function SettingsPage() {
  const [notif, setNotif] = useState(true);
  const [sounds, setSounds] = useState(true);
  const [twoFactor, setTwoFactor] = useState(false);
  const [autoDelete, setAutoDelete] = useState(false);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-lg mx-auto p-5 space-y-3">
        <h2 className="text-base font-semibold mb-4">Настройки</h2>

        {/* Notifications */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Icon name="Bell" size={13} className="text-primary" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Уведомления</span>
          </div>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between px-4 py-3.5">
              <div>
                <p className="text-sm font-medium">Push-уведомления</p>
                <p className="text-xs text-muted-foreground mt-0.5">Уведомления на устройстве</p>
              </div>
              <Toggle value={notif} onChange={() => setNotif(v => !v)} />
            </div>
            <div className="flex items-center justify-between px-4 py-3.5">
              <div>
                <p className="text-sm font-medium">Звуки</p>
                <p className="text-xs text-muted-foreground mt-0.5">Звуковые сигналы при сообщениях</p>
              </div>
              <Toggle value={sounds} onChange={() => setSounds(v => !v)} />
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Icon name="Shield" size={13} className="text-primary" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Безопасность</span>
          </div>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between px-4 py-3.5">
              <div>
                <p className="text-sm font-medium">Двухфакторная аутентификация</p>
                <p className="text-xs text-muted-foreground mt-0.5">Дополнительный уровень защиты</p>
              </div>
              <Toggle value={twoFactor} onChange={() => setTwoFactor(v => !v)} />
            </div>
            <div className="flex items-center justify-between px-4 py-3.5">
              <div>
                <p className="text-sm font-medium">Автоудаление сообщений</p>
                <p className="text-xs text-muted-foreground mt-0.5">Удалять переписку через 30 дней</p>
              </div>
              <Toggle value={autoDelete} onChange={() => setAutoDelete(v => !v)} />
            </div>
          </div>
        </div>

        {/* E2E info */}
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
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Все сообщения защищены по протоколу E2E. Никто, кроме участников диалога, не может их прочитать — даже серверы приложения.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* About */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Icon name="Info" size={13} className="text-primary" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">О приложении</span>
          </div>
          <div className="divide-y divide-border">
            {[{ label: "Версия", value: "1.0.0" }, { label: "Протокол", value: "Signal E2E" }, { label: "Маршрутизация", value: "P2P Direct" }].map((row) => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm">{row.label}</span>
                <span className="text-sm text-muted-foreground font-mono">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfilePage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-lg mx-auto p-5">
        <div className="flex flex-col items-center py-6 animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/40 to-primary/10 border-2 border-primary/30 flex items-center justify-center text-xl font-bold text-primary mb-3">
            ИП
          </div>
          <h2 className="text-lg font-semibold">Илья Петров</h2>
          <p className="text-sm text-muted-foreground mt-0.5">@ilya_petrov</p>
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
                { label: "Имя", value: "Илья Петров" },
                { label: "Телефон", value: "+7 900 000-00-00" },
                { label: "Email", value: "ilya@example.com" },
                { label: "О себе", value: "Разработчик" },
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

          <button className="w-full flex items-center justify-center gap-2 text-sm text-destructive border border-destructive/20 bg-destructive/5 py-3 rounded-xl hover:bg-destructive/10 transition-colors">
            <Icon name="LogOut" size={14} />
            Выйти из аккаунта
          </button>
        </div>
      </div>
    </div>
  );
}

const NAV: { id: Tab; icon: string; label: string }[] = [
  { id: "chats", icon: "MessageSquare", label: "Чаты" },
  { id: "contacts", icon: "Users", label: "Контакты" },
  { id: "settings", icon: "Settings", label: "Настройки" },
  { id: "profile", icon: "User", label: "Профиль" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("chats");
  const totalUnread = CHATS.reduce((acc, c) => acc + c.unread, 0);

  return (
    <div className="h-screen flex bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <nav className="w-[60px] flex flex-col items-center py-4 gap-1 border-r border-border bg-card shrink-0">
        <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center mb-3">
          <Icon name="Radio" size={15} className="text-primary" />
        </div>
        {NAV.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            title={item.label}
            className={`relative w-10 h-10 flex items-center justify-center rounded-xl transition-all ${
              tab === item.id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <Icon name={item.icon} size={17} />
            {item.id === "chats" && totalUnread > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
            )}
          </button>
        ))}
        <div className="flex-1" />
        <div className="w-1.5 h-1.5 rounded-full bg-green-400 pulse-dot" title="Зашифровано" />
      </nav>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="h-11 flex items-center px-5 border-b border-border shrink-0">
          <span className="font-semibold text-sm">{NAV.find(n => n.id === tab)?.label}</span>
          <div className="ml-auto flex items-center gap-1.5 text-muted-foreground">
            <Icon name="Lock" size={10} className="text-primary" />
            <span className="font-mono text-[10px]">E2E encrypted</span>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {tab === "chats" && <ChatsPage />}
          {tab === "contacts" && <ContactsPage />}
          {tab === "settings" && <SettingsPage />}
          {tab === "profile" && <ProfilePage />}
        </div>
      </main>
    </div>
  );
}