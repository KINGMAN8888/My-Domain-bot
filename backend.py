"""
DomainRadar AI — Unified Backend v2.0
==========================================
يضم هذا الملف ثلاث خدمات في واحدة:
  1. محرك البحث والتحليل (Worker) — يعمل بشكل دوري لاصطياد الدومينات.
  2. واجهة برمجة التطبيقات (FastAPI) — يوفر البيانات للوحة التحكم React.
  3. بوت تيليجرام التفاعلي — يستقبل الأوامر ويرسل التنبيهات.

طريقة التشغيل:
  - لتشغيل الكل معاً:   python backend.py both
  - لتشغيل الـ API فقط: python backend.py api
  - لتشغيل الـ Worker:  python backend.py worker
"""

import sqlite3
import socket
import time
import os
import sys
import threading
import json
import datetime
from typing import Any
import requests as http_requests  # type: ignore[import-untyped]

# تحميل ملف .env تلقائياً
try:
    from dotenv import load_dotenv  # type: ignore[import-untyped]
    load_dotenv()
except ImportError:
    pass

_start_time = time.time()

# =============================================================================
# ⚙️ CONFIGURATION
# =============================================================================
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID   = os.environ.get("TELEGRAM_CHAT_ID",   "")
DB_NAME            = os.environ.get("DB_NAME", "domains.db")
API_HOST           = "0.0.0.0"
API_PORT           = int(os.environ.get("PORT", 8000))
WORKER_INTERVAL    = int(os.environ.get("WORKER_INTERVAL", 3600))
MIN_SCORE_ALERT    = int(os.environ.get("MIN_SCORE_ALERT", 80))
DASHBOARD_URL      = os.environ.get("DASHBOARD_URL", "http://localhost:3000")
CORS_ORIGINS       = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",")]

GOLDEN_KEYWORDS: list[str] = ["ai", "tech", "crypto", "pay", "app", "hub", "web", "data", "cloud", "nexus"]
TLD_SCORES: dict[str, int] = {".com": 25, ".ai": 20, ".io": 15, ".net": 10}

# =============================================================================
# 🗄️ DATABASE
# =============================================================================

