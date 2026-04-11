const http = require('http'); 
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const dbManager = require('./database');
const logic = require('./logic');
const jobs = require('./jobs');
const skillsData = require('./skills');
const bosses = require('./bosses');
require('dotenv').config();

// Render用ダミーサーバー
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running safely!\n');
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

    // --- p/登録 ---
    if (msg.content.startsWith('p/登録')) {
        const jobName = msg.content.split(' ')[1];
        const jobData = jobs[jobName];
        if (!jobData) return msg.reply("役職名が正しくないよ。");

        const newUser = {
            _id: msg.author.id,
            name: msg.author.username,
            job: jobName,
            level: 1,
            exp: 0,
            money: 500,
            sp: 0,
            pp: 0,
            stats: { ...jobData },
            inventory: [],
            unlocked_skills: [],
            skill_slots: [null, null, null, null, null],
            rank_cleared: 0,
            escape_stack: 0
        };

        try {
            await users.insertOne(newUser);
            msg.reply(`🎮 **${jobName}** として登録しました！`);
        } catch (e) {
            msg.reply("登録済みです。");
        }
    }

    // --- p/ステータス ---
    if (msg.content === 'p/ステータス') {
        const u = await users.findOne({ _id: msg.author.id });
        if (!u) return msg.reply("まずは登録してね。");

        const embed = new EmbedBuilder()
            .setTitle(`📜 ${u.name} のステータス`)
            .setColor(0x00AAFF)
            .addFields(
                { name: '職業', value: u.job, inline: true },
                { name: 'Lv', value: String(u.level), inline: true },
                { name: '所持金', value: `${u.money} G`, inline: true },
                { name: 'HP', value: String(u.stats.hp), inline: true },
                { name: 'ATK', value: String(u.stats.atk), inline: true },
                { name: 'DEF', value: String(u.stats.def), inline: true },
                { name: 'SPD', value: `${u.stats.spd}/100`, inline: true },
                { name: 'LUK', value: `${u.stats.luk}/100`, inline: true },
                { name: '残りSP', value: String(u.sp), inline: true }
            );
        msg.reply({ embeds: [embed] });
    }

    // --- b/攻撃 ---
    if (msg.content === 'b/攻撃') {
        const session = activeBattles.get(msg.channel.id);
        if (!session) return msg.reply("バトル中ではありません。");

        const u = await users.findOne({ _id: msg.author.id });
        const res = logic.calculateDamage(u.stats, session.boss);
        session.boss.hp -= res.dmg;
        
        let log = `💥 **${u.name}** の攻撃！ **${res.dmg}** ダメージ！`;
        if (Math.random() < 0.3) {
            const targetId = logic.selectTarget(session.participants);
            const target = await users.findOne({ _id: targetId });
            const bRes = logic.calculateDamage(session.boss, target.stats);
            log += `\n👹 **ボスの反撃！** <@${targetId}> に **${bRes.dmg}** ダメージ！`;
        }
        msg.reply(`${log}\n(ボス残りHP: ${session.boss.hp})`);
    }
});

dbManager.connect(process.env.MONGO_URL).then(() => {
    client.login(process.env.DISCORD_TOKEN);
    console.log("RPG Bot is Ready!");
});

