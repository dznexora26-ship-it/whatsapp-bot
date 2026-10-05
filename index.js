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
      const text = message.text.body.trim().toLowerCase();

      let replyText = "";

      if (text.includes("سعر") || text.includes("اسعار") || text.includes("بكم") || text.includes("تكلفة")) {
        replyText = `مرحباً بك! 👋\nإليك باقات وأسعار الاشتراكات المتوفرة:\n\n` +
                    `🔹 باقة شهرية: 1500 دج\n` +
                    `🔹 باقة 3 أشهر: 4000 دج\n` +
                    `🔹 باقة سنوية: 12000 دج\n\n` +
                    `لطلب الاشتراك أو الاستفسار عن باقة مخصصة، يمكنك الرد باسم الباقة مباشرة.`;
      } else if (text.includes("مدة") || text.includes("اشتراك") || text.includes("عرض")) {
        replyText = `أهلاً بك! 🌟\nنوفر اشتراكات بالمدد التالية:\n- شهر واحد\n- 3 أشهر\n- 6 أشهر\n- سنة كاملة\n\nهل تود معرفة أسعار باقة محددة؟`;
      } else {
        replyText = `مرحباً بك! 👋\nكيف يمكنني مساعدتك اليوم؟\nيمكنك كتابة *الأسعار* أو *الاشتراكات* لمعرفة كافة التفاصيل فوراً.`;
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