def init_db():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS notified_domains (
            domain     TEXT PRIMARY KEY,
            score      INTEGER,
            tld        TEXT,
            name_len   INTEGER,
            keywords   TEXT,
            date_added TEXT
        )
    """)
    conn.commit()
    conn.close()
    print(f"[DB] ✅ Database ready: {DB_NAME}")


def save_domain(domain: str, score: int, tld: str, name_len: int, keywords: list):
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    try:
        c.execute(
            "INSERT INTO notified_domains (domain, score, tld, name_len, keywords, date_added) VALUES (?, ?, ?, ?, ?, ?)",
            (domain, score, tld, name_len, json.dumps(keywords),
             datetime.datetime.now(datetime.timezone.utc).isoformat())
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()


def get_all_domains(limit: int = 100, search: str = "") -> list[dict[str, Any]]:
    if not os.path.exists(DB_NAME):
        return []
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    if search:
        c.execute(
            "SELECT * FROM notified_domains WHERE domain LIKE ? ORDER BY date_added DESC, score DESC LIMIT ?",
            (f"%{search}%", limit)
        )
    else:
        c.execute("SELECT * FROM notified_domains ORDER BY date_added DESC, score DESC LIMIT ?", (limit,))
    rows = c.fetchall()
    conn.close()
    result: list[dict[str, Any]] = []
    for row in rows:
        d: dict[str, Any] = dict(row)
        try:
            d["keywords"] = json.loads(d.get("keywords") or "[]")
        except Exception:
            d["keywords"] = []
        result.append(d)
    return result


def get_stats() -> dict[str, int]:
    if not os.path.exists(DB_NAME):
        return {"total": 0, "golden": 0, "today": 0}
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM notified_domains")
    total = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM notified_domains WHERE score >= 80")
    golden = c.fetchone()[0]
    today_str = datetime.date.today().isoformat()
    c.execute("SELECT COUNT(*) FROM notified_domains WHERE date_added LIKE ?", (f"{today_str}%",))
    today = c.fetchone()[0]
    conn.close()
    return {"total": total, "golden": golden, "today": today}


# =============================================================================
# 🧠 SCORING ALGORITHM
# =============================================================================

def calculate_score(domain: str) -> tuple[int, list[str]]:
    score: int = 50
    found_keywords: list[str] = []
    parts: list[str] = domain.lower().split(".")
    if len(parts) < 2:
        return 0, []
    name: str = parts[0]
    tld: str  = "." + ".".join(parts[1:])  # type: ignore[misc]
    score = score + int(TLD_SCORES.get(tld, 0))
    if len(name) <= 4:
        score = score + 25
    elif len(name) <= 7:
        score = score + 15
    for kw in GOLDEN_KEYWORDS:
        if kw in name:
            score = score + 10  # type: ignore[operator]
            found_keywords.append(kw)
    if "-" in name:
        score = score - 30  # type: ignore[operator]
    if any(ch.isdigit() for ch in name):
        score = score - 20  # type: ignore[operator]
    return max(0, min(score, 100)), found_keywords


# =============================================================================
# 🔍 DNS VALIDATION
# =============================================================================

def is_domain_available(domain: str) -> bool:
    try:
        socket.setdefaulttimeout(3)
        socket.gethostbyname(domain)
        return False
    except socket.gaierror:
        return True
    except Exception:
        return False


# =============================================================================
# 📡 TELEGRAM MESSAGING — helper functions
# =============================================================================

def _tg_post(method: str, payload: dict) -> dict | None:
    """إرسال أي طلب POST لـ Telegram API."""
    if not TELEGRAM_BOT_TOKEN:
        return None
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/{method}"
    try:
        r = http_requests.post(url, json=payload, timeout=10)
        return r.json() if r.ok else None
    except Exception as e:
        print(f"  [TG] ❌ {method} failed: {e}")
        return None


def send_message(chat_id, text: str, reply_markup=None, parse_mode="HTML") -> dict | None:
    payload = {"chat_id": chat_id, "text": text, "parse_mode": parse_mode}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    return _tg_post("sendMessage", payload)


def send_telegram_alert(domain: str, score: int, keywords: list) -> bool:
    """إرسال تنبيه دومين ذهبي."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print(f"  [TG Mock] 🚨 {domain} | Score: {score}")
        return True

    kw_text = " • ".join([f"#{k}" for k in keywords]) if keywords else "—"
    score_bar = _score_bar(score)
    tld = "." + domain.split(".", 1)[-1]
    buy_url = f"https://www.namecheap.com/domains/registration/results/?domain={domain}"

    msg = (
        f"🚨 <b>Golden Domain Found!</b>\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"🌐 <code>{domain}</code>\n"
        f"⭐ Score: <b>{score}/100</b>\n"
        f"📊 {score_bar}\n"
        f"🏷️ Extension: <b>{tld}</b>\n"
        f"🔑 Keywords: {kw_text}\n"
        f"✅ Status: <b>Available</b> (DNS verified)\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"🛒 <a href=\"{buy_url}\">Register on Namecheap</a>"
    )

    inline_kb = {
        "inline_keyboard": [[
            {"text": "🛒 Buy Now", "url": buy_url},
            {"text": "📊 Dashboard", "url": DASHBOARD_URL}
        ]]
    }

    result = _tg_post("sendMessage", {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": msg,
        "parse_mode": "HTML",
        "reply_markup": inline_kb
    })
    return result is not None


def _score_bar(score: int) -> str:
    """شريط تقييم مرئي من 10 مربعات."""
    filled = round(score / 10)
    return "🟩" * filled + "⬜" * (10 - filled)


def _score_emoji(score: int) -> str:
    if score >= 90: return "🏆"
    if score >= 80: return "🥇"
    if score >= 60: return "🥈"
    return "🥉"


# =============================================================================
# 🤖 TELEGRAM BOT — Command Handlers
# =============================================================================

_bot_offset: int = 0
_last_scan_result = {}  # نتيجة آخر فحص


