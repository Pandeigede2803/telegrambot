const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
    chatId: String,
    text: String,
    time: String
});

module.exports = mongoose.model('Reminder', reminderSchema);
