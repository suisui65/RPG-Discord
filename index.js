const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const db = require('./database');
const logic = require('./logic');
const bosses = require('./bosses');
const skills = require('./skills');
const bossSkills = require('./boss_skills');
const jobs = require('./jobs');
require('dotenv').config();

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const activeBattles = new Map();

const botController = {
    // バトル開始
    async startBattle(msg, user, users) {
        if (activeBattles.has(msg.channel.id)) return msg.reply("⚠️ ボスはすでに戦場にいます！");

        const nextRank = (user.rank_cleared || 0) + 1;
        const bData = bosses[String(nextRank)] || bosses["1"];
        const mult = logic.calculateBossMultiplier(nextRank);

        // 参加者のステータスを初期化
        const members = [user]; // 連合システムがある場合はここを拡張
        const entities = logic.getTurnOrder(members, bData);

        const session = {
            boss: { 
                ...bData, 
                hp: Math.floor(bData.hp * mult), 
                max_hp: Math.floor(bData.hp * mult), 
                mp: 0 
            },
            participants: members.map(m => ({ 
                _id: m._id, 
                name: m.name, 
                job: m.job,
                hp: m.stats.hp, 
                max_hp: m.stats.hp,
                mp: m.mp || 40, 
                max_mp: m.stats.max_mp || 40,
                stats: m.stats 
            })),
            turnOrder: entities,
            currentIndex: 0,
            turnCount: 1,
            field: { crystals: 0, traps: [] }
        };

        activeBattles.set(msg.channel.id, session);
        await this.renderTurn(msg.channel, session);
    },

    // ターン状況の描画（ご要望の形式を再現）
    async renderTurn(channel, session) {
        const current = session.turnOrder[session.currentIndex];
        
        // 【ターン】部分のテキスト生成
        const turnList = session.turnOrder.map((e, i) => {
            const isCurrent = i === session.currentIndex;
            const arrow = isCurrent ? " ◀️" : "";
            
            if (e.isPlayer) {
                const p = session.participants.find(part => part._id === e.id);
                return `・**${e.name}**${arrow}\n  ：HP${p.hp} MP${p.mp}`;
            } else {
                return `・**${e.name}**${arrow}\n  ：HP${session.boss.hp}`;
            }
        }).join('\n');

        const mainEmbed = new EmbedBuilder()
            .setTitle(`🔄 ターン ${session.turnCount}`)
            .setDescription(`┅┅┅\n【ターン】\n${turnList}\n\n📣 **${current.name}** のターンです\n┅┅┅`)
            .setColor(current.isPlayer ? 0x00AAFF : 0xFF0000);

        // 操作ガイド（スキル名もここに表示）
        const currentP = session.participants.find(p => p._id === current.id);
        let guideText = "┅┅┅\n`b/攻撃` `b/スキル [名]`\n`b/アイテム` `b/逃げる` \n┅┅┅";
        
        if (current.isPlayer) {
            const mySkills = Object.keys(skills).filter(k => skills[k].job === currentP.job);
            guideText += `\n**【使えるスキル】**\n${mySkills.join(', ')}`;
        }

        const guideEmbed = new EmbedBuilder()
            .setDescription(guideText)
            .setColor(0xCCCCCC);

        await channel.send({ embeds: [mainEmbed, guideEmbed] });

        // ボスのターンの場合は自動行動
        if (!current.isPlayer) {
            setTimeout(() => this.bossAction(channel, session), 2000);
        }
    },

    // 行動処理（攻撃/スキル）
    async handleAction(msg, type, session) {
        const users = db.getCollection("users");
        const uData = await users.findOne({ _id: msg.author.id });
        const pInSession = session.participants.find(p => p._id === msg.author.id);
        let log = "";

        if (type === "attack") {
            const res = logic.calculateDamage(uData.stats, session.boss);
            session.boss.hp -= res.dmg;
            log = `⚔️ **${uData.name}** の攻撃！ **${res.dmg}** ダメージ！`;
        } else if (type === "skill") {
            const skillName = msg.content.replace('b/スキル ', '').trim();
            const skill = skills[skillName];
            
            if (!skill || skill.job !== uData.job) return msg.reply("❌ そのスキルは使えません。");
            if (pInSession.mp < skill.cost) return msg.reply("❌ MPが足りません！");

            const res = logic.calculateDamage(uData.stats, session.boss);
            const d = Math.max(skill.minDmg || 0, res.dmg);
            session.boss.hp -= d;
            pInSession.mp -= skill.cost;
            log = `🪄 **${uData.name}** の **${skillName}**！ **${d}** ダメージ！`;
            
            // DBのMPも更新
            await users.updateOne({ _id: uData._id }, { $set: { mp: pInSession.mp } });
        } else if (type === "escape") {
            msg.channel.send("🏃💨 命からがら逃げ出した！");
            return activeBattles.delete(msg.channel.id);
        }

        if (session.boss.hp <= 0) {
            msg.channel.send(`${log}\n🎊 **${session.boss.name}** を撃破しました！`);
            activeBattles.delete(msg.channel.id);
        } else {
            await this.proceedTurn(msg.channel, session, log);
        }
    },

    // ターン進行
    async proceedTurn(channel, session, actionLog) {
        await channel.send(actionLog);
        
        // MP回復などの全体処理
        const fieldLogs = logic.processEndOfAction(session);
        if (fieldLogs.length > 0) await channel.send(fieldLogs.join('\n'));

        session.currentIndex = (session.currentIndex + 1) % session.turnOrder.length;
        if (session.currentIndex === 0) session.turnCount++;

        await this.renderTurn(channel, session);
    },

    // ボス行動
    async bossAction(channel, session) {
        const targetId = logic.selectTarget(session.participants);
        const target = session.participants.find(p => p._id === targetId);
        const res = logic.calculateDamage(session.boss, target.stats);
        
        target.hp -= res.dmg;
        let log = `👹 **${session.boss.name}** の攻撃！ **${target.name}** に ${res.dmg} ダメージ！`;
        
        await this.proceedTurn(channel, session, log);
    }
};

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    const users = db.getCollection("users");

    if (msg.content === 'p/登録') {
        const jobNames = Object.keys(jobs);
        const randomJob = jobNames[Math.floor(Math.random() * jobNames.length)];
        const jobData = jobs[randomJob];
        const newUser = {
            _id: msg.author.id,
            name: msg.author.username,
            job: randomJob,
            lv: 1, stats: { ...jobData },
            mp: jobData.mp, rank_cleared: 0
        };
        await users.updateOne({ _id: msg.author.id }, { $set: newUser }, { upsert: true });
        msg.reply(`✅ **${randomJob}** として登録しました！`);
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
            if (msg.content === 'b/逃げる') await botController.handleAction(msg, "escape", session);
        }
    }
});

db.connect(process.env.MONGO_URL).then(() => client.login(process.env.DISCORD_TOKEN));