def handle_start(chat_id, username="there"):
    """رسالة الترحيب الاحترافية."""
    msg = (
        f"👋 <b>Welcome to DomainRadar AI!</b> @{username}\n\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"🤖 I scan expiring domains & find golden opportunities worth registering.\n\n"
        f"<b>📋 Available Commands:</b>\n"
        f"  🔍 /scan — Run a scan cycle now\n"
        f"  📋 /list — Last 10 discovered domains\n"
        f"  🏆 /top — Top 5 highest-scored domains\n"
        f"  📊 /stats — Quick statistics\n"
        f"  ⚙️ /settings — Current configuration\n"
        f"  🆘 /help — Show this menu\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"🟢 Bot is <b>online</b> and monitoring 24/7!"
    )
    kb = {
        "keyboard": [
            [{"text": "🔍 Scan Now"}, {"text": "📋 List Domains"}],
            [{"text": "📊 Stats"},    {"text": "🏆 Top 5"}],
            [{"text": "⚙️ Settings"}, {"text": "🆘 Help"}]
        ],
        "resize_keyboard": True,
        "persistent": True
    }
    send_message(chat_id, msg, reply_markup=kb)


def handle_scan(chat_id):
    """تشغيل دورة فحص كاملة يدوياً."""
    global _last_scan_result
    send_message(chat_id, "🔍 <b>Scanning in progress…</b>\nThis may take a few seconds ⏳")

    domains_list = fetch_expiring_domains(demo=True)
    saved_count = 0
    results_text = []

    for domain in domains_list:
        score, keywords = calculate_score(domain)
        if score >= MIN_SCORE_ALERT:
            available = is_domain_available(domain)
            if available:
                tld  = "." + domain.split(".", 1)[-1]
                name = domain.split(".")[0]
                saved = save_domain(domain, score, tld, len(name), keywords)
                if saved:
                    send_telegram_alert(domain, score, keywords)
                    saved_count += 1
                status = "✅ Saved" if saved else "♻️ Already known"
            else:
                status = "⛔ Registered"
            results_text.append(  # type: ignore[arg-type]
                f"  {_score_emoji(score)} <code>{domain}</code> — {score}/100 {status}"
            )

    _last_scan_result = {"scanned": len(domains_list), "saved": saved_count}

    summary = (
        f"✅ <b>Scan Complete!</b>\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"🔎 Domains scanned: <b>{len(domains_list)}</b>\n"
        f"🌟 New golden domains: <b>{saved_count}</b>\n"
        f"━━━━━━━━━━━━━━━━━━\n"
    )
    if results_text:
        summary += "<b>High-Score Results:</b>\n" + "\n".join(results_text)
    else:
        summary += "📭 No golden domains found this cycle."

    send_message(chat_id, summary)


def handle_list(chat_id):
    """عرض آخر 10 دومينات."""
    domains = get_all_domains(limit=10)
    if not domains:
        send_message(chat_id, "📭 <b>No domains in database yet.</b>\nRun /scan to start!")
        return

    lines = []
    for d in domains:
        score = d["score"]
        kws   = ", ".join(d.get("keywords") or []) or "—"
        dt    = d.get("date_added", "")[:10]
        buy   = f"https://www.namecheap.com/domains/registration/results/?domain={d['domain']}"
        lines.append(  # type: ignore[arg-type]
            f"{_score_emoji(score)} <code>{d['domain']}</code>\n"
            f"   ⭐ {score}/100  {_score_bar(score)}\n"
            f"   🔑 {kws}  📅 {dt}\n"
            f"   🛒 <a href=\"{buy}\">Register</a>"
        )

    msg = "📋 <b>Latest Discovered Domains</b>\n━━━━━━━━━━━━━━━━━━\n\n" + "\n\n".join(lines)
    send_message(chat_id, msg)


def handle_top(chat_id):
    """أفضل 5 دومينات بأعلى تقييم."""
    all_d = get_all_domains(limit=200)
    if not all_d:
        send_message(chat_id, "📭 No domains yet. Run /scan first!")
        return

    top5: list[dict[str, Any]] = list(sorted(all_d, key=lambda x: int(x["score"]), reverse=True))[:5]  # type: ignore[misc]
    lines = []
    medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"]
    for i, d in enumerate(top5):
        kws = ", ".join(d.get("keywords") or []) or "—"
        buy = f"https://www.namecheap.com/domains/registration/results/?domain={d['domain']}"
        lines.append(  # type: ignore[arg-type]
            f"{medals[i]} <code>{d['domain']}</code>\n"
            f"   ⭐ <b>{d['score']}/100</b>  {_score_bar(d['score'])}\n"
            f"   🔑 {kws}\n"
            f"   🛒 <a href=\"{buy}\">Register</a>"
        )

    msg = "🏆 <b>Top 5 Golden Domains</b>\n━━━━━━━━━━━━━━━━━━\n\n" + "\n\n".join(lines)
    send_message(chat_id, msg)


