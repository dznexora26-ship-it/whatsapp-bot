const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const express = require('express');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// إبقاء سيرفر Express شغالاً لتفادي توقف الخدمة على الاستضافة
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Nexora WhatsApp Bot is Active! 🚀'));
app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));

// قاعدة بيانات الاشتراكات
const DB_FILE = path.join(__dirname, 'subscriptions.json');

function loadSubscriptions() {
  try {
    if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    return [];
  }
}

function saveSubscriptions(subs) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(subs, null, 2));
  } catch (err) {}
}

const PAYMENT_DETAILS = `💳 *معلومات الدفع عبر بريدي موب (BaridiMob):*\n\n` +
  `🔹 *رقم الحساب (RIP):*\n` +
  `\`00799999002052369468\`\n\n` +
  `_(اضغط مطولاً على الرقم لنسخه مباشرة)_\n\n` +
  `📌 *خطوات التفعيل:*\n` +
  `1. قم بتحويل المبلغ عبر تطبيق بريدي موب.\n` +
  `2. أرسل صورة وصل التحويل هنا في المحادثة مباشرة 📸.\n` +
  `3. سيقوم النظام بتأكيد طلبك وتجهيز الحساب فوراً ⚡.`;

const MAIN_MENU = `📋 *مرحباً بك في متجر Nexora! إليك قائمة الاشتراكات المتوفرة:* 🎬\n\n` +
  `🎬 *Netflix:* من 1,000 دج\n` +
  `⭐ *Shahid VIP:* من 3,200 دج\n` +
  `📦 *Prime Video:* 2,800 دج\n` +
  `✨ *Disney+:* 5,800 دج\n` +
  `🧠 *Gemini Pro:* 5,900 دج (18 شهر)\n` +
  `🤖 *ChatGPT Plus:* 3,900 دج\n` +
  `▶️ *YouTube Premium:* 3,900 دج\n` +
  `👻 *Snapchat Plus:* من 2,000 دج\n\n` +
  `💳 للحصول على معلومات الدفع: اكتب *دفع* أو *بريدي*\n` +
  `💡 لعرض تفاصيل أي خدمة، اكتب اسمها مباشرة (مثال: *نتفلكس*، *جيمني*، *شاهد*...).`;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_session');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    // طباعة كود QR في الـ Logs لمسحه بالهاتف
    if (qr) {
      console.log('SCAN_QR_START');
      qrcode.generate(qr, { small: true });
      console.log('SCAN_QR_END');
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed, reconnecting:', shouldReconnect);
      if (shouldReconnect) {
        startBot();
      }
    } else if (connection === 'open') {
      console.log('✅ تم الاتصال بحساب واتساب بنجاح! البوت جاهز.');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return; // تجاهل الرسائل الصادرة من البوت نفسه

    const from = msg.key.remoteJid;
    // استخراج النص سواء كان رسالة عادية أو تعليق على صورة
    const rawText = msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    msg.message.imageMessage?.caption ||
                    '';

    const isImage = !!msg.message.imageMessage;

    // استلام صورة الوصل
    if (isImage) {
      await sock.sendMessage(from, {
        text: `✅ *تم استلام صورة الوصل بنجاح!*\n\nشكراً لثقتك بنا. يقوم فريق المبيعات حالياً بالتحقق من عملية التحويل وتجهيز بيانات حسابك.\nسيتم إرسال بيانات الاشتراك عبر هذه المحادثة خلال دقائق قليلة ⚡.`
      });
      return;
    }

    const userText = rawText
      .trim()
      .toLowerCase()
      .replace(/[إأآا]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ');

    if (!userText) return;

    // أمر تسجيل اشتراك للمشرف
    if (userText.startsWith('تسجيل')) {
      const parts = userText.split(' ');
      if (parts.length >= 4) {
        const phone = parts[1].replace('+', '').trim() + '@s.whatsapp.net';
        const service = parts[2];
        const days = parseInt(parts[3]) || 30;

        const expiry = new Date();
        expiry.setDate(expiry.getDate() + days);

        const subs = loadSubscriptions();
        subs.push({
          phone,
          service,
          expiryDate: expiry.toISOString(),
          reminderSent: false
        });
        saveSubscriptions(subs);

        await sock.sendMessage(from, {
          text: `✅ تم تسجيل اشتراك ${service} بنجاح!\nتاريخ الانتهاء: ${expiry.toLocaleDateString('ar-EG')}.`
        });
        return;
      }
    }

    // رسالة الختام الجميلة عند الشكر
    if (
      userText.includes('شكرا') ||
      userText.includes('يعطيك الصحه') ||
      userText.includes('صحيت') ||
      userText.includes('عيشك') ||
      userText.includes('بارك الله') ||
      userText.includes('merci') ||
      userText.includes('تم') ||
      userText.includes('خلاص')
    ) {
      await sock.sendMessage(from, {
        text: `تمت خدمتك بنجاح وبكل سرور! 🚀💫\n\nحسابك جاهز ونتمنى لك تجربة استثنائية ✨.\n\n💡 _لأي طلب جديد أو استفسار، يكفي أن ترسل كلمة *مرحبا* في أي وقت لنكون معك فوراً._\n\n*شكراً لتعاملك معنا ونهاركم مبروك!* 🌟`
      });
    } else if (userText.includes('netflix') || userText.includes('نتفلكس') || userText.includes('نتفليكس')) {
      await sock.sendMessage(from, {
        text: `🎬 *اشتراكات Netflix الرسمية:*\n\n🔹 *شهر واحد (1 Mois):*\n• بروفايل واحد: 1,000 دج\n• حساب كامل (5 بروفايلات): 4,500 دج\n\n🔹 *3 أشهر:*\n• بروفايل واحد: 3,000 دج\n• حساب كامل: 12,000 دج\n\nللدفع أرسل كلمة *دفع*.`
      });
    } else if (userText.includes('shahid') || userText.includes('شاهد')) {
      await sock.sendMessage(from, {
        text: `⭐ *اشتراكات Shahid VIP:*\n\n• 3 أشهر: 3,200 دج\n• 12 شهر (سنة كاملة): 8,900 دج\n\nللدفع أرسل كلمة *دفع*.`
      });
    } else if (userText.includes('prime') || userText.includes('برايم') || userText.includes('amazon')) {
      await sock.sendMessage(from, {
        text: `📦 *اشتراك Amazon Prime Video:*\n\n• حساب كامل / شهر: 2,800 دج\n\nللدفع أرسل كلمة *دفع*.`
      });
    } else if (userText.includes('disney') || userText.includes('ديزني')) {
      await sock.sendMessage(from, {
        text: `✨ *اشتراك Disney+:*\n\n• حساب كامل / شهر: 5,800 دج\n\nللدفع أرسل كلمة *دفع*.`
      });
    } else if (userText.includes('gemini') || userText.includes('جيميني') || userText.includes('جيمني')) {
      await sock.sendMessage(from, {
        text: `🧠 *اشتراك Google Gemini Pro الرسمي:*\n\n• مدة 18 شهر (سنة ونصف): 5,900 دج\n✨ وصول كامل لأحدث النماذج مع ضمان كامل المدة.\n\nللدفع أرسل كلمة *دفع*.`
      });
    } else if (userText.includes('chatgpt') || userText.includes('gpt') || userText.includes('شات')) {
      await sock.sendMessage(from, {
        text: `🤖 *اشتراك ChatGPT Plus:*\n\n• مدة شهر واحد: 3,900 دج\n\nللدفع أرسل كلمة *دفع*.`
      });
    } else if (userText.includes('youtube') || userText.includes('يوتيوب')) {
      await sock.sendMessage(from, {
        text: `▶️ *اشتراك YouTube Premium:*\n\n• مدة شهر واحد: 3,900 دج\n\nللدفع أرسل كلمة *دفع*.`
      });
    } else if (userText.includes('snap') || userText.includes('سناب')) {
      await sock.sendMessage(from, {
        text: `👻 *اشتراكات Snapchat Plus:*\n\n• 3 أشهر: 2,000 دج\n• 12 شهر: 4,200 دج\n\nللدفع أرسل كلمة *دفع*.`
      });
    } else if (userText.includes('دفع') || userText.includes('خلص') || userText.includes('baridi') || userText.includes('ccp') || userText.includes('rip')) {
      await sock.sendMessage(from, { text: PAYMENT_DETAILS });
    } else if (userText.includes('مسؤول') || userText.includes('مساعده') || userText.includes('دعم')) {
      await sock.sendMessage(from, {
        text: `👨‍💼 مرحباً بك! تم إشعار المشرف وسيقوم بالرد عليك شخصياً في هذه المحادثة مباشرة.`
      });
    } else {
      await sock.sendMessage(from, { text: MAIN_MENU });
    }
  });

  // تذكير الاشتراكات اليومي
  cron.schedule('0 10 * * *', async () => {
    const subs = loadSubscriptions();
    const now = new Date();
    let modified = false;

    for (let sub of subs) {
      const expiry = new Date(sub.expiryDate);
      const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

      if (diffDays <= 3 && diffDays > 0 && !sub.reminderSent) {
        await sock.sendMessage(sub.phone, {
          text: `مرحباً بك عزيزي المشترك 🌟\n\nنود تذكيرك بأن اشتراكك في خدمة *${sub.service}* سينتهي خلال *${diffDays} أيام*.\nلتجديد اشتراكك دون انقطاع، أرسل كلمة *دفع*.`
        });
        sub.reminderSent = true;
        modified = true;
      }
    }
    if (modified) saveSubscriptions(subs);
  });
}

startBot();
