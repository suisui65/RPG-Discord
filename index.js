
const http = require('http');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const dbManager = require('./database');
const logic = require('./logic');
const config = require('./config');
require('dotenv').config();

// 1. Render用ポート開放
http.createServer((req, res) => {
    res.write('Bot is running!');
    res.end();
}).listen(process.env.PORT || 3000);

// 2. Client設定
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// 3. ログ設定
client.on('debug', (m) => console.log(`📡 [DEBUG] ${m}`));
client.on('error', (e) => console.error(`❌ [ERROR] ${e}`));

// 4. メイン処理
client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    try {
        const users = dbManager.getCollection("users");
        const battles = dbManager.getCollection("battles");

        // 登録
        if (msg.content.startsWith('p/登録')) {
            const job = msg.content.split(' ')[1];
            if (!config.JOBS[job]) return msg.reply("役職が正しくないよ");
            await users.updateOne(
                { _id: msg.author.id },
                { $set: { _id: msg.author.id, name: msg.author.username, job, stats: config.JOBS[job], current_hp: config.JOBS[job].hp } },
                { upsert: true }
            );
            return msg.reply(`✅ ${job} で登録したよ！`);
        }

        // ステータス
        if (msg.content === 'p/ステータス') {
            const u = await users.findOne({ _id: msg.author.id });
            if (!u) return msg.reply("登録してね");
            return msg.reply(`${u.name}: ${u.job} (HP: ${u.current_hp}/${u.stats.hp})`);
        }

        // ボス出現
        if (msg.content === 'b/ボス出現') {
            await battles.updateOne(
                { channelId: msg.channel.id },
                { $set: { ...config.BOSS_DATA, channelId: msg.channel.id, hp: config.BOSS_DATA.max_hp, active: true } },
                { upsert: true }
            );
            return msg.reply("🌌 ボスが現れた！");
        }

        // 攻撃
        if (msg.content === 'b/攻撃') {
            const u = await users.findOne({ _id: msg.author.id });
            const b = await battles.findOne({ channelId: msg.channel.id, active: true });
            if (!u || !b) return msg.reply("準備不足だよ");
            const res = logic.calculateDamage(u.stats.atk, b.def, u.stats.luk);
            const nextHp = Math.max(0, b.hp - res.dmg);
            await battles.updateOne({ _id: b._id }, { $set: { hp: nextHp, active: nextHp > 0 } });
            return msg.reply(`⚔️ ${res.dmg}ダメージ！ (残り:${nextHp}) ${nextHp === 0 ? "\n🎊 討伐完了！" : ""}`);
        }
    } catch (err) {
        console.error(err);
    }
});

// 5. 起動
async function startBot() {
    try {
        await dbManager.connect(process.env.MONGO_URL);
        console.log("📦 DB Connected");
        await client.login(process.env.DISCORD_TOKEN);
        console.log("✅ Logged in");
    } catch (e) {
        console.error(e);
    }
}

startBot();

