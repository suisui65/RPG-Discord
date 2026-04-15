const http = require('http'); 
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const dbManager = require('./database');
const logic = require('./logic');
const jobs = require('./jobs');
const bosses = require('./bosses');
require('dotenv').config();

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Raid System Online\n');
}).listen(process.env.PORT || 3000); 

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

let activeBattles = new Map();
let allianceGroups = new Map(); 

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    const users = dbManager.getCollection("users");

    // --- [p/登録, p/ステータス, p/パーティー作成などは前回同様のため中略可能ですが、主要部分のみ記載] ---

    // --- 🐲 b/ボス出現 ---
    if (msg.content === 'b/ボス出現') {
        if (activeBattles.has(msg.channel.id)) return msg.reply("⚠️ ボスはすでに目の前にいる！");
        const u = await users.findOne({ _id: msg.author.id });
        if (!u) return msg.reply("まずは登録してね。");

        const nextRank = (u.rank_cleared || 0) + 1;
        const bData = bosses[String(nextRank)] || bosses["1"];
        const mult = logic.calculateBossMultiplier(nextRank);

        // 連合軍の集計
        const myAlliance = allianceGroups.get(u.party) || (u.party ? [u.party] : null);
        let members = myAlliance ? await users.find({ party: { $in: myAlliance } }).toArray() : [u];
        
        // ターンテーブル作成 (SPD順)
        let entities = members.map(m => ({ id: m._id, name: m.name, spd: m.stats.spd, isPlayer: true }));
        entities.push({ id: 'BOSS', name: bData.name, spd: bData.spd, isPlayer: false });
        entities.sort((a, b) => b.spd - a.spd);

        const session = {
            boss: { ...bData, hp: Math.floor(bData.hp * mult), max_hp: Math.floor(bData.hp * mult) },
            participants: members,
            turnOrder: entities,
            currentIndex: 0,
            turnCount: 1
        };

        activeBattles.set(msg.channel.id, session);

        // 各プレイヤーにDM送信
        for (const m of members) {
            try {
                const user = await client.users.fetch(m._id);
                await user.send(`⚔️ **${bData.name}** との戦闘開始！\n【行動リスト】\n・攻撃: \`b/攻撃\`\n・スキル: \`b/スキル\`\n・アイテム: \`b/アイテム\`\n・逃走: \`b/逃げる\``);
            } catch (e) { console.log("DM送信失敗"); }
        }

        await sendTurnStatus(msg.channel, session);
    }

    // --- ⚔️ バトルコマンド（ターン制ガード付） ---
    const battleCmds = ['b/攻撃', 'b/スキル', 'b/アイテム', 'b/逃げる'];
    if (battleCmds.some(cmd => msg.content.startsWith(cmd))) {
        const session = activeBattles.get(msg.channel.id);
        if (!session) return;

        const currentEntity = session.turnOrder[session.currentIndex];
        
        // 自分のターンかチェック
        if (currentEntity.id !== msg.author.id) {
            return msg.reply(`⚠️ まだあなたの番ではありません！今は **${currentEntity.name}** のターンです。`);
        }

        if (msg.content === 'b/攻撃') {
            const u = await users.findOne({ _id: msg.author.id });
            const res = logic.calculateDamage(u.stats, session.boss);
            session.boss.hp -= res.dmg;

            let log = `💥 **${u.name}** の攻撃！ **${res.dmg}** ダメージ！`;
            if (session.boss.hp <= 0) {
                msg.channel.send(`🎊 **${session.boss.name}** を撃破！報酬を配布しました。`);
                for (const p of session.participants) {
                    await users.updateOne({ _id: p._id }, { $inc: { exp: session.boss.exp_reward, money: session.boss.money_reward } });
                }
                activeBattles.delete(msg.channel.id);
                return;
            }
            await nextTurn(msg.channel, session, log);
        }
        // 他のコマンド(b/逃げる等)も同様のフロー
    }
});

// ターン管理用ヘルパー
async function sendTurnStatus(channel, session) {
    const current = session.turnOrder[session.currentIndex];
    const table = session.turnOrder.map((e, i) => i === session.currentIndex ? `・**${e.name}** ◀️` : `・${e.name}`).join('\n');
    const embed = new EmbedBuilder()
        .setTitle(`🔄 ターン ${session.turnCount}`)
        .setDescription(`**【行動順】**\n${table}\n\n📢 **${current.name}** のターンです！`)
        .setColor(current.isPlayer ? 0x00AAFF : 0xFF0000);
    await channel.send({ embeds: [embed] });
    if (!current.isPlayer) setTimeout(() => bossAction(channel, session), 2000);
}

async function nextTurn(channel, session, log) {
    await channel.send(log);
    session.currentIndex = (session.currentIndex + 1) % session.turnOrder.length;
    if (session.currentIndex === 0) session.turnCount++;
    await sendTurnStatus(channel, session);
}

async function bossAction(channel, session) {
    const target = session.participants[Math.floor(Math.random() * session.participants.length)];
    let log = `👹 **${session.boss.name}** の反撃！ **${target.name}** にダメージ！`;
    await nextTurn(channel, session, log);
}

dbManager.connect(process.env.MONGO_URL).then(() => client.login(process.env.DISCORD_TOKEN));
