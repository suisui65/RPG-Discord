// Renderの無料枠エラーを回避するためのコード
const http = require('http');
http.createServer((req, res) => {
  res.write('Bot is running!');
  res.end();
}).listen(process.env.PORT || 3000);

// --- ここから下に、元のコードが続くようにしてください ---

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
        message.reply(`✅ **${jobName}** として登録完了！ \`p/ステータス\` で確認できるよ。`);
    }

    // --- 【 p/ステータス 】 ---
    if (message.content === 'p/ステータス') {
        const user = await users.findOne({ _id: message.author.id });
        if (!user) return message.reply("まずは `p/登録 [役職]` でキャラを作ってね。");

        const embed = new EmbedBuilder()
            .setTitle(`${user.name} のステータス`)
            .addFields(
                { name: "職業", value: user.job, inline: true },
                { name: "HP", value: `${user.current_hp} / ${user.stats.hp}`, inline: true },
                { name: "ヘイト", value: `🔥 ${Math.floor(user.hate)}`, inline: true }
            )
            .setColor(0x00AAFF);
        message.reply({ embeds: [embed] });
    }

    // --- 【 b/ボス出現 】 ---
    if (message.content === 'b/ボス出現') {
        const boss = { 
            ...config.BOSS_DATA, 
            channelId: message.channel.id, 
            hp: config.BOSS_DATA.max_hp, 
            active: true,
            status: [], // 状態異常リスト
            crystals: 0 // 特殊ギミック用
        };
        await battles.updateOne({ channelId: message.channel.id }, { $set: boss }, { upsert: true });
        
        const embed = new EmbedBuilder()
            .setTitle(`🌌 ボス襲来: ${boss.name}`)
            .setImage(boss.image)
            .setDescription(`HP: ${boss.hp}/${boss.max_hp}\n${logic.createHpBar(boss.hp, boss.max_hp)}`)
            .setColor(0xFF0000);
        message.reply({ embeds: [embed] });
    }

    // --- 【 b/攻撃 】 ---
    if (message.content === 'b/攻撃') {
        const user = await users.findOne({ _id: message.author.id });
        const boss = await battles.findOne({ channelId: message.channel.id, active: true });

        if (!user) return message.reply("まずは `p/登録` してね！");
        if (!boss) return message.reply("今は戦う相手がいないよ。 `b/ボス出現` させてね。");

        // 回避判定 (SPD差を利用)
        const avoidRate = Math.max(0, Math.min(0.35, (boss.spd - user.stats.spd) / 100));
        if (Math.random() < avoidRate) {
            return message.reply(`💨 ${boss.name} に攻撃をかわされた！`);
        }

        // ダメージ計算 (logic.jsを使用)
        const result = logic.calculateDamage(user.stats.atk, boss.def, user.stats.luk);
        const newHp = Math.max(0, boss.hp - result.dmg);
        
        // ヘイト計算 (タンクは2倍)
        const jobWeights = { "タンク": 2.0, "剣士": 1.0, "魔術師": 0.8, "弓士": 0.5 };
        const addedHate = result.dmg * (jobWeights[user.job] || 1.0);

        // データベース更新
        await battles.updateOne({ _id: boss._id }, { $set: { hp: newHp } });
        await users.updateOne({ _id: user._id }, { $inc: { hate: addedHate } });

        // メッセージ送信
        const embed = new EmbedBuilder()
            .setTitle(`⚔ ${user.job}の攻撃！`)
            .setDescription(
                `**${result.dmg}** ダメージ！ ${result.isCrit ? "**(CRITICAL!)**" : ""}\n\n` +
                `${boss.name} HP: ${newHp}/${boss.max_hp}\n` +
                `${logic.createHpBar(newHp, boss.max_hp)}\n` +
                `${logic.getStatusDisplay(boss.status)}`
            )
            .setColor(0x00FF00);
        
        message.reply({ embeds: [embed] });

        // 撃破判定
        if (newHp <= 0) {
            await battles.updateOne({ _id: boss._id }, { $set: { active: false } });
            message.reply(`🎊 **${boss.name}** を討伐した！世界に平和が訪れた！`);
        }
    }
});
client.once('ready', () => {
    console.log(`✅ Discordにログインしました: ${client.user.tag}`);
});

// ログイン処理
dbManager.connect(process.env.MONGO_URL).then(() => {
    client.login(process.env.DISCORD_TOKEN);
});