def handle_stats(chat_id):
    """إحصائيات سريعة."""
    s = get_stats()
    golden_pct = round(s["golden"] / s["total"] * 100) if s["total"] > 0 else 0
    msg = (
        f"📊 <b>DomainRadar AI — Statistics</b>\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"🔍 Total Scanned:  <b>{s['total']:,}</b>\n"
        f"🌟 Golden (≥80):   <b>{s['golden']:,}</b> ({golden_pct}%)\n"
        f"📅 Found Today:    <b>{s['today']:,}</b>\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"📈 Golden Rate: {_score_bar(golden_pct)}"
    )
    send_message(chat_id, msg)


def handle_settings(chat_id):
    """عرض الإعدادات الحالية."""
    tlds  = ", ".join(TLD_SCORES.keys())
    kws   = ", ".join(GOLDEN_KEYWORDS)
    uptime = int(time.time() - _start_time)
    h, m = divmod(uptime // 60, 60)
    msg = (
        f"⚙️ <b>Current Configuration</b>\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"🏷️ Target TLDs:  <code>{tlds}</code>\n"
        f"⭐ Min Alert Score: <b>{MIN_SCORE_ALERT}/100</b>\n"
        f"🔑 Keywords: <code>{kws}</code>\n"
        f"⏱️ Scan Interval: <b>{WORKER_INTERVAL // 60} min</b>\n"
        f"🌐 API: <b>http://localhost:{API_PORT}</b>\n"
        f"💻 Dashboard: <b>{DASHBOARD_URL}</b>\n"
        f"⏲️ Uptime: <b>{h}h {m}m</b>\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"📡 Telegram Chat ID: <code>{TELEGRAM_CHAT_ID}</code>"
    )
    send_message(chat_id, msg)


def handle_help(chat_id):
    """قائمة المساعدة."""
    msg = (
        f"🆘 <b>DomainRadar AI — Help</b>\n"
        f"━━━━━━━━━━━━━━━━━━\n\n"
        f"<b>Commands:</b>\n"
        f"🔍 /scan — Scan for golden domains now\n"
        f"📋 /list — Show last 10 discovered domains\n"
        f"🏆 /top — Top 5 highest-scored domains\n"
        f"📊 /stats — Database statistics\n"
        f"⚙️ /settings — Show bot configuration\n"
        f"🔎 /check domain.com — Check a specific domain\n"
        f"🗑️ /delete domain.com — Remove domain from DB\n"
        f"🆘 /help — Show this message\n\n"
        f"<b>Score Guide:</b>\n"
        f"🏆 90-100: Perfect golden domain\n"
        f"🥇 80-89:  Excellent opportunity\n"
        f"🥈 60-79:  Good domain\n"
        f"🥉 0-59:   Low priority\n\n"
        f"<b>Score Factors:</b>\n"
        f"• TLD (.com +25, .ai +20, .io +15)\n"
        f"• Length (≤4 chars: +25, ≤7: +15)\n"
        f"• Keywords: +10 each\n"
        f"• Dash penalty: -30  |  Digits: -20"
    )
    send_message(chat_id, msg)


def handle_check(chat_id, domain: str):
    """فحص دومين محدد."""
    domain = domain.strip().lower().lstrip('.')
    if not domain or '.' not in domain:
        send_message(chat_id, "❌ Please provide a valid domain.\nExample: <code>/check payai.com</code>")
        return
    send_message(chat_id, f"🔎 Checking <code>{domain}</code>…")
    score, keywords = calculate_score(domain)
    available = is_domain_available(domain)
    kw_text = " • ".join([f"#{k}" for k in keywords]) if keywords else "—"
    tld = "." + domain.split(".", 1)[-1]
    buy_url = f"https://www.namecheap.com/domains/registration/results/?domain={domain}"
    status_emoji = "✅" if available else "⛔"
    status_text  = "Available" if available else "Registered / Taken"
    msg = (
        f"🔎 <b>Domain Check Result</b>\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"🌐 <code>{domain}</code>\n"
        f"⭐ Score: <b>{score}/100</b>\n"
        f"📊 {_score_bar(score)}\n"
        f"🏷️ Extension: <b>{tld}</b>\n"
        f"🔑 Keywords: {kw_text}\n"
        f"{status_emoji} Status: <b>{status_text}</b>\n"
        f"━━━━━━━━━━━━━━━━━━"
    )
    kb = None
    if available:
        kb = {"inline_keyboard": [[{"text": "🛒 Register on Namecheap", "url": buy_url}]]}
    send_message(chat_id, msg, reply_markup=kb)


def handle_delete(chat_id, domain: str):
    """حذف دومين من قاعدة البيانات."""
    domain = domain.strip().lower()
    if not domain or '.' not in domain:
        send_message(chat_id, "❌ Please provide a valid domain.\nExample: <code>/delete payai.com</code>")
        return
    if not os.path.exists(DB_NAME):
        send_message(chat_id, "📭 Database is empty.")
        return
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute("DELETE FROM notified_domains WHERE domain = ?", (domain,))
    deleted = c.rowcount
    conn.commit()
    conn.close()
    if deleted:
        send_message(chat_id, f"🗑️ <code>{domain}</code> has been removed from the database.")
    else:
        send_message(chat_id, f"❓ <code>{domain}</code> was not found in the database.")


def dispatch_command(chat_id: int, text: str, username: str):
    """توجيه الأمر للـ handler المناسب."""
    parts = text.strip().split()
    if not parts:
        return
    raw_cmd = parts[0].lower().split("@")[0]
    args: list[str] = parts[1:]  # type: ignore[misc]

    if raw_cmd in ("/start", "start"):
        handle_start(chat_id, username)
    elif raw_cmd in ("/scan", "🔍 scan now") or "scan now" in text.lower():
        handle_scan(chat_id)
    elif raw_cmd in ("/list", "📋 list domains") or "list domains" in text.lower():
        handle_list(chat_id)
    elif raw_cmd in ("/top", "🏆 top 5") or "top 5" in text.lower():
        handle_top(chat_id)
    elif raw_cmd in ("/stats", "📊 stats") or text.lower().strip() == "📊 stats":
        handle_stats(chat_id)
    elif raw_cmd in ("/settings", "⚙️ settings") or "settings" in text.lower():
        handle_settings(chat_id)
    elif raw_cmd in ("/help", "🆘 help") or text.lower().strip() == "🆘 help":
        handle_help(chat_id)
    elif raw_cmd == "/check":
        handle_check(chat_id, " ".join(args))
    elif raw_cmd == "/delete":
        handle_delete(chat_id, " ".join(args))
    else:
        send_message(
            chat_id,
            f"❓ Unknown command: <code>{text[:50]}</code>\n\nType /help to see all available commands.",  # type: ignore[index]
        )


# =============================================================================
# 🤖 TELEGRAM BOT — Polling Loop
# =============================================================================

def run_bot():
    """Polling loop للبوت — يعمل في thread منفصل."""
    global _bot_offset

    if not TELEGRAM_BOT_TOKEN:
        print("[Bot] ⚠️  No TELEGRAM_BOT_TOKEN — bot disabled.")
        return

    print("[Bot] 🤖 Telegram Bot started (polling)…")

    # اختبار أولي
    me = _tg_post("getMe", {})
    if me and me.get("ok"):
        name = me["result"].get("first_name", "Bot")
        uname = me["result"].get("username", "")
        print(f"[Bot] ✅ Connected as: {name} (@{uname})")
        # إرسال رسالة بدء تشغيل للمالك
        _tg_post("sendMessage", {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": (
                "🟢 <b>DomainRadar AI — Bot Online!</b>\n"
                "━━━━━━━━━━━━━━━━━━\n"
                "✅ Backend started successfully\n"
                "🔍 Worker is running every hour\n"
                "📊 Dashboard: http://localhost:3000\n"
                "🌐 API: http://localhost:8000\n\n"
                "Type /help to see all commands."
            ),
            "parse_mode": "HTML"
        })
    else:
        print("[Bot] ❌ Failed to connect to Telegram API. Check BOT_TOKEN.")
        return

    while True:
        try:
            resp = http_requests.get(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getUpdates",
                params={"offset": _bot_offset, "timeout": 30, "allowed_updates": ["message"]},
                timeout=35
            )
            if not resp.ok:
                time.sleep(5)
                continue

            data = resp.json()
            if not data.get("ok"):
                time.sleep(5)
                continue

            for update in data.get("result", []):
                _bot_offset = update["update_id"] + 1
                msg = update.get("message", {})
                if not msg:
                    continue
                chat_id  = msg["chat"]["id"]
                text     = msg.get("text", "")
                username = msg.get("from", {}).get("username") or msg.get("from", {}).get("first_name", "User")
                if text:
                    print(f"[Bot] 📨 From @{username}: {text[:80]}")
                    dispatch_command(chat_id, text, username)

        except http_requests.exceptions.ReadTimeout:
            continue
        except Exception as e:
            print(f"[Bot] ⚠️  Polling error: {e}")
            time.sleep(10)


