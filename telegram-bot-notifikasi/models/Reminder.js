const mongoose = require('mongoose');

const ReminderSchema = new mongoose.Schema({
    chatId: { type: Number, required: true },
    text: { type: String, required: true },
    time: { type: String, required: true },  // Pastikan ini sebagai string
    repeat: { type: String, enum: ["1h", "2h", "3h", null], default: null }
});

module.exports = mongoose.model('Reminder', ReminderSchema);
