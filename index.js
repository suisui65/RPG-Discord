const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const http = require('http'); 
const db = require('./database');
const logic = require('./logic');
const bosses = require('./bosses');
const skills = require('./skills');
const jobs = require('./jobs');
require('dotenv').config();

// --- Render用ポートバインド ---
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
    // --- ユーザー登録 ---
    async registerUser(msg, users) {
        const jobNames = Object.keys(jobs);
        const randomJob = jobNames[Math.floor(Math.random() * jobNames.length)];
        const jobData = jobs[randomJob];
        const newUser = {
            _id: msg.author.id, name: msg.author.username, job: randomJob,
            lv: 1, exp: 0, money: 1000, stats: { ...jobData },
            mp: jobData.mp || 40, rank_cleared: 0
        };
        await users.updateOne({ _id: msg.author.id }, { $set: newUser }, { upsert: true });
        return msg.reply(`✅ **${randomJob}** として登録しました！`);
    },

    // --- ステータス表示 (新レイアウト) ---
    async showStatus(msg, u) {
        const getBonus = (key) => (u.equip && u.equip[key] > 0) ? ` (+${u.equip[key]})` : "";
        let partyName = "未所属/ソロ";
        for (const [lId, p] of parties) { if (p.members.includes(u._id)) { partyName = p.name; break; } }

        const pad = (v) => String(v).padStart(3, '0');
        const embed = new EmbedBuilder()
            .setTitle(`📜 ステータス`)
            .setDescription(`<@${u._id}> Lv${u.lv || 1} 【${u.job}】\n**パーティー:** ${partyName}`)
            .setColor(0x00FF00)
            .addFields(
                { name: "HP", value: `${u.stats.hp}${getBonus('hp')}`, inline: true },
                { name: "MP", value: `${u.mp || 0}${getBonus('mp')}`, inline: true },
                { name: "\u200B", value: "\u200B", inline: true },
                { name: "攻撃", value: `${pad(u.stats.atk)}${getBonus('atk')}`, inline: true },
                { name: "防御", value: `${pad(u.stats.def)}${getBonus('def')}`, inline: true },
                { name: "速度", value: `${pad(u.stats.spd)}${getBonus('spd')}`, inline: true },
                { name: "運", value: `${pad(u.stats.luk)}${getBonus('luk')}`, inline: true }
            );
        return msg.reply({ embeds: [embed] });
    },

    // --- パーティー/連合管理 ---
    async handleParty(msg, type, args) {
        const uid = msg.author.id;
        if (type === 'create') {
            const name = args.join(' ') || "無名隊";
            parties.set(uid, { name, members: [uid], alliances: [] });
            return msg.reply(`🚩 パーティー **[${name}]** を結成！`);
        }
        if (type === 'join') {
            const target = msg.mentions.users.first();
            if (!target || !parties.has(target.id)) return msg.reply("❌ 有効なリーダーをメンションしてください。");
            const p = parties.get(target.id);
            if (p.members.length >= 4) return msg.reply("❌ 満員です。");
            p.members.push(uid);
            return msg.reply(`✅ **${p.name}** に参加しました。`);
        }
        if (type === 'alliance') {
            const target = msg.mentions.users.first();
            if (!target || !parties.has(target.id) || !parties.has(uid)) return msg.reply("❌ リーダー同士でメンションしてください。");
            const myP = parties.get(uid);
            if (myP.alliances.length >= 3) return msg.reply("❌ 最大4連合までです。");
            myP.alliances.push(target.id);
            return msg.reply(`🤝 **${parties.get(target.id).name}** と連合を組みました！`);
        }
        if (type === 'disband') {
            if (parties.delete(uid)) return msg.reply("💥 解散しました。");
        }
    },

    // --- バトルコアロジック ---
    async startBattle(msg, leaderId, users) {
        if (activeBattles.has(msg.channel.id)) return msg.reply("⚠️ 戦闘中です。");
        
        let memberIds = [leaderId];
        const p = parties.get(leaderId);
        if (p) {
            memberIds = [...p.members];
            p.alliances.forEach(lId => { if (parties.has(lId)) memberIds.push(...parties.get(lId).members); });
        }
        const uniqueIds = [...new Set(memberIds)];
        const memberData = [];
        for (const id of uniqueIds) { const u = await users.findOne({ _id: id }); if (u) memberData.push(u); }

        const nextRank = Math.max(...memberData.map(m => m.rank_cleared || 0)) + 1;
        const bData = bosses[String(nextRank)] || bosses["1"];
        const mult = logic.calculateBossMultiplier(nextRank) * (1 + (memberData.length - 1) * 0.5);

        const session = {
            boss: { ...bData, hp: Math.floor(bData.hp * mult), max_hp: Math.floor(bData.hp * mult), mp: 0 },
            participants: memberData.map(m => ({ 
                _id: m._id, name: m.name, job: m.job, hp: m.stats.hp, mp: m.mp || 40, stats: m.stats, cooldowns: {} 
            })),
            turnOrder: logic.getTurnOrder(memberData, bData), currentIndex: 0, turnCount: 1
        };
        activeBattles.set(msg.channel.id, session);
        await this.renderTurn(msg.channel, session);
    },

    async renderTurn(channel, session) {
        const current = session.turnOrder[session.currentIndex];
        const turnList = session.turnOrder.map((e, i) => {
            const isCurrent = i === session.currentIndex;
            const arrow = isCurrent ? " ◀️" : "";
            if (e.isPlayer) {
                const p = session.participants.find(part => part._id === e.id);
                return `・${e.name}${arrow}\n：${p.hp <= 0 ? "💀 戦闘不能" : `HP${p.hp} MP${p.mp}`}`;
            }
            return `・${e.name}${arrow}\n：HP${session.boss.hp}`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setDescription(`┅┅┅\n【ターン】\n${turnList}\n\n📣 **${current.name}** のターン\n┅┅┅`)
            .setColor(current.isPlayer ? 0x00AAFF : 0xFF0000);

        await channel.send({ embeds: [embed] });
        if (!current.isPlayer) setTimeout(() => this.bossAction(channel, session), 2000);
    },

    async handleAction(msg, type, session) {
        const p = session.participants.find(x => x._id === msg.author.id);
        if (p.hp <= 0) return msg.reply("❌ 戦闘不能です。");

        let log = "";
        if (type === "attack") {
            const res = logic.calculateDamage(p.stats, session.boss);
            session.boss.hp -= res.dmg;
            log = `⚔️ **${p.name}** の攻撃！ **${res.dmg}** ダメージ！`;
        } else if (type === "skill") {
            const sName = msg.content.replace('b/スキル ', '').trim();
            const s = skills[sName];
            if (!s || s.job !== p.job || (p.cooldowns[sName] || 0) > 0 || p.mp < s.cost) return msg.reply("❌ 使用不可");
            const res = logic.calculateDamage(p.stats, session.boss);
            const d = Math.max(s.minDmg || 0, res.dmg);
            session.boss.hp -= d; p.mp -= s.cost; p.cooldowns[sName] = s.cd || 3;
            log = `🪄 **${p.name}** の **${sName}**！ **${d}** ダメージ！`;
        }

        if (session.boss.hp <= 0) {
            msg.channel.send(`${log}\n🎊 **討伐成功！**`);
            return activeBattles.delete(msg.channel.id);
        }

        // 反撃判定(30%)
        let counterLog = "";
        if (Math.random() < 0.3) {
            const res = logic.calculateDamage(session.boss, p.stats);
            p.hp = Math.max(0, p.hp - res.dmg);
            counterLog = `\n⚠️ **反撃！** **${p.name}** に ${res.dmg} ダメージ！`;
        }
        await this.proceedTurn(msg.channel, session, log + counterLog);
    },

    async proceedTurn(channel, session, actionLog) {
        await channel.send(actionLog);
        const alive = session.participants.filter(p => p.hp > 0);
        if (alive.length === 0) {
            await channel.send("💀 全員戦闘不能。敗北...");
            return activeBattles.delete(channel.id);
        }
        const curr = session.turnOrder[session.currentIndex];
        if (curr.isPlayer) {
            const p = session.participants.find(x => x._id === curr.id);
            for (let s in p.cooldowns) if (p.cooldowns[s] > 0) p.cooldowns[s]--;
        }
        session.currentIndex = (session.currentIndex + 1) % session.turnOrder.length;
        await this.renderTurn(channel, session);
    },

    async bossAction(channel, session) {
        const alive = session.participants.filter(p => p.hp > 0);
        if (alive.length === 0) return;
        const target = alive[Math.floor(Math.random() * alive.length)];
        const res = logic.calculateDamage(session.boss, target.stats);
        target.hp = Math.max(0, target.hp - res.dmg);
        await this.proceedTurn(channel, session, `👹 **${session.boss.name}** の確定攻撃！ **${target.name}** に ${res.dmg} ダメージ！`);
    }
};

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    const users = db.getCollection("users");

    // 基本コマンド
    if (msg.content === 'p/登録') return botController.registerUser(msg, users);
    if (msg.content === 'p/ステータス') {
        const u = await users.findOne({ _id: msg.author.id });
        if (u) return botController.showStatus(msg, u);
    }

    // パーティーコマンド
    if (msg.content.startsWith('p/パーティー作成')) botController.handleParty(msg, 'create', msg.content.split(' ').slice(1));
    if (msg.content.startsWith('p/パーティー参加')) botController.handleParty(msg, 'join');
    if (msg.content.startsWith('p/パーティー連合')) botController.handleParty(msg, 'alliance');
    if (msg.content === 'p/パーティー解散') botController.handleParty(msg, 'disband');

    // ボス出現・出発
    if (msg.content === 'b/ボス出現' || msg.content === 'b/出発') {
        const u = await users.findOne({ _id: msg.author.id });
        if (u) await botController.startBattle(msg, msg.author.id, users);
    }

    // バトル中アクション
    const session = activeBattles.get(msg.channel.id);
    if (session && session.turnOrder[session.currentIndex].id === msg.author.id) {
        if (msg.content === 'b/攻撃') await botController.handleAction(msg, "attack", session);
        if (msg.content.startsWith('b/スキル')) await botController.handleAction(msg, "skill", session);
        if (msg.content === 'b/逃げる') { activeBattles.delete(msg.channel.id); msg.reply("🏃 逃走しました。"); }
    }
});

db.connect(process.env.MONGO_URL).then(() => client.login(process.env.DISCORD_TOKEN));
