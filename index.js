const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "my_secret_token_123";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// قاعدة بيانات محلية لتتبع انتهاء الاشتراكات
const DB_FILE = path.join(__dirname, 'subscriptions.json');

function loadSubscriptions() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify([]));
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading database:", err);
    return [];
  }
}

function saveSubscriptions(subs) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(subs, null, 2));
  } catch (err) {
    console.error("Error writing database:", err);
  }
}

// دالة إرسال رسائل نصية عادية
async function sendTextMessage(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: to,
        text: { body: text }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    console.error("Error sending text message:", error.response?.data || error.message);
  }
}

// دالة إرسال أزرار تفاعلية سريعة
async function sendButtonMessage(to, bodyText, buttons) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: bodyText },
          action: {
            buttons: buttons.map((b) => ({
              type: "reply",
              reply: { id: b.id, title: b.title }
            }))
          }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    console.error("Error sending buttons:", error.response?.data || error.message);
  }
}

// دالة إرسال قائمة الخدمات الكاملة (نصية + أزرار متوافقة 100%)
async function sendServiceList(to) {
  const menuText = `📋 *مرحباً بك! إليك قائمة الاشتراكات المتوفرة:* 🎬\n\n` +
                   `🎬 *Netflix:* من 1,000 دج\n` +
                   `⭐ *Shahid VIP:* من 3,200 دج\n` +
                   `📦 *Prime Video:* 2,800 دج\n` +
                   `✨ *Disney+:* 5,800 دج\n` +
                   `🧠 *Gemini Pro:* 5,900 دج (18 شهر)\n` +
                   `🤖 *ChatGPT Plus:* 3,900 دج\n` +
                   `▶️ *YouTube Premium:* 3,900 دج\n` +
                   `👻 *Snapchat Plus:* من 2,000 دج\n\n` +
                   `💡 *لعرض تفاصيل وباقات أي خدمة:* اكتب اسمها مباشرة (مثال: *نتفلكس*، *جيمني*، *شاهد*...).`;

  await sendButtonMessage(to, menuText, [
    { id: "srv_netflix", title: "Netflix 🎬" },
    { id: "srv_gemini", title: "Gemini Pro 🧠" },
    { id: "btn_pay", title: "طرق الدفع 💳" }
  ]);
}

