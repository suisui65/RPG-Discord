const http = require('http'); 
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const dbManager = require('./database');
const logic = require('./logic');
const jobs = require('./jobs');
const bosses = require('./bosses');
require('dotenv').config();

// --- 🛠️ Render用：再起動ループ防止のダミーサーバー ---
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('RPG Bot is Online!\n');
}).listen(process.env.PORT || 3000); 

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ] 
});

let activeBattles = new Map();

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    const users = dbManager.getCollection("users");

    // --- 📥 p/登録 ---
    if (msg.content.startsWith('p/登録')) {
        const jobName = msg.content.split(' ')[1];
        const jobData = jobs[jobName];
        if (!jobData) return msg.reply("役職名が正しくないよ：[剣士, 弓士, 魔術師, タンク, 商人]");

        const newUser = {
            _id: msg.author.id,
            name: msg.author.username,
            job: jobName,
            level: 1, exp: 0, money: 500, sp: 0, pp: 0,
            stats: { ...jobData },
            party: null,       // 所属パーティー名
            isLeader: false,   // リーダー権限
            rank_cleared: 0
        };

        try {
            await users.insertOne(newUser);
            msg.reply(`🎮 **${jobName}** として冒険を開始した！`);
        } catch (e) {
            msg.reply("すでに登録されています。");
        }
    }

    // --- 👥 p/パーティー作成 [名前] ---
    if (msg.content.startsWith('p/パーティー作成')) {
        const partyName = msg.content.split(' ')[1];
        if (!partyName) return msg.reply("名前を決めてね！ 例: `p/パーティー作成 勇者隊` ");
        const u = await users.findOne({ _id: msg.author.id });
        if (!u) return msg.reply("まずは登録してね。");
        if (u.party) return msg.reply(`すでにパーティー「${u.party}」に所属しています。`);

        await users.updateOne({ _id: msg.author.id }, { $set: { party: partyName, isLeader: true } });
        msg.reply(`🚩 パーティー **【${partyName}】** を結成した！`);
    }

    // --- 🤝 p/パーティー参加 [@リーダー] ---
    if (msg.content.startsWith('p/パーティー参加')) {
        const target = msg.mentions.users.first();
        if (!target) return msg.reply("リーダーをメンションしてね！");
        const leader = await users.findOne({ _id: target.id });
        if (!leader || !leader.party || !leader.isLeader) return msg.reply("その人はリーダーではありません。");

        await users.updateOne({ _id: msg.author.id }, { $set: { party: leader.party, isLeader: false } });
        msg.reply(`✨ **${leader.party}** に加入しました！`);
    }

    // --- 🚪 p/パーティー解散 ---
    if (msg.content === 'p/パーティー解散') {
        const u = await users.findOne({ _id: msg.author.id });
        if (!u.party) return msg.reply("パーティーに入っていません。");
        const partyName = u.party;
        // 同じパーティー名の全員を脱退させる
        await users.updateMany({ party: partyName }, { $set: { party: null, isLeader: false } });
        msg.reply(`👋 パーティー **【${partyName}】** を解散しました。`);
    }

    // --- 📊 p/ステータス ---
    if (msg.content === 'p/ステータス') {
        const u = await users.findOne({ _id: msg.author.id });
        if (!u) return msg.reply("まずは登録してね。");
        const partyInfo = u.party ? `所属: ${u.party}` : "所属: ソロ";

        const embed = new EmbedBuilder()
            .setTitle(`📜 ${u.name} のステータス`)
            .setColor(u.party ? 0xFFD700 : 0x00AAFF) // パーティー所属なら金色
            .addFields(
                { name: 'パーティー', value: partyInfo, inline: false },
                { name: '職業', value: u.job, inline: true },
                { name: 'Lv', value: String(u.level), inline: true },
                { name: '所持金', value: `${u.money} G`, inline: true },
                { name: 'SPD', value: `${u.stats.spd}/100`, inline: true },
                { name: 'LUK', value: `${u.stats.luk}/100`, inline: true },
                { name: '残りSP', value: String(u.sp), inline: true }
            );
        msg.reply({ embeds: [embed] });
    }

    // --- 🐲 b/ボス出現 ---
    if (msg.content === 'b/ボス出現') {
        if (activeBattles.has(msg.channel.id)) return msg.reply("すでにボスがいます！");
        const u = await users.findOne({ _id: msg.author.id });
        if (!u) return msg.reply("登録してね。");

        const nextRank = u.rank_cleared + 1;
        const bossTemp = bosses[String(nextRank)] || bosses["1"];
        const mult = logic.calculateBossMultiplier(nextRank);

        // 参加者の決定（ソロかパーティーか）
        let participants = [];
        if (u.party) {
