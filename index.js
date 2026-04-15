const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const db = require('./database');
const logic = require('./logic');
const bosses = require('./bosses');
const skills = require('./skills');
const bossSkills = require('./boss_skills');
const jobs = require('./jobs'); // 職業データ
require('dotenv').config();

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const activeBattles = new Map();
const allianceGroups = new Map();

// --- おまじない：多重起動やエラーでの強制終了を防ぐ ---
process.on('uncaughtException', (err) => console.error('予期せぬエラー:', err));
process.on('unhandledRejection', (err) => console.error('非同期エラー:', err));

const botController = {
    // 登録機能
    async registerUser(msg, users) {
        const jobNames = Object.keys(jobs);
        const randomJob = jobNames[Math.floor(Math.random() * jobNames.length)];
        const jobData = jobs[randomJob];
        
        const newUser = {
            _id: msg.author.id,
            name: msg.author.username,
            job: randomJob,
            lv: 1,
            exp: 0,
            money: 1000,
            stats: { ...jobData },
            mp: jobData.mp || 40,
            rank_cleared: 0
        };

        await users.updateOne({ _id: msg.author.id }, { $set: newUser }, { upsert: true });
        msg.reply(`✅ 登録完了！あなたの職業は **${randomJob}** です！`);
    },

    // バトル開始
    async startBattle(msg, user, users) {
        if (activeBattles.has(msg.channel.id)) return msg.reply("⚠️ ボスはすでに戦場にいます！");

        const nextRank = (user.rank_cleared || 0) + 1;
        const bData = bosses[String(nextRank)] || bosses["1"];
        const mult = logic.calculateBossMultiplier(nextRank);

        const myAlliance = allianceGroups.get(user.party) || (user.party ? [user.party] : null);
        const members = myAlliance ? await users.find({ party: { $in: myAlliance } }).toArray() : [user];
        const entities = logic.getTurnOrder(members, bData);

        const session = {
            boss: { ...bData, hp: Math.floor(bData.hp * mult), max_hp: Math.floor(bData.hp * mult), mp: 0 },
            participants: members.map(m => ({ ...m, hp: m.stats.hp, mp: m.mp || 40 })),
            turnOrder: entities,
            currentIndex: 0,
            turnCount: 1,
            field: { crystals: 0, traps: [] }
        };

        activeBattles.set(msg.channel.id, session);
        await this.renderTurn(msg.channel, session);
    },

    // プレイヤー行動
    async handleAction(msg, type, session) {
        const users = db.getCollection("users");
        const uData = await users.findOne({ _id: msg.author.id });
        let log = "";

        if (type === "attack") {
            const res = logic.calculateDamage(uData.stats, session.boss);
            session.boss.hp -= res.dmg;
            log = `💥 **${uData.name}** の攻撃！ **${res.dmg}** ダメージ！`;
        } else {
            const skillName = msg.content.replace('b/スキル ', '').trim();
            const skill = skills[skillName];
            if (!skill || skill.job !== uData.job) return msg.reply("❌ そのスキルは使えません。");
            if (uData.mp < skill.cost) return msg.reply("❌ MP不足！");

            const res = logic.calculateDamage(uData.stats, session.boss);
            const d = Math.max(skill.minDmg || 0, res.dmg);
            session.boss.hp -= d;
            log = `🪄 **${uData.name}** の **${skillName}**！ **${d}** ダメージ！`;
            await users.updateOne({ _id: uData._id }, { $inc: { mp: -skill.cost } });
        }

        if (session.boss.hp <= 0) {
            msg.channel.send(`${log}\n🎊 **${session.boss.name}** を撃破！`);
            activeBattles.delete(msg.channel.id);
        } else {
            await this.proceedTurn(msg.channel, session, log);
        }
    },

    // ボス行動
    async bossAction(channel, session) {
        const bSkills = bossSkills["イデア・ジェネシス"];
        const available = Object.keys(bSkills).filter(k => session.boss.mp >= bSkills[k].cost);
        let log = "";

        if (available.length > 0 && Math.random() < 0.7) {
            const sName = available[Math.floor(Math.random() * available.length)];
            const sData = bSkills[sName];
            session.boss.mp -= sData.cost;
            log = `🔴 **${session.boss.name}** の **${sName}**！\n`;

            if (sName === "イデア・スパーク") {
                session.field.crystals = Math.min(3, session.field.crystals + 1);
                log += `💎 理想結晶を生成した。(現在:${session.field.crystals})`;
            } else if (sName === "オーバーブレス") {
                const targetId = logic.selectTarget(session.participants);
                session.field.traps.push({ targetId: targetId, timer: 3 });
                log += `⚠️ 対象に過剰な祝福…。3ターン後に爆発する。`;
            } else {
                const rDmg = 40 + (session.field.crystals * 30);
                session.participants.forEach(p => p.hp -= rDmg);
                session.field.crystals = 0;
                log += `⚡ 共鳴！全員に **${rDmg}** ダメージ！`;
            }
        } else {
            const targetId = logic.selectTarget(session.participants);
            const target = session.participants.find(p => p._id === targetId);
            const res = logic.calculateDamage(session.boss, target.stats);
            log = `👹 **${session.boss.name}** の通常攻撃！ **${target.name}** に ${res.dmg} ダメージ！`;
        }
        await this.proceedTurn(channel, session, log);
    },

    // 共通：ターン進行
    async proceedTurn(channel, session, actionLog) {
        await channel.send(actionLog);
        const fieldLogs = logic.processEndOfAction(session);
        if (fieldLogs.length > 0) await channel.send(fieldLogs.join('\n'));

        const users = db.getCollection("users");
        for (const p of session.participants) {
            await users.updateOne({ _id: p._id }, { $set: { mp: p.mp } });
        }

        session.currentIndex = (session.currentIndex + 1) % session.turnOrder.length;
        if (session.currentIndex === 0) session.turnCount++;
        await this.renderTurn(channel, session);
    },

    // 表示
    async renderTurn(channel, session) {
        const current = session.turnOrder[session.currentIndex];
        const table = session.turnOrder.map((e, i) => i === session.currentIndex ? `・**${e.name}** ◀️` : `・${e.name}`).join('\n');
        const embed = new EmbedBuilder()
            .setTitle(`🔄 ターン ${session.turnCount}`)
            .setDescription(`**【行動順】**\n${table}\n\n📢 **${current.name}** の番！`)
            .addFields({ name: "ボスHP", value: `${session.boss.hp}`, inline: true }, { name: "結晶", value: `${session.field.crystals}`, inline: true })
            .setColor(current.isPlayer ? 0x00AAFF : 0xFF0000);
        await channel.send({ embeds: [embed] });
        if (!current.isPlayer) setTimeout(() => this.bossAction(channel, session), 2000);
    }
};

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    const users = db.getCollection("users");

    // --- ステータスコマンド ---
    if (msg.content === 'p/ステータス') {
        const u = await users.findOne({ _id: msg.author.id });
        if (!u) return msg.reply("❌ `p/登録` を先にしてください。");
        const nextExp = logic.getNextLevelExp(u.lv || 1);
        const embed = new EmbedBuilder()
            .setTitle(`${u.name} のステータス`)
            .setColor(0x00FF00)
            .addFields(
                { name: "職業", value: `${u.job}`, inline: true },
                { name: "Lv", value: `${u.lv}`, inline: true },
                { name: "MP", value: `${u.mp || 0} / ${u.stats.max_mp || 40}`, inline: true },
                { name: "ATK", value: `${u.stats.atk}`, inline: true },
                { name: "DEF", value: `${u.stats.def}`, inline: true },
                { name: "EXP", value: `${u.exp}/${nextExp}`, inline: true }
            );
        return msg.reply({ embeds: [embed] });
    }

    if (msg.content === 'p/登録') {
        await botController.registerUser(msg, users);
    }

    if (msg.content === 'b/ボス出現') {
        const u = await users.findOne({ _id: msg.author.id });
        if (u) await botController.startBattle(msg, u, users);
    }

    const session = activeBattles.get(msg.channel.id);
    if (session && (msg.content === 'b/攻撃' || msg.content.startsWith('b/スキル'))) {
        const current = session.turnOrder[session.currentIndex];
        if (current.id === msg.author.id) {
            const type = msg.content === 'b/攻撃' ? "attack" : "skill";
            await botController.handleAction(msg, type, session);
        }
    }
});

// --- ポート開放エラー対策を含めた起動 ---
db.connect(process.env.MONGO_URL).then(() => {
    client.login(process.env.DISCORD_TOKEN).then(() => {
        console.log("✅ BOT起動成功");
    });
}).catch(console.error);
