const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const dbManager = require('./database');
const logic = require('./logic');
const config = require('./config');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const users = dbManager.getCollection("users");
    const battles = dbManager.getCollection("battles");

    // --- 【登録】 ---
    if (message.content.startsWith('p/登録')) {
        const jobName = message.content.split(' ')[1];
        if (!config.JOBS[jobName]) return message.reply("職業を選んでね！");
        
        await users.updateOne({ _id: message.author.id }, { 
            $set: { 
                job: jobName, stats: config.JOBS[jobName], 
                current_hp: config.JOBS[jobName].hp, hate: 0, status: [] 
            } 
        }, { upsert: true });
        message.reply(`✅ ${jobName}として登録しました！`);
    }

    // --- 【ボス出現】 ---
    if (message.content === 'b/ボス出現') {
        const boss = { ...config.BOSS_DATA, channelId: message.channel.id, hp: config.BOSS_DATA.max_hp, active: true };
        await battles.updateOne({ channelId: message.channel.id }, { $set: boss }, { upsert: true });
        
        const embed = new EmbedBuilder()
            .setTitle(`🌌 ${boss.name}襲来`)
            .setImage(boss.image)
            .setDescription(`HP: ${boss.hp}/${boss.max_hp}\n${logic.createHpBar(boss.hp, boss.max_hp)}`)
            .setColor(0xFF0000);
        message.reply({ embeds: [embed] });
    }

    // --- 【攻撃】 ---
    if (message.content === 'b/攻撃') {
        const user = await users.findOne({ _id: message.author.id });
        const boss = await battles.findOne({ channelId: message.channel.id, active: true });
        if (!user || !boss) return message.reply("準備ができていません。");

        const result = logic.calculateDamage(user.stats.atk, boss.def, user.stats.luk);
        const newHp = Math.max(0, boss.hp - result.dmg);
        
        await battles.updateOne({ _id: boss._id }, { $set: { hp: newHp } });
        
        const embed = new EmbedBuilder()
            .setTitle(`⚔ ${user.job}の攻撃`)
            .setDescription(`**${result.dmg}**ダメージ！\n${boss.name} HP: ${newHp}/${boss.max_hp}\n${logic.createHpBar(newHp, boss.max_hp)}`)
            .setColor(0x00FF00);
        message.reply({ embeds: [embed] });
    }
});

dbManager.connect(process.env.MONGO_URL).then(() => {
    client.login(process.env.DISCORD_TOKEN);
});
