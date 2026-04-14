const http = require('http'); 
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const dbManager = require('./database');
const logic = require('./logic');
const jobs = require('./jobs');
const bosses = require('./bosses');
require('dotenv').config();

// --- 🛠️ Render用：再起動ループ防止のダミーサーバー ---
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('RPG Bot is Online!\n');
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

    // --- 📥 p/登録 ---
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
            party: null,       // パーティー名
            isLeader: false,   // リーダーかどうか
            rank_cleared: 0
        };

        try {
            await users.insertOne(newUser);
            msg.reply(`🎮 **${jobName}** として登録しました！`);
        } catch (e) {
            msg.reply("すでに登録されています。");
        }
    }

    // --- 👥 p/パーティー作成 [名前] ---
    if (msg.content.startsWith('p/パーティー作成')) {
        const partyName = msg.content.split(' ')[1];
        if (!partyName) return msg.reply("名前を決めてね！ 例: `p/パーティー作成 勇者隊` ");
        const u = await users.findOne({ _id: msg.author.id });
        if (u.party) return msg.reply("すでにパーティーに所属しています。");

        await users.updateOne({ _id: msg.author.id }, { $set: { party: partyName, isLeader: true } });
        msg.reply(`🚩 パーティー **【${partyName}】** を結成した！`);
    }

    // --- 🤝 p/パーティー参加 [@リーダー] ---
    if (msg.content.startsWith('p/パーティー参加')) {
        const target = msg.mentions.users.first();
        if (!target) return msg.reply("リーダーをメンションしてね！");
        const leader = await users.findOne({ _id: target.id });
        if (!leader || !leader.party || !leader.isLeader) return msg.reply("その人はリーダーではありません。");

        await users.updateOne({ _id: msg.author.id }, { $set: { party: leader.party, isLeader: false } });
        msg.reply(`✨ **${leader.party}** に加入しました！`);
    }

    // --- 🚪 p/パーティー解散 ---
    if (msg.content === 'p/パーティー解散') {
        const u = await users.findOne({ _id: msg.author.id });
        if (!u.party) return msg.reply("パーティーに入っていません。");
        const partyName = u.party;
        await users.updateMany({ party: partyName }, { $set: { party: null, isLeader: false } });
        msg.reply(`👋 パーティー **【${partyName}】** を解散しました。`);
    }

    // --- 📊 p/ステータス ---
    if (msg.content === 'p/ステータス') {
        const u = await users.findOne({ _id: msg.author.id });
        if (!u) return msg.reply("まずは登録してね。");
        const partyInfo = u.party ? `所属: ${u.party}` : "所属: ソロ";

        const embed = new EmbedBuilder()
            .setTitle(`📜 ${u.name} のステータス`)
            .setColor(u.party ? 0xFFD700 : 0x00AAFF)
            .addFields(
                { name: 'パーティー', value: partyInfo, inline: false },
                { name: '職業', value: u.job, inline: true },
                { name: 'Lv', value: String(u.level), inline: true },
                { name: '所持金', value: `${u.money} G`, inline: true },
                { name: 'SPD', value: `${u.stats.spd}/100`, inline: true },
                { name: 'LUK', value: `${u.stats.luk}/100`, inline: true }
            );
        msg.reply({ embeds: [embed] });
    }

    // --- 🐲 b/ボス出現 ---
    if (msg.content === 'b/ボス出現') {
        if (activeBattles.has(msg.channel.id)) return msg.reply("すでにボスがいます！");
        const u = await users.findOne({ _id: msg.author.id });
        if (!u) return msg.reply("登録してね。");

        // ボスデータの準備
        const nextRank = u.rank_cleared + 1;
        const bossTemp = bosses[String(nextRank)] || bosses["1"];
        const mult = logic.calculateBossMultiplier(nextRank);

        // 参加者の決定（ソロかパーティーか）
        let participants = [];
        if (u.party) {
            const members = await users.find({ party: u.party }).toArray();
            participants = members.map(m => ({ id: m._id, name: m.name, hate: m.stats.hate_init }));
            msg.channel.send(`⚔️ パーティー **【${u.party}】** で挑みます！`);
        } else {
            participants = [{ id: u._id, name: u.name, hate: u.stats.hate_init }];
            msg.channel.send(`🗡️ ソロで挑みます！`);
        }

        const session = {
            boss: { ...bossTemp, hp: Math.floor(bossTemp.hp * mult), max_hp: Math.floor(bossTemp.hp * mult) },
            participants: participants.map(p => ({ ...p, damageDealt: 0, damageTaken: 0, heal: 0 }))
        };

        activeBattles.set(msg.channel.id, session);
        const embed = new EmbedBuilder()
            .setTitle(`🐲 BOSS: ${session.boss.name}`)
            .setDescription(`HP: ${session.boss.hp}\n「b/攻撃」で叩け！`)
            .setImage(session.boss.imageUrl).setColor(0xFF0000);
        msg.reply({ embeds: [embed] });
    }

    // --- ⚔️ b/攻撃 ---
    if (msg.content === 'b/攻撃') {
        const session = activeBattles.get(msg.channel.id);
        if (!session) return;
        const u = await users.findOne({ _id: msg.author.id });
        
        // プレイヤーの攻撃
        const res = logic.calculateDamage(u.stats, session.boss);
        session.boss.hp -= res.dmg;
        let log = `💥 **${u.name}** の攻撃！ **${res.dmg}** ダメージ！`;

        // 撃破判定
        if (session.boss.hp <= 0) {
            msg.channel.send(`🎊 **${session.boss.name}** を撃破！報酬を分配しました。`);
            activeBattles.delete(msg.channel.id);
            return;
        }

        // ボスの反撃 (30%)
        if (Math.random() < 0.3) {
            const targetId = logic.selectTarget(session.participants);
            const target = await users.findOne({ _id: targetId });
            const bRes = logic.calculateDamage(session.boss, target.stats);
            log += `\n👹 **攻撃！** <@${targetId}> は **${bRes.dmg}** ダメージ！`;
        }
        msg.reply(`${log}\n(ボス残りHP: ${session.boss.hp})`);
    }
});

dbManager.connect(process.env.MONGO_URL).then(() => {
    client.login(process.env.DISCORD_TOKEN);
    console.log("System Online!");
});
