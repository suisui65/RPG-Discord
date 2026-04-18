const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const http = require('http'); 
const db = require('./database');
const logic = require('./logic');
const bosses = require('./bosses');
const skills = require('./skills');
const bossSkills = require('./boss_skills');
const jobs = require('./jobs');
require('dotenv').config();

// Render用ポートバインド
const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write("BOT IS ALIVE");
    res.end();
}).listen(PORT, '0.0.0.0');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const activeBattles = new Map();

const botController = {
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
        return msg.reply(`✅ **${randomJob}** として登録完了しました！`);
    },

    async renderTurn(channel, session) {
        const current = session.turnOrder[session.currentIndex];
        const turnList = session.turnOrder.map((e, i) => {
            const isCurrent = i === session.currentIndex;
            const arrow = isCurrent ? " ◀️" : "";
            if (e.isPlayer) {
                const p = session.participants.find(part => part._id === e.id);
                const status = p.hp <= 0 ? "💀 戦闘不能" : `HP${p.hp} MP${p.mp}`;
                return `・${e.name}${arrow}\n：${status}`;
            } else {
                return `・${e.name}${arrow}\n：HP${session.boss.hp}`;
            }
        }).join('\n');

        const mainEmbed = new EmbedBuilder()
            .setDescription(`┅┅┅\n【ターン】\n${turnList}\n\n📣 **${current.name}のターンです**\n┅┅┅`)
            .setColor(current.isPlayer ? 0x00AAFF : 0xFF0000);

        let commandText = "┅┅┅\n`b/攻撃` `b/スキル スキル名` `b/逃げる` \n┅┅┅";
        if (current.isPlayer) {
            const pData = session.participants.find(p => p._id === current.id);
            if (pData.hp <= 0) {
                commandText = "💀 戦闘不能です。";
            } else {
                const mySkills = Object.keys(skills).filter(k => skills[k].job === pData.job);
                const skillListText = mySkills.map(sName => {
                    const s = skills[sName];
                    const cdRemaining = pData.cooldowns[sName] || 0;
                    const cdText = cdRemaining > 0 ? `⌛${cdRemaining}T` : `OK`;
                    return `**${sName}** [${cdText}] MP:${s.cost}\n└ ${s.info}`;
                }).join('\n');
                commandText += `\n**【スキル名 COOL MP】**\n${skillListText}`;
            }
        }
        const commandEmbed = new EmbedBuilder().setDescription(commandText).setColor(0x333333);
        await channel.send({ embeds: [mainEmbed, commandEmbed] });

        if (!current.isPlayer) {
            setTimeout(() => this.bossAction(channel, session), 2000);
        } else {
            const pData = session.participants.find(p => p._id === current.id);
            if (pData.hp <= 0) setTimeout(() => this.proceedTurn(channel, session, `⌛ **${pData.name}** スキップ`), 1500);
        }
    },

    async startBattle(msg, user, users) {
        if (activeBattles.has(msg.channel.id)) return msg.reply("⚠️ 戦闘中です");
        const nextRank = (user.rank_cleared || 0) + 1;
        const bData = bosses[String(nextRank)] || bosses["1"];
        const mult = logic.calculateBossMultiplier(nextRank);
        const members = [user]; 
        const entities = logic.getTurnOrder(members, bData);
        const session = {
            boss: { ...bData, hp: Math.floor(bData.hp * mult), max_hp: Math.floor(bData.hp * mult), mp: 0 },
            participants: members.map(m => ({ _id: m._id, name: m.name, job: m.job, hp: m.stats.hp, mp: m.mp || 40, stats: m.stats, cooldowns: {} })),
            turnOrder: entities, currentIndex: 0, turnCount: 1, field: { crystals: 0, traps: [] }
        };
        activeBattles.set(msg.channel.id, session);
        await this.renderTurn(msg.channel, session);
    },

    async handleAction(msg, type, session) {
        const pInSession = session.participants.find(p => p._id === msg.author.id);
        if (pInSession.hp <= 0) return msg.reply("❌ 戦闘不能です。");

        let log = "";
        if (type === "attack") {
            const res = logic.calculateDamage(pInSession.stats, session.boss);
            session.boss.hp -= res.dmg;
            log = `⚔️ **${pInSession.name}** の攻撃！ **${res.dmg}** ダメージ！`;
        } else if (type === "skill") {
            const skillName = msg.content.replace('b/スキル ', '').trim();
            const skill = skills[skillName];
            if (!skill || skill.job !== pInSession.job) return msg.reply("❌ 使用不可");
            if (pInSession.mp < skill.cost) return msg.reply("❌ MP不足");
            if ((pInSession.cooldowns[skillName] || 0) > 0) return msg.reply("⌛ CD中");
            const res = logic.calculateDamage(pInSession.stats, session.boss);
            const d = Math.max(skill.minDmg || 0, res.dmg);
            session.boss.hp -= d; pInSession.mp -= skill.cost;
            pInSession.cooldowns[skillName] = skill.cd || 3;
            log = `🪄 **${pInSession.name}** の **${skillName}**！ **${d}** ダメージ！`;
        }

        if (session.boss.hp <= 0) {
            msg.channel.send(`${log}\n🎊 **討伐成功！**`);
            return activeBattles.delete(msg.channel.id);
        }

        // --- 【新規】ボスの反撃判定 (30%の確率) ---
        let counterLog = "";
        if (Math.random() < 0.3) {
            const res = logic.calculateDamage(session.boss, pInSession.stats);
            pInSession.hp = Math.max(0, pInSession.hp - res.dmg);
            counterLog = `\n⚠️ **ボスの反撃！** **${pInSession.name}** に ${res.dmg} ダメージ！`;
            if (pInSession.hp <= 0) counterLog += `\n💀 **${pInSession.name}** が力尽きた！`;
        }

        await this.proceedTurn(msg.channel, session, log + counterLog);
    },

    async proceedTurn(channel, session, actionLog) {
        await channel.send(actionLog);

        const alivePlayers = session.participants.filter(p => p.hp > 0);
        if (alivePlayers.length === 0) {
            await channel.send("💀 全員が戦闘不能になりました。討伐失敗です。");
            return activeBattles.delete(channel.id);
        }

        const currentEntity = session.turnOrder[session.currentIndex];
        if (currentEntity.isPlayer) {
            const p = session.participants.find(part => part._id === currentEntity.id);
            for (let s in p.cooldowns) if (p.cooldowns[s] > 0) p.cooldowns[s]--;
        }
        
        session.currentIndex = (session.currentIndex + 1) % session.turnOrder.length;
        if (session.currentIndex === 0) session.turnCount++;
        await this.renderTurn(channel, session);
    },

    async bossAction(channel, session) {
        const alivePlayers = session.participants.filter(p => p.hp > 0);
        if (alivePlayers.length === 0) return;

        // ボス本人のターン（確定攻撃）
        const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        const res = logic.calculateDamage(session.boss, target.stats);
        target.hp = Math.max(0, target.hp - res.dmg);
        let log = `👹 **${session.boss.name}** の確定攻撃！ **${target.name}** に ${res.dmg} ダメージ！`;
        if (target.hp <= 0) log += `\n💀 **${target.name}** が力尽きた！`;

        await this.proceedTurn(channel, session, log);
    }
};

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    const users = db.getCollection("users");

    if (msg.content === 'p/登録') return await botController.registerUser(msg, users);
    if (msg.content === 'p/ステータス') {
        const u = await users.findOne({ _id: msg.author.id });
        if (!u) return msg.reply("❌ 要登録");
        const embed = new EmbedBuilder().setTitle("📜").setDescription(`<@${u._id}> ${u.job}`);
        return msg.reply({ embeds: [embed] });
    }
    if (msg.content === 'b/ボス出現') {
        const u = await users.findOne({ _id: msg.author.id });
        if (u) await botController.startBattle(msg, u, users);
    }

    const session = activeBattles.get(msg.channel.id);
    if (session) {
        const current = session.turnOrder[session.currentIndex];
        if (current.id === msg.author.id) {
            if (msg.content === 'b/攻撃') await botController.handleAction(msg, "attack", session);
            if (msg.content.startsWith('b/スキル')) await botController.handleAction(msg, "skill", session);
        }
    }
});

db.connect(process.env.MONGO_URL).then(() => client.login(process.env.DISCORD_TOKEN));
    }
});
