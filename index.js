const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "my_secret_token_123";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

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

// استقبال الرسائل والرد عليها
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (message && message.type === 'text') {
      const from = message.from;
      const rawText = message.text.body || "";

      // تنظيف النص وتوحيد الحروف وإزالة الحركات والمسافات الزائدة
      const text = rawText
        .trim()
        .toLowerCase()
        .replace(/[إأآا]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/\s+/g, ' ');

      let replyText = "";

      // 1. Netflix
      if (text.includes("netflix") || text.includes("نتفلكس") || text.includes("نتفليكس")) {
        replyText = `🎬 *اشتراكات Netflix الرسمية:*\n\n` +
                    `🔹 *شهر واحد (1 Mois):*\n` +
                    `• بروفايل واحد (1 Profil): 1,000 دج\n` +
                    `• حساب كامل (5 Profils): 4,500 دج\n\n` +
                    `🔹 *3 أشهر (3 Mois):*\n` +
                    `• بروفايل واحد (1 Profil): 3,000 دج\n` +
                    `• حساب كامل (5 Profils): 12,000 دج\n\n` +
                    `💳 للطلب ومعرفة خيارات السداد، أرسل كلمة *دفع*.`;

      // 2. Shahid
      } else if (text.includes("shahid") || text.includes("شاهد")) {
        replyText = `⭐ *اشتراكات Shahid VIP:*\n\n` +
                    `• 3 أشهر: 3,200 دج\n` +
                    `• 12 شهر (سنة كاملة): 8,900 دج\n\n` +
                    `💳 للطلب ومعرفة خيارات السداد، أرسل كلمة *دفع*.`;

      // 3. Prime Video
      } else if (text.includes("prime") || text.includes("برايم") || text.includes("amazon")) {
        replyText = `📦 *اشتراك Amazon Prime Video:*\n\n` +
                    `• حساب كامل (Compte complet) / شهر: 2,800 دج\n\n` +
                    `💳 للطلب ومعرفة خيارات السداد، أرسل كلمة *دفع*.`;

      // 4. Disney+
      } else if (text.includes("disney") || text.includes("ديزني")) {
        replyText = `✨ *اشتراك Disney+:*\n\n` +
                    `• حساب كامل (Compte complet) / شهر: 5,800 دج\n\n` +
                    `💳 للطلب ومعرفة خيارات السداد، أرسل كلمة *دفع*.`;

      // 5. ChatGPT
      } else if (text.includes("chatgpt") || text.includes("gpt") || text.includes("شات")) {
        replyText = `🤖 *اشتراك ChatGPT Plus:*\n\n` +
                    `• مدة شهر واحد (1 Mois): 3,900 دج\n\n` +
                    `💳 للطلب ومعرفة خيارات السداد، أرسل كلمة *دفع*.`;

      // 6. YouTube Premium
      } else if (text.includes("youtube") || text.includes("يوتيوب")) {
        replyText = `▶️ *اشتراك YouTube Premium:*\n\n` +
                    `• مدة شهر واحد (1 Mois): 3,900 دج\n\n` +
                    `💳 للطلب ومعرفة خيارات السداد، أرسل كلمة *دفع*.`;

      // 7. Snapchat Plus
      } else if (text.includes("snap") || text.includes("سناب")) {
        replyText = `👻 *اشتراكات Snapchat Plus:*\n\n` +
                    `• 3 أشهر: 2,000 دج\n` +
                    `• 12 شهر (سنة كاملة): 4,200 دج\n\n` +
                    `💳 للطلب ومعرفة خيارات السداد، أرسل كلمة *دفع*.`;

      // 8. القائمة العامة للأسعار
      } else if (text.includes("سعر") || text.includes("اسعار") || text.includes("اشتراك") || text.includes("prix") || text.includes("tarif") || text.includes("menu")) {
        replyText = `📋 *قائمة الاشتراكات المتوفرة لدينا:*\n\n` +
                    `🎬 *Netflix:* من 1,000 دج\n` +
                    `⭐ *Shahid VIP:* من 3,200 دج\n` +
                    `📦 *Prime Video:* 2,800 دج\n` +
                    `✨ *Disney+:* 5,800 دج\n` +
                    `🤖 *ChatGPT Plus:* 3,900 دج\n` +
                    `▶️ *YouTube Premium:* 3,900 دج\n` +
                    `👻 *Snapchat Plus:* من 2,000 دج\n\n` +
                    `💡 _أرسل اسم الخدمة (مثلاً: *نتفلكس* أو *شاهد*) لعرض تفاصيل الباقات والمدد._\n` +
                    `💳 لمعرفة وسائل التحويل، أرسل *دفع*.`;

      // 9. طرق الدفع والسداد
      } else if (text.includes("دفع") || text.includes("خلص") || text.includes("paiement") || text.includes("baridi") || text.includes("ccp")) {
        replyText = `💳 *طرق الدفع المتوفرة:*\n\n` +
                    `1️⃣ تطبيق بريدي موب (BaridiMob)\n` +
                    `2️⃣ حوالة بريدية عبر الحساب الجاري (CCP)\n\n` +
                    `📌 بعد إتمام عملية التحويل، يرجى إرسال صورة وصل الدفع هنا لتأكيد وتفعيل حسابك فوراً.`;

      // 10. التحدث مع الإدارة أو الدعم
      } else if (text.includes("مسؤول") || text.includes("انسان") || text.includes("مشكل") || text.includes("مساعده")) {
        replyText = `👨‍💼 تم تحويل طلبك لفريق الدعم. سيتواصل معك أحد ممثلينا عبر هذه المحادثة في أقرب وقت.`;

      // 11. الرد الترحيبي الافتراضي
      } else {
        replyText = `مرحباً بك! 👋\nأنا المساعد الآلي لخدمتك. يمكنك الاختيار من الخيارات التالية:\n\n` +
                    `📌 *الأسعار* (لعرض كافة الخدمات والباقات)\n` +
                    `📌 اكتب اسم الخدمة مباشرة: (*Netflix*, *Shahid*, *Snapchat*...)\n` +
                    `📌 *دفع* (لمعرفة طرق الدفع والتحويل)\n` +
                    `📌 *مساعدة* (للتواصل مع الدعم الفني)`;
      }

      try {
        await axios.post(
          `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
          {
            messaging_product: "whatsapp",
            to: from,
            text: { body: replyText }
          },
          {
            headers: {
              Authorization: `Bearer ${WHATSAPP_TOKEN}`,
              "Content-Type": "application/json"
            }
          }
        );
      } catch (error) {
        console.error("Error sending WhatsApp message:", error.response?.data || error.message);
      }
    }
    return res.sendStatus(200);
  }

  res.sendStatus(404);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
