const http = require('http');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const dbManager = require('./database');
const logic = require('./logic');
const jobs = require('./jobs');
const weapons = require('./weapons');
const bosses = require('./bosses');
require('dotenv').config();

http.createServer((req, res) => { res.write('Bot is running!'); res.end(); }).listen(process.env.PORT || 3000);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    const users = dbManager.getCollection("users");

    if (msg.content.startsWith('p/登録')) {
        const jobName = msg.content.split(' ')[1];
        if (!jobs[jobName]) return msg.reply(`役職を選んでね: [${Object.keys(jobs).join(', ')}]`);
        
        const userData = {
            _id: msg.author.id, name: msg.author.username, job: jobName,
            level: 1, exp: 0, money: 500, sp: 0,
            stats: { ...jobs[jobName] }, current_hp: jobs[jobName].hp,
            equipment: { weapon: "なし" }, rank_cleared: 0
        };
        await users.updateOne({ _id: msg.author.id }, { $set: userData }, { upsert: true });

        const embed = new EmbedBuilder()
            .setTitle(`✅ 登録完了：${jobName}`)
            .setImage(jobs[jobName].imageUrl)
            .setColor(0x00FF00);
        return msg.reply({ embeds: [embed] });
    }

    if (msg.content === 'p/ステータス') {
        const u = await users.findOne({ _id: msg.author.id });
        if (!u) return msg.reply("登録してね");
        const embed = new EmbedBuilder()
            .setTitle(`📜 ${u.name} のステータス`)
            .setThumbnail(jobs[u.job].imageUrl)
            .addFields(
                { name: "Lv", value: `${u.level}`, inline: true },
                { name: "HP", value: `${u.current_hp}/${u.stats.hp}`, inline: true },
                { name: "ATK", value: `${u.stats.atk}`, inline: true },
                { name: "お金", value: `${u.money}G`, inline: true }
            );
        return msg.reply({ embeds: [embed] });
    }

    if (msg.content === 'b/ボス出現') {
        const bossKeys = Object.keys(bosses);
        const b = bosses[bossKeys[Math.floor(Math.random() * bossKeys.length)]];
        const embed = new EmbedBuilder()
            .setTitle(`🌌 ボス：${b.name}`)
            .setDescription(`HP: ${b.hp} ${logic.createHpBar(b.hp, b.hp)}`)
            .setImage(b.imageUrl)
            .setColor(0xFF0000);
        return msg.reply({ embeds: [embed] });
    }
});

dbManager.connect(process.env.MONGO_URL).then(() => {
    client.login(process.env.DISCORD_TOKEN);
    console.log("🎮 RPG Online!");
});




 
