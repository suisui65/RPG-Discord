const http = require('http'); 
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const dbManager = require('./database');
const logic = require('./logic');
const jobs = require('./jobs');
const bosses = require('./bosses');
require('dotenv').config();

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('RPG Raid System Online\n');
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
        if (!jobData) return msg.reply("役職名が正しくないよ：[剣士, 弓士, 魔術師, タンク, 商人]");

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
            msg.reply(`🎮 **${jobName}** として登録完了！`);
        } catch (e) { msg.reply("すでに登録されています。"); }
    }

    // --- 📊 p/ステータス ---
    if (msg.content === 'p/ステータス') {
        const u = await users.findOne({ _id: msg.author.id });
        if (!u) return msg.reply("まずは登録してね。");

        let partyDisplay = u.party ? `所属: ${u.party}` : "所属: ソロ";
        if (u.party) {
            const members = await users.find({ party: u.party }).toArray();
            const totalAtk = members.reduce((sum, m) => sum + m.stats.atk, 0);
            partyDisplay += ` (🔥 連合/PT総火力: ${totalAtk})`;
        }

        const embed = new EmbedBuilder()
            .setTitle(`📜 ${u.name} のステータス`)
            .setColor(u.party ? 0xFFD700 : 0x00AAFF)
            .addFields(
                { name: 'パーティー', value: partyDisplay, inline: false },
                { name: '職業', value: u.job, inline: true },
                { name: 'Lv', value: String(u.level), inline: true },
                { name: 'ATK', value: String(u.stats.atk), inline: true },
                { name: 'SPD', value: `${u.stats.spd}/100`, inline: true },
                { name: 'LUK', value: `${u.stats.luk}/100`, inline: true }
            );
        msg.reply({ embeds: [embed] });
    }

    // --- 👥 パーティー・連合操作 ---
    if (msg.content.startsWith('p/パーティー作成')) {
        const name = msg.content.split(' ')[1];
        if (!name) return msg.reply("名前を決めてね。");
        const u = await users.findOne({ _id: msg.author.id });
        if (u.party) return msg.reply("すでに所属しています。");
        await users.updateOne({ _id: msg.author.id }, { $set: { party: name, isLeader: true } });
        msg.reply(`🚩 **【${name}】** を結成！`);
    }

    if (msg.content.startsWith('p/パーティー参加')) {
        const target = msg.mentions.users.first();
        const leader = await users.findOne({ _id: target?.id });
        if (!leader?.isLeader) return msg.reply("リーダーをメンションしてね。");
        await users.updateOne({ _id: msg.author.id }, { $set: { party: leader.party, isLeader: false } });
        msg.reply(`✨ **${leader.party}** に加入！`);
    }

    if (msg.content === 'p/パーティー脱退') {
        const u = await users.findOne({ _id: msg.author.id });
        if (!u.party) return msg.reply("所属していません。");
        if (u.isLeader) return msg.reply("リーダーは解散コマンドを使ってね。");
        await users.updateOne({ _id: msg.author.id }, { $set: { party: null, isLeader: false } });
        msg.reply(`👋 脱退しました。`);
    }

    if (msg.content === 'p/パーティー解散') {
        const u = await users.findOne({ _id: msg.author.id });
        if (!u?.isLeader) return msg.reply("リーダー専用コマンドです。");
        const pName = u.party;
        await users.updateMany({ party: pName }, { $set: { party: null, isLeader: false } });
        allianceGroups.delete(pName);
        msg.reply(`💥 **【${pName}】** を解散しました。`);
    }

    if (msg.content.startsWith('p/パーティー連合')) {
        const target = msg.mentions.users.first();
        const u = await users.findOne({ _id: msg.author.id });
        const targetL = await users.findOne({ _id: target?.id });
        if (!u?.isLeader || !targetL?.isLeader) return msg.reply("リーダー同士で打ってね。");

        let groupA = allianceGroups.get(u.party) || [u.party];
        let groupB = allianceGroups.get(targetL.party) || [targetL.party];
        if (groupA.length + groupB.length > 4) return msg.reply("最大4パーティーまで！");

        const newGroup = [...new Set([...groupA, ...groupB])];
        newGroup.forEach(n => allianceGroups.set(n, newGroup));
        msg.reply(`🔥 連合軍誕生！ **【${newGroup.join(' × ')}】**`);
    }

    // --- 🐲 b/ボス出現 ---
    if (msg.content === 'b/ボス出現') {
        if (activeBattles.has(msg.channel.id)) return msg.reply("ボスはそこにいる！");
        const u = await users.findOne({ _id: msg.author.id });
        const nextRank = (u.rank_cleared || 0) + 1;
        const bData = bosses[String(nextRank)] || bosses["1"];
        const mult = logic.calculateBossMultiplier(nextRank);

        const myAlliance = allianceGroups.get(u.party) || (u.party ? [u.party] : null);
        let members = myAlliance ? await users.find({ party: { $in: myAlliance } }).toArray() : [u];
        
        const session = {
            boss: { ...bData, hp: Math.floor(bData.hp * mult), max_hp: Math.floor(bData.hp * mult) },
            participants: members.map(m => ({ id: m._id, name: m.name, hate: m.stats.hate_init, damageDealt: 0 }))
        };

        activeBattles.set(msg.channel.id, session);
        const totalAtk = members.reduce((s, m) => s + m.stats.atk, 0);
        
        const embed = new EmbedBuilder()
            .setTitle(`🐲 RAID: ${session.boss.name}`)
            .setDescription(`HP: ${session.boss.hp}\n連合総火力: **${totalAtk}**`)
            .setImage(session.boss.imageUrl).setColor(0xFF0000);
        msg.reply({ embeds: [embed] });
    }

    // --- ⚔️ b/攻撃 ---
    if (msg.content === 'b/攻撃') {
        const session = activeBattles.get(msg.channel.id);
        if (!session) return;
        const u = await users.findOne({ _id: msg.author.id });
        if (!session.participants.some(p => p.id === u._id)) return;

        const res = logic.calculateDamage(u.stats, session.boss);
        session.boss.hp -= res.dmg;

        if (session.boss.hp <= 0) {
            msg.reply(`🎊 **${session.boss.name}** を撃破！全員に報酬配布！`);
            for (const p of session.participants) {
                await users.updateOne({ _id: p.id }, { $inc: { exp: session.boss.exp_reward, money: session.boss.money_reward } });
            }
            activeBattles.delete(msg.channel.id);
            return;
        }
        msg.reply(`💥 ${u.name}の攻撃: ${res.dmg}ダメージ！ (残HP: ${session.boss.hp})`);
    }
});

dbManager.connect(process.env.MONGO_URL).then(() => {
    client.login(process.env.DISCORD_TOKEN);
    console.log("Ready.");
});