# =============================================================================
# ⚙️ WORKER
# =============================================================================

def fetch_expiring_domains(demo: bool = False) -> list[str]:
    print("  [Worker] 📡 Fetching domains list…")
    if demo:
        import random, string
        suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=5))
        return [
            f"payai{suffix}.com",
            f"cryptohub{suffix}.io",
            f"nexuscloud{suffix}.com",
            f"xpay{suffix}.ai",
            f"buildfast{suffix}.ai",
            f"techflow{suffix}.com",
            f"smartdata{suffix}.net",
            f"aipay{suffix}.io",
        ]
    return [
        "payai.com", "cryptohub.io", "tech-flow.com", "ai-vision.ai",
        "xpay.ai", "buildfast.ai", "0x-trade.io", "smartdata.net",
        "nexuscloud.com", "ai-pay123.com",
    ]


def run_worker():
    init_db()
    print("\n🚀 DomainRadar AI Worker Started!")
    print(f"   Scan interval: {WORKER_INTERVAL // 60} minutes.\n")

    while True:
        now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        print(f"\n[Worker] 🔍 Scan cycle started at {now}…")
        domains = fetch_expiring_domains(demo=False)
        found_count = 0

        for domain in domains:
            score, keywords = calculate_score(domain)
            if score >= MIN_SCORE_ALERT:
                available = is_domain_available(domain)
                if available:
                    tld  = "." + domain.split(".", 1)[-1]
                    name = domain.split(".")[0]
                    saved = save_domain(domain, score, tld, len(name), keywords)
                    if saved:
                        send_telegram_alert(domain, score, keywords)
                        found_count = found_count + 1  # type: ignore[operator]
                        print(f"  [Worker] 🎯 Saved: {domain} | Score: {score}")
                    else:
                        print(f"  [Worker] ♻️  Already known: {domain}")
                else:
                    print(f"  [Worker] ⛔ Registered: {domain}")
            else:
                print(f"  [Worker] 📉 Low score: {domain} ({score})")

        print(f"[Worker] ✅ Done. Found {found_count} new golden domains. Sleeping {WORKER_INTERVAL}s…\n")
        time.sleep(WORKER_INTERVAL)


