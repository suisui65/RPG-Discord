const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const dbManager = require('./database');
const logic = require('./logic');
const jobs = require('./jobs');
const bosses = require('./bosses');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// --- プレイヤー強化コマンド (p/強化 [項目]) ---
// 使い方: p/強化 atk  (SPを1消費して攻撃力を1上げる)
client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    const users = dbManager.getCollection("users");

    if (msg.content.startsWith('p/強化')) {
        const stat = msg.content.split(' ')[1]; // atk, def, spd, luk, hp
        const validStats = ['atk', 'def', 'spd', 'luk', 'hp'];
        if (!validStats.includes(stat)) return msg.reply("強化先を選んでね: [hp, atk, def, spd, luk]");

        const u = await users.findOne({ _id: msg.author.id });
        if (!u || u.sp < 1) return msg.reply("ステータスポイント(SP)が足りないよ！");

        let update = { $inc: { sp: -1 } };
        update.$inc[`stats.${stat}`] = (stat === 'hp') ? 10 : 1; // HPなら+10、他は+1
        
        await users.updateOne({ _id: msg.author.id }, update);
        return msg.reply(`✨ ${stat.toUpperCase()} を強化した！ (残りSP: ${u.sp - 1})`);
    }

    // --- ボス出現 (b/ボス出現) ---
    if (msg.content === 'b/ボス出現') {
        const bossData = bosses["dragon_1"];
        // 実際にはここでバトルセッションを開始する処理(activeBattles)が入ります
        const embed = new EmbedBuilder()
            .setTitle(`🐲 ボス現る: ${bossData.name}`)
            .setDescription(`ランク: ${bossData.rank}\nHP: ${bossData.hp}\nMP: ${bossData.mp}\n\n攻撃のたびに30%で反撃してくるぞ！`)
            .setImage(bossData.imageUrl)
            .setColor(0xFF0000);
        return msg.reply({ embeds: [embed] });
    }
    
    // 他の登録・ステータスコマンドなどは前回のまま継続
});

dbManager.connect(process.env.MONGO_URL).then(() => {
    client.login(process.env.DISCORD_TOKEN);
});