// التحقق من الـ Webhook
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified successfully!');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// معالجة الرسائل الواردة
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (message) {
      const from = message.from;

      // 1. معالجة الصور (وصولات الدفع)
      if (message.type === 'image') {
        const replyText = `✅ *تم استلام صورة الوصل بنجاح!*\n\n` +
                          `شكراً لثقتك بنا. يقوم فريق المبيعات حالياً بالتحقق من عملية التحويل وتجهيز بيانات حسابك.\n` +
                          `سيتم إرسال بيانات الاشتراك عبر هذه المحادثة خلال دقائق قليلة ⚡.`;
        
        await sendButtonMessage(from, replyText, [
          { id: "btn_support", title: "متابعة مع الدعم 👨‍💼" }
        ]);
        return res.sendStatus(200);
      }

      // 2. قراءة الأزرار والنصوص
      let selectedId = "";
      let userText = "";

      if (message.type === 'interactive') {
        if (message.interactive.type === 'button_reply') {
          selectedId = message.interactive.button_reply.id;
        } else if (message.interactive.type === 'list_reply') {
          selectedId = message.interactive.list_reply.id;
        }
      } else if (message.type === 'text') {
        userText = (message.text.body || "")
          .trim()
          .toLowerCase()
          .replace(/[إأآا]/g, 'ا')
          .replace(/ى/g, 'ي')
          .replace(/ة/g, 'ه')
          .replace(/\s+/g, ' ');
      }

      // تسجيل اشتراك جديد لزبون (خاص بالمدير)
      // الصيغة: تسجيل 0550439342 netflix 30
      if (userText.startsWith("تسجيل")) {
        const parts = userText.split(" ");
        if (parts.length >= 4) {
          const clientPhone = parts[1].replace("+", "").trim();
          const serviceName = parts[2];
          const days = parseInt(parts[3]) || 30;

          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + days);

          const subs = loadSubscriptions();
          subs.push({
            phone: clientPhone,
            service: serviceName,
            startDate: new Date().toISOString(),
            expiryDate: expiryDate.toISOString(),
            reminderSent: false
          });
          saveSubscriptions(subs);

          await sendTextMessage(from, `✅ تم تسجيل اشتراك ${serviceName} للرقم ${clientPhone} بنجاح!\nتاريخ الانتهاء: ${expiryDate.toLocaleDateString('ar-EG')}.\nسيصل الزبون تذكير تلقائي قبل انتهائه بـ 3 أيام.`);
          return res.sendStatus(200);
        }
      }

      // ----------------------------------------------------
      // منطق الرد على الخدمات
      // ----------------------------------------------------

      // أ. Netflix
      if (selectedId === "srv_netflix" || userText.includes("netflix") || userText.includes("نتفلكس") || userText.includes("نتفليكس")) {
        const msg = `🎬 *اشتراكات Netflix الرسمية:*\n\n` +
                    `🔹 *شهر واحد (1 Mois):*\n` +
                    `• بروفايل واحد (1 Profil): 1,000 دج\n` +
                    `• حساب كامل (5 Profils): 4,500 دج\n\n` +
                    `🔹 *3 أشهر (3 Mois):*\n` +
                    `• بروفايل واحد (1 Profil): 3,000 دج\n` +
                    `• حساب كامل (5 Profils): 12,000 دج`;
        await sendButtonMessage(from, msg, [
          { id: "btn_pay", title: "طرق الدفع 💳" },
          { id: "btn_menu", title: "باقي الخدمات 📋" }
        ]);

      // ب. Shahid
      } else if (selectedId === "srv_shahid" || userText.includes("shahid") || userText.includes("شاهد")) {
        const msg = `⭐ *اشتراكات Shahid VIP:*\n\n` +
                    `• 3 أشهر: 3,200 دج\n` +
                    `• 12 شهر (سنة كاملة): 8,900 دج`;
        await sendButtonMessage(from, msg, [
          { id: "btn_pay", title: "طرق الدفع 💳" },
          { id: "btn_menu", title: "باقي الخدمات 📋" }
        ]);

      // ج. Prime Video
      } else if (selectedId === "srv_prime" || userText.includes("prime") || userText.includes("برايم") || userText.includes("amazon")) {
        const msg = `📦 *اشتراك Amazon Prime Video:*\n\n` +
                    `• حساب كامل (Compte complet) / شهر: 2,800 دج`;
        await sendButtonMessage(from, msg, [
          { id: "btn_pay", title: "طرق الدفع 💳" },
          { id: "btn_menu", title: "باقي الخدمات 📋" }
        ]);

      // د. Disney+
      } else if (selectedId === "srv_disney" || userText.includes("disney") || userText.includes("ديزني")) {
        const msg = `✨ *اشتراك Disney+:*\n\n` +
                    `• حساب كامل (Compte complet) / شهر: 5,800 دج`;
        await sendButtonMessage(from, msg, [
          { id: "btn_pay", title: "طرق الدفع 💳" },
          { id: "btn_menu", title: "باقي الخدمات 📋" }
        ]);

      // هـ. Gemini Pro (18 شهراً)
      } else if (selectedId === "srv_gemini" || userText.includes("gemini") || userText.includes("جيميني") || userText.includes("جيمني")) {
        const msg = `🧠 *اشتراك Google Gemini Pro الرسمي:*\n\n` +
                    `• مدة 18 شهر (سنة ونصف): 5,900 دج\n\n` +
                    `✨ وصول كامل لأحدث نماذج الذكاء الاصطناعي مع ضمان كامل المدة.`;
        await sendButtonMessage(from, msg, [
          { id: "btn_pay", title: "طرق الدفع 💳" },
          { id: "btn_menu", title: "باقي الخدمات 📋" }
        ]);

      // و. ChatGPT Plus
      } else if (selectedId === "srv_chatgpt" || userText.includes("chatgpt") || userText.includes("gpt") || userText.includes("شات")) {
        const msg = `🤖 *اشتراك ChatGPT Plus:*\n\n` +
                    `• مدة شهر واحد (1 Mois): 3,900 دج`;
        await sendButtonMessage(from, msg, [
          { id: "btn_pay", title: "طرق الدفع 💳" },
          { id: "btn_menu", title: "باقي الخدمات 📋" }
        ]);

      // ز. YouTube Premium
      } else if (selectedId === "srv_youtube" || userText.includes("youtube") || userText.includes("يوتيوب")) {
        const msg = `▶️ *اشتراك YouTube Premium:*\n\n` +
                    `• مدة شهر واحد (1 Mois): 3,900 دج`;
        await sendButtonMessage(from, msg, [
          { id: "btn_pay", title: "طرق الدفع 💳" },
          { id: "btn_menu", title: "باقي الخدمات 📋" }
        ]);

      // ح. Snapchat Plus
      } else if (selectedId === "srv_snap" || userText.includes("snap") || userText.includes("سناب")) {
        const msg = `👻 *اشتراكات Snapchat Plus:*\n\n` +
                    `• مدة 3 أشهر: 2,000 دج\n` +
                    `• مدة 12 شهر (سنة كاملة): 4,200 دج`;
        await sendButtonMessage(from, msg, [
          { id: "btn_pay", title: "طرق الدفع 💳" },
          { id: "btn_menu", title: "باقي الخدمات 📋" }
        ]);

      // ط. طرق الدفع
      } else if (selectedId === "btn_pay" || userText.includes("دفع") || userText.includes("خلص") || userText.includes("baridi") || userText.includes("ccp")) {
        const payMsg = `💳 *طرق الدفع المتاحة:*\n\n` +
                       `1️⃣ تطبيق بريدي موب (BaridiMob)\n` +
                       `2️⃣ حوالة عبر مكاتب البريد (CCP)\n\n` +
                       `📌 بعد إتمام عملية الدفع، قم بإرسال صورة الوصل هنا وسيتولى النظام تأكيد طلبك فوراً 📸.`;
        await sendButtonMessage(from, payMsg, [
          { id: "btn_support", title: "طلب الحسابات 🏦" },
          { id: "btn_menu", title: "قائمة الخدمات 📋" }
        ]);

      // ي. التحدث مع الإدارة أو الدعم
      } else if (selectedId === "btn_support" || userText.includes("مسؤول") || userText.includes("مساعده")) {
        await sendTextMessage(from, `👨‍💼 مرحباً بك! تم إشعار ممثل خدمة العملاء وسيقوم بالرد عليك في هذه المحادثة مباشرة.`);

      // ك. القائمة العامة أو الرد الافتراضي
      } else {
        await sendServiceList(from);
      }
    }
    return res.sendStatus(200);
  }

  res.sendStatus(404);
});

// تذكير يومي بالاشتراكات (10:00 صباحاً)
cron.schedule('0 10 * * *', async () => {
  console.log("Checking expiring subscriptions...");
  const subs = loadSubscriptions();
  const now = new Date();
  let modified = false;

  for (let sub of subs) {
    const expiry = new Date(sub.expiryDate);
    const diffTime = expiry - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 3 && diffDays > 0 && !sub.reminderSent) {
      const reminderMsg = `مرحباً بك عزيزي المشترك 🌟\n\n` +
                          `نود تذكيرك بأن اشتراكك في خدمة *${sub.service}* سينتهي خلال *${diffDays} أيام*.\n` +
                          `لتجديد اشتراكك دون انقطاع، يمكنك الضغط على زر التجديد بالأسفل 👇`;

      await sendButtonMessage(sub.phone, reminderMsg, [
        { id: "btn_pay", title: "تجديد الآن 💳" },
        { id: "btn_support", title: "التحدث مع الدعم 👨‍‍💼" }
      ]);

      sub.reminderSent = true;
      modified = true;
    }
  }

  if (modified) {
    saveSubscriptions(subs);
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
