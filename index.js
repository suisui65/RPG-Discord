// --- 📦 必要な部品の読み込み ---
const http = require('http'); // 偽物ポート用
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const dbManager = require('./database');
const logic = require('./logic');
const jobs = require('./jobs');
const skillsData = require('./skills');
const bosses = require('./bosses');
require('dotenv').config();

// --- 🛠️ 【初心者ガイド】Renderの再起動ループを防ぐ設定 ---
// これを書いておくことで、Renderが「このアプリは正常に動いている」と判断します。
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running safely!\n');
}).listen(process.env.PORT || 3000); 

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// バトル中のデータを一時的に保存する場所
let activeBattles = new Map();

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    const users = dbManager.getCollection("users");

    // --- 🆙 p/強化：ステータスポイント(SP)を振り分ける ---
    // 使い方：p/強化 atk
    if (msg.content.startsWith('p/強化')) {
        const stat = msg.content.split(' ')[1];
        const u = await users.findOne({ _id: msg.author.id });
        if (!u || u.sp < 1) return msg.reply("SP（ステータスポイント）が足りません。");
        
        // SPでの上昇は100まで。装備分は別途加算されます。
        if (u.stats[stat] >= 100 && stat !== 'hp') return msg.reply("この項目はSPではこれ以上上げられません。");

        let update = { $inc: { sp: -1 } };
        update.$inc[`stats.${stat}`] = (stat === 'hp') ? 10 : 1;
        await users.updateOne({ _id: msg.author.id }, update);
        msg.reply(`✨ ${stat.toUpperCase()}を強化しました！ (残りSP: ${u.sp - 1})`);
    }

    // --- ⚔️ b/攻撃：バトル中の基本攻撃 ---
    if (msg.content === 'b/攻撃') {
        const session = activeBattles.get(msg.channel.id);
        if (!session) return; // バトル中でなければ無視

        const u = await users.findOne({ _id: msg.author.id });
        // 1. 自分の攻撃
        const res = logic.calculateDamage(u.stats, session.boss);
        session.boss.hp -= res.dmg;
        
        // 2. ボスの反撃判定 (30%)
        let counterMsg = "";
        if (Math.random() < 0.3) {
            const targetId = logic.selectTarget(session.participants);
            const bRes = logic.calculateDamage(session.boss, (await users.findOne({_id: targetId})).stats);
            counterMsg = `\n⚠️ **ボスの反撃！** <@${targetId}> は ${bRes.dmg} のダメージを受けた！`;
        }

        msg.reply(`💥 **${res.dmg}** ダメージ！ (ボス残りHP: ${session.boss.hp})${counterMsg}`);

        // 3. ボスを倒した時の処理
        if (session.boss.hp <= 0) {
            const rewards = logic.distributeRewards(100, 500, session.boss.rank, session.participants);
            for (const r of rewards) {
                // 報酬の自動振り込み ＆ 逃亡ペナルティのリセット
                await users.updateOne({_id: r.id}, { $inc: { exp: r.exp, money: r.money }, $set: { escape_stack: 0 } });
            }
            msg.channel.send("🎊 **BOSS DEFEATED!** 報酬が貢献度に応じて配分されました！");
            activeBattles.delete(msg.channel.id);
        }
    }
});

// データベースに接続してからボットを起動
dbManager.connect(process.env.MONGO_URL).then(() => {
    client.login(process.env.DISCORD_TOKEN);
    console.log("🎮 RPG System Online!");
});
