// ==========================================
// 1. Render無料枠用ポート開放 (最上部で即実行)
// ==========================================
const http = require('http');
http.createServer((req, res) => {
  res.write('Bot is running!');
  res.end();
}).listen(process.env.PORT || 3000);

// ==========================================
// 2. 必要モジュールの読み込み
// ==========================================
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const dbManager = require('./database');
const logic = require('./logic');
const config = require('./config');
require('dotenv').config();

// インテントを「必要最小限かつ確実なもの」に絞ります
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ==========================================
// 3. 診断用ログ (接続の状態を可視化)
// ==========================================
client.on('debug', (info) => console.log(`📡 [DEBUG] ${info}`));
client.on('error', (error) => console.error(`❌ [ERROR] ${error}`));
client.on('shardDisconnect', (event) => console.warn(`⚠️ [DISCONNECT] ${event.reason}`));

// ==========================================
// 4. ボットのメイン処理 (RPG機能)
// ==========================================
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const users = dbManager.getCollection("users");
    const battles = dbManager.getCollection("battles");

    // --- 【 p/登録 】 ---
    if (message.content.startsWith('p/登録')) {
        const jobName = message.content.split(' ')[1];
        if (!config.JOBS[jobName]) {
            return message.reply(`役職を選んでね！ [ ${Object.keys(config.JOBS).join(', ')} ]`);
        }
        const userData = {
            _id: message.author.id,
            name: message.author.username,
            job: jobName,
            stats: { ...config.JOBS[jobName] },
            current_hp: config.JOBS[jobName].hp,
            current_mp: config.JOBS[jobName].mp || 20,
            hate: 0,
            status: []
        };
        await users.updateOne({ _id: message.author.id }, { $set: userData }, { upsert: true });
        message.reply(`✅ **${jobName}** として登録完了！`);
    }

    // --- 【 p/ステータス 】 ---
    if (message.
