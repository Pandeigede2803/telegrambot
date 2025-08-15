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
bot.onText(/\/remindme (.+) (\d{2}:\d{2})(?: (1h|2h|3h|4h|5h|6h|7h|8h|9h|10h))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const reminderText = match[1];
    const inputTime = match[2]; // Waktu dalam format HH:MM
    const repeatInterval = match[3] || null; // Repeat bisa `1h` sampai `10h`

    // Pastikan waktu input dalam zona WITA (GMT+8)
    const timeInWITA = moment.tz(inputTime, "HH:mm", "Asia/Makassar").format("HH:mm");

    await Reminder.create({ chatId, text: reminderText, time: timeInWITA, repeat: repeatInterval });

    let repeatMessage = repeatInterval ? ` (Berulang setiap ${repeatInterval})` : "";
    bot.sendMessage(chatId, `✅ **Pengingat Berhasil Disimpan!**\n\n📝 **Pesan:** ${reminderText}\n⏰ **Waktu:** ${timeInWITA} WITA${repeatMessage}\n🗓️ **Tanggal:** ${moment().tz("Asia/Makassar").format("DD/MM/YYYY")}`, { parse_mode: "Markdown" });
});

// === Perintah /list untuk Melihat Semua Pengingat ===
bot.onText(/\/list/, async (msg) => {
    const chatId = msg.chat.id;
    const reminders = await Reminder.find({ chatId });

    if (reminders.length === 0) {
        bot.sendMessage(chatId, "📌 Tidak ada pengingat yang tersimpan.");
        return;
    }

    let message = "📋 **Daftar Pengingat Aktif**\n\n";
    reminders.forEach((reminder, index) => {
        let repeatInfo = reminder.repeat ? ` 🔄 *(Berulang setiap ${reminder.repeat})*` : " 📌 *(Sekali saja)*";
        message += `**${index + 1}.** ${reminder.text}\n⏰ ${reminder.time} WITA${repeatInfo}\n\n`;
    });

    bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
});

// === Perintah /help untuk Menampilkan semua perintah ===
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpMessage = `
🤖 **Telegram Reminder Bot - Panduan Penggunaan**

📌 **Perintah yang tersedia:**

🔔 **\/remindme** \<pesan\> \<waktu\> \[repeat\]
   ▪️ Menyimpan pengingat dengan waktu tertentu
   ▪️ Format waktu: HH:MM (24 jam)
   ▪️ Repeat opsional: 1h, 2h, 3h, 4h, 5h, 6h, 7h, 8h, 9h, 10h

📋 **\/list** - Melihat semua pengingat aktif
✅ **\/done** \<nomor\> - Menghapus pengingat yang selesai
❓ **\/examples** - Melihat contoh penggunaan
🆘 **\/help** - Menampilkan bantuan ini

⏰ **Zona Waktu:** WITA (GMT+8)
    `;

    bot.sendMessage(chatId, helpMessage, { parse_mode: "Markdown" });
});

// === Perintah /examples untuk Menampilkan contoh penggunaan ===
bot.onText(/\/examples/, (msg) => {
    const chatId = msg.chat.id;
    const examplesMessage = `
📚 **Contoh Penggunaan Reminder Bot**

🔹 **Pengingat Sekali:**
\`/remindme Minum obat 08:00\`
\`/remindme Meeting dengan tim 14:30\`
\`/remindme Panggil mama 19:00\`
\`/remindme Belajar bahasa Inggris 20:15\`

🔹 **Pengingat Berulang:**
\`/remindme Minum air putih 09:00 2h\`
*→ Setiap 2 jam mulai dari 09:00*

\`/remindme Istirahat mata 10:00 1h\`
*→ Setiap 1 jam mulai dari 10:00*

\`/remindme Cek email 08:30 4h\`
*→ Setiap 4 jam mulai dari 08:30*

\`/remindme Backup data 22:00 6h\`
*→ Setiap 6 jam mulai dari 22:00*

🕐 **Pilihan Repeat:** 1h, 2h, 3h, 4h, 5h, 6h, 7h, 8h, 9h, 10h

💡 **Tips:**
• Gunakan format 24 jam (00:00 - 23:59)
• Waktu menggunakan zona WITA (GMT+8)
• Tanpa repeat = pengingat sekali saja
• Dengan repeat = pengingat berulang sesuai interval
    `;

    bot.sendMessage(chatId, examplesMessage, { parse_mode: "Markdown" });
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

    bot.sendMessage(chatId, `✅ **Pengingat Berhasil Dihapus!**\n\n📝 ${removed.text}\n⏰ ${removed.time} WITA`, { parse_mode: "Markdown" });
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
        bot.sendMessage(reminder.chatId, `🔔📝 ${reminder.text}\n⏰ ${moment().tz("Asia/Makassar").format("HH:mm")} WITA\n📅 ${moment().tz("Asia/Makassar").format("DD/MM/YYYY")}`, { parse_mode: "Markdown" });

        if (reminder.repeat) {
            let newTime = moment.tz(reminder.time, "HH:mm", "Asia/Makassar");

            if (reminder.repeat === "1h") {
                newTime.add(1, "hour");
            } else if (reminder.repeat === "2h") {
                newTime.add(2, "hours");
            } else if (reminder.repeat === "3h") {
                newTime.add(3, "hours");
            } else if (reminder.repeat === "4h") {
                newTime.add(4, "hours");
            } else if (reminder.repeat === "5h") {
                newTime.add(5, "hours");
            } else if (reminder.repeat === "6h") {
                newTime.add(6, "hours");
            } else if (reminder.repeat === "7h") {
                newTime.add(7, "hours");
            } else if (reminder.repeat === "8h") {
                newTime.add(8, "hours");
            } else if (reminder.repeat === "9h") {
                newTime.add(9, "hours");
            } else if (reminder.repeat === "10h") {
                newTime.add(10, "hours");
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
