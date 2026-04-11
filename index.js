// ==========================================
// 1. Render用ポート開放 (最優先)
// ==========================================
const http = require('http');
http.createServer((req, res) => {
  res.write('Bot is running!');
  res.end();
}).listen(process.env.PORT || 3000);

// ==========================================
// 2. モジュール読み込み
// ==========================================
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const dbManager = require('./database');
const logic = require('./logic');
const config = require('./config');
require('dotenv').config();

// Intents設定 (Portal側のスイッチONを忘れずに！)
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// デバッグログ
client.on('debug', (info) => console.log(`📡 [DEBUG] ${info}`));
client.on('error', (error) => console.error(`❌ [ERROR] ${error}`));

// ==========================================
// 3. RPGメインロジック
// ==========================================
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    try {
        const users = dbManager.getCollection("users");
        const battles = dbManager.getCollection("battles");

        // --- p/登録 ---
        if (message.content.startsWith('p/登録')) {
            const args = message.content.split(' ');
            const jobName = args[1];
            if (!config.JOBS[jobName]) {
                return message.reply(`役職を選んでね！ [ ${Object.keys(config.JOBS).join(', ')} ]`);
            }
            const userData = {
                _id: message.author.id,
                name: message.author.username,
                job: jobName,
                stats: { ...config.JOBS[jobName] },
                current_hp: config.JOBS[jobName].hp,
                current_mp: 20,
                hate: 0,
                status: []
            };
