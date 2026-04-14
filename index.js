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
    res.end('RPG Bot is Online!\n');
}).listen(process.env.PORT || 3000); 

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

let activeBattles = new Map();

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    const users = dbManager.getCollection("users");

    // --- 📊 p/ステータス (総合火力表示追加) ---
    if (msg.content === 'p/ステータス') {
        const u = await users.findOne({ _id: msg.author.id });
        if (!u) return msg.reply("まずは登録してね。");

        let partyInfo = "所属: ソロ";
        let totalAtkInfo = "";

        if (u.party) {
            const members = await users.find({ party: u.party }).toArray();
            const totalAtk = members.reduce((sum, m) => sum + m.stats.atk, 0);
            partyInfo = `所属: ${u.party} (${members.length}名)`;
            totalAtkInfo = `\n🔥 **パーティー総合火力: ${totalAtk}**`;
        }

        const embed = new EmbedBuilder()
            .setTitle(`📜 ${u.name} のステータス`)
            .setColor(u.party ? 0xFFD700 : 0x00AAFF)
            .addFields(
                { name: 'パーティー', value: partyInfo + totalAtkInfo, inline: false },
                { name: '職業', value: u.job, inline: true },
                { name: 'Lv', value: String(u.level), inline: true },
                { name: 'ATK', value: String(u.stats.atk), inline: true },
                { name: 'DEF', value: String(u.stats.def), inline: true },
                { name: 'SPD', value: `${u.stats.spd}/100`, inline: true },
                { name: 'LUK', value: `${u.stats.luk}/100`, inline: true }
            );
        msg.reply({ embeds: [embed] });
    }

    // --- 👥 パーティー脱退 ---
    if (msg.content === 'p/パーティー脱退') {
        const u = await users.findOne({ _id: msg.author.id });
        if (!u.party) return msg.reply("パーティーに入っていません。");
        if (u.isLeader) return msg.reply("リーダーは脱退できません。解散（p/パーティー解散）してください。");

        await users.updateOne({ _id: msg.author.id }, { $set: { party: null, isLeader: false } });
        msg.reply(`👋 パーティー **【${u.party}】** から脱退しました。`);
    }

    // --- 🐲 b/ボス出現 (総合火力表示追加) ---
    if (msg.content === 'b/ボス出現') {
        if (activeBattles.has(msg.channel.id)) return msg.reply("⚠️ ボスはすでに目の前にいる！");
        const u = await users.findOne({ _id: msg.author.id });
        if (!u) return msg.reply("登録してね。");

        const nextRank = (u.rank_cleared || 0) + 1;
        const bossData = bosses[String(nextRank)] || bosses["1"]; 
        const mult = logic.calculateBossMultiplier(nextRank);

        let participants = [];
        let displayAtk = 0;

        if (u.party) {
            const members = await users.find({ party: u.party }).toArray();
            participants = members.map(m => ({ id: m._id, name: m.name, hate: m.stats.hate_init }));
            displayAtk = members.reduce((sum, m) => sum + m.stats.atk, 0);
            msg.channel.send(`⚔️ パーティー **【${u.party}】** 総員 ${members.length} 名、突撃！`);
        } else {
            participants = [{ id: u._id, name: u.name, hate: u.stats.hate_init }];
            displayAtk = u.stats.atk;
        }

        const session = {
            boss: { ...bossData, hp: Math.floor(bossData.hp * mult), max_hp: Math.floor(bossData.hp * mult) },
            participants: participants.map(p => ({ ...p, damageDealt: 0, damageTaken: 0, heal: 0 }))
        };

        activeBattles.set(msg.channel.id, session);
        const embed = new EmbedBuilder()
            .setTitle(`🐲 BOSS: ${session.boss.name}`)
            .setDescription(`HP: ${session.boss.hp}\n\n📢 **味方陣営の総火力: ${displayAtk}**`)
            .setImage(session.boss.imageUrl)
            .setColor(0xFF0000);
        msg.reply({ embeds: [embed] });
    }

    // --- (以下、p/登録、b/攻撃 等は前回同様) ---
});
