const http = require('http'); 
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const dbManager = require('./database');
const logic = require('./logic');
const jobs = require('./jobs');
const bosses = require('./bosses');
require('dotenv').config();

// Render用ダミーサーバー
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('RPG Bot Online\n');
}).listen(process.env.PORT || 3000); 

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

let activeBattles = new Map();
let allianceGroups = new Map(); 

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
            level: 1, exp: 0, money: 500, sp: 0, pp: 0,
            stats: { ...jobData },
            party: null, isLeader: false, rank_cleared: 0
        };

        try {
            await users.insertOne(newUser);
            msg.reply(`🎮 **${jobName}** として登録しました！`);
        } catch (e) { msg.reply("登録済みです。"); }
    }

    // --- p/ステータス (総合火力表示) ---
    if (msg.content === 'p/ステータス') {
        const u = await users.findOne({ _id: msg.author.id });
        if (!u) return msg.reply("まずは登録してね。");

        let partyInfo = u.party ? `所属: ${u.party}` : "所属: ソロ";
        if (u.party) {
            const members = await users.find({ party: u.party }).toArray();
            const totalAtk = members.reduce((sum, m) => sum + m.stats.atk, 0); // カッコ漏れ注意
            partyInfo += `\n🔥 パーティー総合火力: ${totalAtk}`;
        }

        const embed = new EmbedBuilder()
            .setTitle(`📜 ${u.name} のステータス`)
            .setColor(u.party ? 0xFFD700 : 0x00AAFF)
            .addFields(
                { name: 'パーティー', value: partyInfo, inline: false },
                { name: '職業', value: u.job, inline: true },
                { name: 'Lv', value: String(u.level), inline: true },
                { name: 'ATK', value: String(u.stats.atk), inline: true },
                { name: 'SPD', value: `${u.stats.spd}/100`, inline: true },
                { name: 'LUK', value: `${u.stats.luk}/100`, inline: true }
            );
        msg.reply({ embeds: [embed] });
    }

    // --- p/パーティー連合 ---
    if (msg.content.startsWith('p/パーティー連合')) {
        const target = msg.mentions.users.first();
        if (!target) return msg.reply("リーダーをメンションしてね！");

        const leaderA = await users.findOne({ _id: msg.author.id });
        const leaderB = await users.findOne({ _id: target.id });

        if (!leaderA?.isLeader || !leaderB?.isLeader) return msg.reply("リーダー同士でしか組めないよ。");

        let groupA = allianceGroups.get(leaderA.party) || [leaderA.party];
        let groupB = allianceGroups.get(leaderB.party) || [leaderB.party];

        if (groupA.length + groupB.length > 4) return msg.reply("最大4パーティーまでだよ。");

        const newGroup = [...new Set([...groupA, ...groupB])];
        newGroup.forEach(pName => allianceGroups.set(pName, newGroup));

        msg.reply(`🔥 **【${newGroup.join(' × ')}】** の連合軍が誕生！`);
    }

    // --- b/ボス出現 ---
    if (msg.content === 'b/ボス出現') {
        if (activeBattles.has(msg.channel.id)) return msg.reply("ボスはすでにいるよ！");
        const u = await users.findOne({ _id: msg.author.id });
        if (!u) return msg.reply("登録してね。");

        const nextRank = (u.rank_cleared || 0) + 1;
        const bossData = bosses[String(nextRank)] || bosses["1"];
        const mult = logic.calculateBossMultiplier(nextRank);

        const myAlliance = allianceGroups.get(u.party) || (u.party ? [u.party] : null);
        let participants = [];
        let totalRaidAtk = 0;

        if (myAlliance) {
            const members = await users.find({ party: { $in: myAlliance } }).toArray();
            participants = members.map(m => ({ id: m._id, name: m.name, hate: m.stats.hate_init }));
            totalRaidAtk = members.reduce((sum, m) => sum + m.stats.atk, 0);
        } else {
            participants = [{ id: u._id, name: u.name, hate: u.stats.hate_init }];
            totalRaidAtk = u.stats.atk;
        }

        const session = {
            boss: { ...bossData, hp: Math.floor(bossData.hp * mult), max_hp: Math.floor(bossData.hp * mult) },
            participants: participants.map(p => ({ ...p, damageDealt: 0 }))
        };

        activeBattles.set(msg.channel.id, session);
        msg.reply(`🐲 **${session.boss.name}** 出現！ 連合総火力: **${totalRaidAtk}**`);
    }
});

dbManager.connect(process.env.MONGO_URL).then(() => {
    client.login(process.env.DISCORD_TOKEN);
});
