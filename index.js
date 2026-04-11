const http = require('http');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const dbManager = require('./database');
const logic = require('./logic');
const jobs = require('./jobs');
const skills = require('./skills');
const bosses = require('./bosses');
require('dotenv').config();

// --- 🛠️ Renderの再起動ループを防ぐダミーサーバー ---
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running safely!\n');
}).listen(process.env.PORT || 3000); 

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

let activeBattles = new Map();

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    const users = dbManager.getCollection("users");

    // --- p/強化：SPを使ってステータスを上げる ---
    if (msg.content.startsWith('p/強化')) {
        const stat = msg.content.split(' ')[1]; // hp, atk, def, spd, luk
        const u = await users.findOne({ _id: msg.author.id });
        if (!u || u.sp < 1) return msg.reply("SPが足りません。");

        // SPDとLUKのみ最大値100の制限
        if ((stat === 'spd' || stat === 'luk') && u.stats[stat] >= 100) {
            return msg.reply(`${stat.toUpperCase()}はポイントでは100が上限です！`);
        }

        let update = { $inc: { sp: -1 } };
        update.$inc[`stats.${stat}`] = (stat === 'hp') ? 10 : 1;
        await users.updateOne({ _id: msg.author.id }, update);
        msg.reply(`✨ ${stat.toUpperCase()}を強化した！ (残りSP: ${u.sp - 1})`);
    }

    // --- b/攻撃：基本の戦闘コマンド ---
    if (msg.content === 'b/攻撃') {
        const session = activeBattles.get(msg.channel.id);
        if (!session) return;

        const u = await users.findOne({ _id: msg.author.id });
        
        // 1. プレイヤーの攻撃
        const res = logic.calculateDamage(u.stats, session.boss);
        session.boss.hp -= res.dmg;
        
        let battleLog = `💥 **${u.name}** の攻撃！ **${res.dmg}** ダメージ！`;
        if (res.isCrit) battleLog = `🔥 **CRITICAL!!** ` + battleLog;
        if (res.dmg === 0) battleLog = `💨 ボスに回避された！`;

        // 2. ボスの反撃判定 (30%)
        if (Math.random() < 0.3) {
            const targetId = logic.selectTarget(session.participants);
            const targetUser = await users.findOne({ _id: targetId });
            // ボスもスキルがあればMPを消費して使う(AI)
            const bRes = logic.calculateDamage(session.boss, targetUser.stats);
            battleLog += `\n🌟 **ボスの行動！** <@${targetId}> に **${bRes.dmg}** ダメージ！`;
        }

        msg.reply(`${battleLog}\n(ボス残りHP: ${session.boss.hp})`);

        // 3. 撃破チェック
        if (session.boss.hp <= 0) {
            const rewards = logic.distributeRewards(100, 500, session.boss.rank, session.participants);
            for (const r of rewards) {
                await users.updateOne({ _id: r.id }, { $inc: { exp: r.exp, money: r.money }, $set: { escape_stack: 0 } });
            }
            msg.channel.send("🎊 **VICTORY!** ボスを倒した！貢献度に応じて報酬を分配しました。");
            activeBattles.delete(msg.channel.id);
        }
    }
});

dbManager.connect(process.env.MONGO_URL).then(() => {
    client.login(process.env.DISCORD_TOKEN);
});
