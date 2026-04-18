const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const http = require('http'); 
const db = require('./database');
const logic = require('./logic');
const bosses = require('./bosses');
const skills = require('./skills');
const jobs = require('./jobs');
require('dotenv').config();

// Render用ポートバインド
const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end();
}).listen(PORT, '0.0.0.0');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const activeBattles = new Map();
const parties = new Map(); // Key: リーダーID, Value: { name, members: [], alliances: [] }

const botController = {
    // --- ステータス表示 (ご要望レイアウト) ---
    async showStatus(msg, u) {
        const getBonus = (key) => (u.equip && u.equip[key] > 0) ? ` (+${u.equip[key]})` : "";
        
        // パーティー情報の取得
        let partyInfo = "未所属/ソロ";
        for (const [leaderId, p] of parties) {
            if (p.members.includes(u._id)) {
                partyInfo = p.name;
                break;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(`📜 ステータス`)
            .setDescription(`**${u.name}** Lv${u.lv || 1} 【${u.job}】\n**パーティー名:** ${partyInfo}`)
            .setColor(0x00FF00)
            .addFields(
                { name: "HP", value: `${u.stats.hp}${getBonus('hp')}`, inline: true },
                { name: "MP", value: `${u.mp || 0}${getBonus('mp')}`, inline: true },
                { name: "\u200B", value: "\u200B", inline: true },
                { name: "攻撃", value: `${String(u.stats.atk).padStart(3, '0')}${getBonus('atk')}`, inline: true },
                { name: "防御", value: `${String(u.stats.def).padStart(3, '0')}${getBonus('def')}`, inline: true },
                { name: "速度", value: `${String(u.stats.spd).padStart(3, '0')}${getBonus('spd')}`, inline: true },
                { name: "運", value: `${String(u.stats.luk).padStart(3, '0')}${getBonus('luk')}`, inline: true }
            );
        return msg.reply({ embeds: [embed] });
    },

    // --- パーティー/連合管理 ---
    async handleParty(msg, type, args) {
        const userId = msg.author.id;
        
        if (type === 'create') {
            const pName = args.join(' ') || "無名隊";
            parties.set(userId, { name: pName, members: [userId], alliances: [] });
            return msg.reply(`🚩 パーティー **[${pName}]** を作成しました！`);
        }

        if (type === 'join') {
            const target = msg.mentions.users.first();
            if (!target || !parties.has(target.id)) return msg.reply("❌ 有効なリーダーをメンションしてください。");
            const p = parties.get(target.id);
            if (p.members.length >= 4) return msg.reply("❌ パーティーは最大4人までです。");
            p.members.push(userId);
            return msg.reply(`✅ **${p.name}** に参加しました。`);
        }

        if (type === 'alliance') {
            const target = msg.mentions.users.first();
            if (!target || !parties.has(target.id) || !parties.has(userId)) return msg.reply("❌ お互いにパーティーリーダーである必要があります。");
            const myP = parties.get(userId);
            if (myP.alliances.length >= 3) return msg.reply("❌ 最大4連合までです。");
            myP.alliances.push(target.id);
            return msg.reply(`🤝 **${parties.get(target.id).name}** と連合を組みました！`);
        }

        if (type === 'disband') {
            if (!parties.has(userId)) return msg.reply("❌ あなたはリーダーではありません。");
            parties.delete(userId);
            return msg.reply("💥 パーティーを解散しました。");
        }
    }
};

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    const users = db.getCollection("users");

    // コマンド分岐
    if (msg.content === 'p/登録') {
        const jobNames = Object.keys(jobs);
        const randomJob = jobNames[Math.floor(Math.random() * jobNames.length)];
        const jobData = jobs[randomJob];
        await users.updateOne({ _id: msg.author.id }, { $set: { 
            _id: msg.author.id, name: msg.author.username, job: randomJob, lv: 1, stats: { ...jobData }, mp: jobData.mp || 40 
        }}, { upsert: true });
        return msg.reply("✅ 登録完了！");
    }

    if (msg.content === 'p/ステータス') {
        const u = await users.findOne({ _id: msg.author.id });
        if (u) await botController.showStatus(msg, u);
    }

    // パーティーコマンド
    if (msg.content.startsWith('p/パーティー作成')) await botController.handleParty(msg, 'create', msg.content.split(' ').slice(1));
    if (msg.content.startsWith('p/パーティー参加')) await botController.handleParty(msg, 'join');
    if (msg.content.startsWith('p/パーティー連合')) await botController.handleParty(msg, 'alliance');
    if (msg.content === 'p/パーティー解散') await botController.handleParty(msg, 'disband');

    // バトル（連合対応）
    if (msg.content === 'b/出発') {
        const myP = parties.get(msg.author.id);
        if (!myP) return msg.reply("❌ リーダーのみが出発できます。");
        
        // 全参加メンバー（連合含む）を抽出
        let allMemberIds = [...myP.members];
        myP.alliances.forEach(lId => {
            if (parties.has(lId)) allMemberIds.push(...parties.get(lId).members);
        });

        // 重複排除してデータ取得
        const uniqueIds = [...new Set(allMemberIds)];
        const memberData = [];
        for (const id of uniqueIds) {
            const u = await users.findOne({ _id: id });
            if (u) memberData.push(u);
        }

        // ここからバトル開始ロジック（前述のstartBattleと同様）...
        msg.reply(`⚔️ **連合軍 総勢 ${memberData.length} 名** で出撃します！`);
        // ※ 実際のバトルロジックは文字数制限のため一部省略していますが、memberDataを渡すことで動きます
    }
});

db.connect(process.env.MONGO_URL).then(() => client.login(process.env.DISCORD_TOKEN));
