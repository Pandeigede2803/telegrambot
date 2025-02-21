require('dotenv').config();
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const moment = require('moment-timezone');
const Reminder = require('./models/Reminder');
require('dotenv').config();


// Load konfigurasi dari .env
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_NAME = process.env.BOT_NAME || "Telegram Bot";
const REMINDER_MESSAGE = process.env.REMINDER_MESSAGE || "📢 Jangan lupa cek tugasmu hari ini! 🚀";



// Membuat URI koneksi MongoDB dari `.env`
const MONGO_URI = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;

// Koneksi ke MongoDB
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("✅ Terhubung ke MongoDB Atlas"))
  .catch(err => console.error("❌ Gagal koneksi MongoDB:", err));


// Inisialisasi bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// === Perintah /remindme untuk Menyimpan Pengingat dengan Waktu ===
bot.onText(/\/remindme (.+) (\d{2}:\d{2})/, async (msg, match) => {
    const chatId = msg.chat.id;
    const reminderText = match[1];
    const reminderTime = match[2];

    // Konversi waktu ke WITA
    const timeInWITA = moment(reminderTime, "HH:mm").tz("Asia/Makassar").format("HH:mm");

    await Reminder.create({ chatId, text: reminderText, time: timeInWITA });

    bot.sendMessage(chatId, `✅ Pengingat tersimpan: "${reminderText}" pada ${timeInWITA} WITA.`);
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
        message += `${index + 1}. ${reminder.text} - ⏰ ${reminder.time}\n`;
    });

    bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
});

// === Perintah /help untuk Menampilkan semua perintah ===
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpMessage = `
📌 Perintah yang tersedia:

/remindme <pesan> <waktu> - Menyimpan pengingat dengan waktu
/list - Melihat semua pengingat
/done <nomor> - Menghapus pengingat yang selesai
/help - Menampilkan bantuan
    `;

    bot.sendMessage(chatId, helpMessage);
});

// === Perintah /done <nomor> untuk Menghapus Pengingat yang Selesai ===
bot.onText(/\/done (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const index = parseInt(match[1]) - 1;
    const reminders = await Reminder.find({ chatId });

    if (isNaN(index) || index < 0 || index >= reminders.length) {
        bot.sendMessage(chatId, "⚠️ Nomor pengingat tidak valid.");
        return;
    }

    const removed = reminders[index];

    // Hapus dari database
    await Reminder.deleteOne({ _id: removed._id });

    bot.sendMessage(chatId, `✅ Pengingat selesai: "${removed.text}" pada ${removed.time}`);
});

// === Cron Job untuk Mengirim Pengingat Secara Otomatis ===
cron.schedule('* * * * *', async () => {
    const now = moment().tz("Asia/Jakarta").format("HH:mm");

    const reminders = await Reminder.find({ time: now });

    reminders.forEach(async (reminder) => {
        bot.sendMessage(reminder.chatId, `⏰ Pengingat: ${reminder.text}`);

        // Hapus pengingat setelah dikirim
        await Reminder.deleteOne({ _id: reminder._id });
    });
}, {
    timezone: "Asia/Makassar"
});

// Notifikasi bahwa bot sedang berjalan
console.log(`🤖 ${BOT_NAME} sedang berjalan...`);
