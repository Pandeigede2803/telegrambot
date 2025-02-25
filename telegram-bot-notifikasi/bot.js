require('dotenv').config();
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const moment = require('moment-timezone');
const Reminder = require('./models/Reminder');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_NAME = process.env.BOT_NAME || "Telegram Bot";

const MONGO_URI = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;

// Koneksi ke MongoDB
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("✅ Terhubung ke MongoDB Atlas"))
  .catch(err => console.error("❌ Gagal koneksi MongoDB:", err));

// Inisialisasi bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// === Perintah /remindme untuk Menyimpan Pengingat dengan Waktu dan Repeat ===
bot.onText(/\/remindme (.+) (\d{2}:\d{2})(?: (1h|2h|3h))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const reminderText = match[1];
    const inputTime = match[2]; // Waktu dalam format HH:MM
    const repeatInterval = match[3] || null; // Repeat bisa `1h`, `2h`, atau `3h`

    // Pastikan waktu input dalam zona WITA (GMT+8)
    const timeInWITA = moment.tz(inputTime, "HH:mm", "Asia/Makassar").format("HH:mm");

    await Reminder.create({ chatId, text: reminderText, time: timeInWITA, repeat: repeatInterval });

    let repeatMessage = repeatInterval ? ` (Berulang setiap ${repeatInterval})` : "";
    bot.sendMessage(chatId, `✅ Pengingat tersimpan: "${reminderText}" pada ${timeInWITA} WITA${repeatMessage}.`);
});

// === Perintah /list untuk Melihat Semua Pengingat ===
bot.onText(/\/list/, async (msg) => {
    const chatId = msg.chat.id;
    const reminders = await Reminder.find({ chatId });

    if (reminders.length === 0) {
        bot.sendMessage(chatId, "📌 Tidak ada pengingat yang tersimpan.");
        return;
    }

    let message = "📋 *Daftar Pengingat:*\n";
    reminders.forEach((reminder, index) => {
        let repeatInfo = reminder.repeat ? ` 🔄 (Setiap ${reminder.repeat})` : "";
        message += `${index + 1}. ${reminder.text} - ⏰ ${reminder.time}${repeatInfo}\n`;
    });

    bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
});

// === Perintah /help untuk Menampilkan semua perintah ===
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpMessage = `
📌 Perintah yang tersedia:

/remindme <pesan> <waktu> [repeat] - Menyimpan pengingat dengan waktu (opsional: \`1h\`, \`2h\`, \`3h\` untuk repeat)
/list - Melihat semua pengingat
/done <nomor> - Menghapus pengingat yang selesai
/help - Menampilkan bantuan
    `;

    bot.sendMessage(chatId, helpMessage);
});

// === Perintah /done <nomor> untuk Menghapus Pengingat ===
bot.onText(/\/done (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const index = parseInt(match[1]) - 1;
    const reminders = await Reminder.find({ chatId });

    if (isNaN(index) || index < 0 || index >= reminders.length) {
        bot.sendMessage(chatId, "⚠️ Nomor pengingat tidak valid.");
        return;
    }

    const removed = reminders[index];

    await Reminder.deleteOne({ _id: removed._id });

    bot.sendMessage(chatId, `✅ Pengingat selesai: "${removed.text}" pada ${removed.time}`);
});

cron.schedule('* * * * *', async () => {
    const now = moment().tz("Asia/Makassar").format("HH:mm");
    console.log(`🔄 Menjalankan cron job pada ${now}`);

    const reminders = await Reminder.find({ time: now });

    if (reminders.length === 0) {
        console.log("✅ Tidak ada pengingat saat ini.");
        return;
    }

    for (let reminder of reminders) {
        bot.sendMessage(reminder.chatId, `⏰ Pengingat: ${reminder.text}`);

        if (reminder.repeat) {
            let newTime = moment.tz(reminder.time, "HH:mm", "Asia/Makassar");

            if (reminder.repeat === "1h") {
                newTime.add(1, "hour");
            } else if (reminder.repeat === "2h") {
                newTime.add(2, "hours");
            } else if (reminder.repeat === "3h") {
                newTime.add(3, "hours");
            }

            let newFormattedTime = newTime.format("HH:mm");

            await Reminder.updateOne({ _id: reminder._id }, { $set: { time: newFormattedTime } });

            console.log(`🔄 Pengingat "${reminder.text}" diperbarui ke ${newFormattedTime}`);
        } else {
            await Reminder.deleteOne({ _id: reminder._id });
            console.log(`✅ Pengingat "${reminder.text}" dihapus.`);
        }
    }
}, {
    timezone: "Asia/Makassar"
});


console.log(`🤖 ${BOT_NAME} sedang berjalan...`);