# =============================================================================
# 🌐 FASTAPI
# =============================================================================
try:
    from fastapi import FastAPI  # type: ignore[import-untyped]
    from fastapi.middleware.cors import CORSMiddleware  # type: ignore[import-untyped]
    import uvicorn  # type: ignore[import-untyped]
    _FASTAPI_AVAILABLE = True
except ImportError:
    _FASTAPI_AVAILABLE = False

if _FASTAPI_AVAILABLE:
    app = FastAPI(
        title="DomainRadar AI",
        version="2.0.0",
        description="Domain discovery & scoring API with Telegram bot integration.",
        docs_url="/docs",
        redoc_url="/redoc",
    )
    _cors_origins = CORS_ORIGINS if CORS_ORIGINS != ["*"] else ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins, allow_credentials=True,
        allow_methods=["*"], allow_headers=["*"],
    )

    @app.get("/")
    def root():
        return {"status": "ok", "version": "2.0.0", "message": "DomainRadar AI API 🚀"}

    @app.get("/api/domains")
    def api_domains(limit: int = 100, search: str = ""):
        return get_all_domains(limit=limit, search=search)

    @app.get("/api/stats")
    def api_stats():
        return get_stats()

    @app.post("/api/scan")
    def api_trigger_scan(demo: bool = True):
        domains_list = fetch_expiring_domains(demo=demo)
        results = []
        for domain in domains_list:
            score, keywords = calculate_score(domain)
            available = True if demo else (is_domain_available(domain) if score >= MIN_SCORE_ALERT else False)
            saved = False
            if score >= MIN_SCORE_ALERT and available:
                tld  = "." + domain.split(".", 1)[-1]
                name = domain.split(".")[0]
                saved = save_domain(domain, score, tld, len(name), keywords)
                if saved:
                    send_telegram_alert(domain, score, keywords)
            results.append({"domain": domain, "score": score, "keywords": keywords, "available": available, "saved": saved})
        return {"scanned": len(results), "saved": sum(1 for r in results if r["saved"]), "results": results}

    @app.post("/api/telegram/test")
    def api_telegram_test():
        """إرسال رسالة اختبار لتيليجرام."""
        success = _tg_post("sendMessage", {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": "🧪 <b>Test message from DomainRadar AI Dashboard!</b>\n✅ Telegram integration is working.",
            "parse_mode": "HTML"
        })
        return {"success": success is not None}

    @app.get("/api/bot/status")
    def api_bot_status():
        if not TELEGRAM_BOT_TOKEN:
            return {"connected": False, "reason": "No token configured"}
        me = _tg_post("getMe", {})
        if me and me.get("ok"):
            return {"connected": True, "name": me["result"].get("first_name"), "username": me["result"].get("username")}
        return {"connected": False, "reason": "API call failed"}

    @app.get("/api/health")
    def api_health():
        uptime = int(time.time() - _start_time)
        bot_ok = False
        if TELEGRAM_BOT_TOKEN:
            me = _tg_post("getMe", {})
            bot_ok = bool(me and me.get("ok"))
        return {
            "status": "ok",
            "version": "2.0.0",
            "uptime_seconds": uptime,
            "database": DB_NAME,
            "bot_connected": bot_ok,
            "min_score_alert": MIN_SCORE_ALERT,
        }

    @app.get("/api/domains/{domain}")
    def api_domain_detail(domain: str):
        if not os.path.exists(DB_NAME):
            return None
        conn = sqlite3.connect(DB_NAME)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT * FROM notified_domains WHERE domain = ?", (domain,))
        row = c.fetchone()
        conn.close()
        if not row:
            from fastapi import HTTPException  # type: ignore[import-untyped]
            raise HTTPException(status_code=404, detail="Domain not found")
        d2: dict[str, Any] = dict(row)
        try:
            d2["keywords"] = json.loads(d2.get("keywords") or "[]")
        except Exception:
            d2["keywords"] = []
        return d2

    @app.delete("/api/domains/{domain}")
    def api_domain_delete(domain: str):
        if not os.path.exists(DB_NAME):
            return {"deleted": False}
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("DELETE FROM notified_domains WHERE domain = ?", (domain,))
        deleted = c.rowcount > 0
        conn.commit()
        conn.close()
        return {"deleted": deleted, "domain": domain}


