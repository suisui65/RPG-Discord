// ==========================================
// 1. Render無料枠用ポート開放
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

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ==========================================
// 3. 診断用ログ
// ==========================================
client.on('debug', (info) => console.log(`📡 [DEBUG] ${info}`));
client.on('error', (error) => console.error(`❌ [ERROR] ${error}`));

// ==========================================
// 4. ボットのメイン処理 (RPG機能)
// ==========================================
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    try {
        const users = dbManager.getCollection("users");
        const battles = dbManager.getCollection("battles");

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

        if (message.content === 'p/ステータス') {
            const user = await users.findOne({ _id: message.author.id });
            if (!user) return message.reply("まずは `p/登録` してね。");
            const embed = new EmbedBuilder()
                .setTitle(`${user.name} のステータス`)
                .addFields(
                    { name: "職業", value: user.job, inline: true },
                    { name: "HP", value: `${user.current_hp} / ${user.stats.hp}`, inline: true }
                )
                .setColor(0x00AAFF);
            message.reply({ embeds: [embed] });
        }

        if (message.content === 'b/ボス出現') {
            const boss = { ...config.BOSS_DATA, channelId: message.channel.id, hp: config.BOSS_DATA.max_hp, active: true };
            await battles.updateOne({ channelId: message.channel.id }, { $set: boss }, { upsert: true });
            const embed = new EmbedBuilder()
                .setTitle(`🌌 ボス出現: ${boss.name}`)
                .setDescription(`HP: ${boss.hp}/${boss.max_hp}`)
                .setColor(0xFF0000);
            message.reply({ embeds: [embed] });
        }

        if (message.content === 'b/攻撃') {
            const user = await users.findOne({ _id: message.author.id });
            const boss = await battles.findOne({ channelId: message.channel.id, active: true });
            if (!user || !boss) return message.reply("戦う準備ができてないよ。");

            const result = logic.calculateDamage(user.stats.atk, boss.def, user.stats.luk);
            const newHp = Math.max(0, boss.hp - result.dmg);
            await battles.updateOne({ _id: boss._id }, { $set: { hp: newHp } });

            const embed = new EmbedBuilder()
                .setTitle(`⚔ ${user.job}の攻撃！`)
                .setDescription(`**${result.dmg}** ダメージ！\n残りHP: ${newHp}/${boss.max_hp}`)
                .setColor(0x00FF00);
            message.reply({ embeds: [embed] });

            if (newHp <= 0) {
                await battles.updateOne({ _id: boss._id }, { $set: { active: false } });
                message.reply(`🎊 **${boss.name}** を討伐した！`);
            }
        }
    } catch (e) {
        console.error("コマンドエラー:", e);
    }
});

// ==========================================
// 5. 起動シーケンス
// ==========================================
async function startBot() {
    try {
        console.log("⏳ データベースに接続中...");
        await dbManager.connect(process.env.MONGO_URL);
        console.log("📦 Database ready.");

        console.log("⏳ Discordにログインを試行中...");
        
        client.once('ready', () => {
            console.log(`✅ Discordにログイン成功: ${client.user.tag}`);
        });

        await client.login(process.env.DISCORD_TOKEN);
        console.log("🚀 Login command sent.");

    } catch (error) {
        console.error("❌ 起動エラー:", error);
    }
}

startBot();

