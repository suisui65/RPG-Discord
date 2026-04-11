// --- 📦 1. 部品のインポート ---
const http = require('http'); 
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const dbManager = require('./database'); // データベース接続用
const logic = require('./logic');       // 計算用
const jobs = require('./jobs');         // 役職データ用
const skillsData = require('./skills'); // スキルデータ用
const bosses = require('./bosses');     // ボスデータ用
require('dotenv').config();

// --- 🛠️ 2. Render用ダミーサーバー (お金をかけずにエラー回避) ---
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running safely!\n');
}).listen(process.env.PORT || 3000); 

// --- 🤖 3. ボットの初期化 ---
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent // これがONじゃないとメッセージを読みません
    ] 
});

let activeBattles = new Map(); // 現在進行中のバトルを保存する場所

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return; // ボットのメッセージには反応しない
    const users = dbManager.getCollection("users");

    // --- 📥 p/登録 [役職名] ---
    if (msg.content.startsWith('p/登録')) {
        const jobName = msg.content.split(' ')[1];
        const jobData = jobs[jobName];

        if (!jobData) return msg.reply("役職を選んでね：[剣士, 弓士, 魔術師, タンク, 商人]");

        const newUser = {
            _id: msg.author.id,
            name: msg.author.username,
            job: jobName,
            level: 1,
            exp: 0,
            money: 500,
            sp: 0,
            pp: 0,
            stats: { ...jobData }, // jobs.jsの設定（SPD/LUK 10など）をコピー
            inventory: [],
            unlocked_skills: [],
            skill_slots: [null, null, null, null, null],
            rank_cleared: 0,
            escape_stack: 0
        };

        try {
            await users.insertOne(newUser);
            msg.reply(`🎮 **${jobName}** として冒険を開始した！`);
        } catch (e) {
            msg.reply("すでに登録済みだよ！");
        }
    }

    // --- 📊 p/ステータス ---
    if (msg.content === 'p/ステータス') {
        const u = await users.findOne({ _id: msg.author.id });
        if (!u) return msg.reply("まずは `p/登録` してね。");

        const embed = new EmbedBuilder()
            .setTitle(`📜 ${u.name} の冒険者カード`)
            .setColor(0x00AAFF)
            .addFields(
                { name: '職業', value: u.job, inline: true },
                { name: 'Lv', value: String(u.level), inline: true },
                { name: '所持金', value: `${u.money} G`, inline: true },
                { name: 'HP', value: String(u.stats.hp), inline: true },
                { name: 'ATK', value: String(u.stats.atk), inline: true },
                { name: 'DEF', value: String(u.stats.def), inline: true },
                { name: 'SPD', value: `${u.stats.spd}/100`, inline: true }, // 上限100を表示
                { name: 'LUK', value: `${u.stats.luk}/100`, inline: true }, // 上限100を表示
                { name: '残りSP', value: String(u.sp), inline: true }
            );
        msg.reply({ embeds: [embed] });
    }

    // --- 🆙 p/強化 [項目] ---
    if (msg.content.startsWith('p/強化')) {
        const stat = msg.content.split(' ')[1]; // hp, atk, def, spd, luk
        const u = await users.findOne({ _id: msg.author.id });
        if (!u || u.sp < 1) return msg.reply("SPが足りないよ！");

        // SPDとLUKのみ上限100のチェック
        if ((stat === 'spd' || stat === 'luk') && u.stats[stat] >= 100) {
            return msg.reply(`${stat.toUpperCase()} は100が上限だよ！`);
        }

        let update = { $inc: { sp: -1 } };
        update.$inc[`stats.${stat}`] = (stat === 'hp') ? 10 : 1;
        await users.updateOne({ _id: msg.author.id }, update