def run_api():
    if not _FASTAPI_AVAILABLE:
        print("❌ FastAPI/uvicorn not installed. Run:\n   pip install fastapi uvicorn requests python-dotenv")
        sys.exit(1)
    init_db()
    print(f"\n🌐 DomainRadar AI API → http://localhost:{API_PORT}")
    print(f"📖 API Docs         → http://localhost:{API_PORT}/docs")
    print(f"💻 Dashboard        → {DASHBOARD_URL}\n")
    uvicorn.run(app, host=API_HOST, port=API_PORT, log_level="info")


# =============================================================================
# 🚦 MAIN ENTRY POINT
# =============================================================================
if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "both"

    if mode == "api":
        run_api()

    elif mode == "worker":
        init_db()
        run_worker()

    elif mode == "bot":
        init_db()
        run_bot()

    elif mode == "both":
        init_db()
        # Worker thread
        wt = threading.Thread(target=run_worker, daemon=True)
        wt.start()
        print("⚙️  Worker thread started.")
        # Bot thread
        bt = threading.Thread(target=run_bot, daemon=True)
        bt.start()
        print("🤖 Bot thread started.")
        # API (main thread)
        run_api()

    else:
        print(f"❌ Unknown mode: '{mode}'")
        print("   Usage: python backend.py [api | worker | bot | both]")
        sys.exit(1)
