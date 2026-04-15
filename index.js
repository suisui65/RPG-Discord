const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const db = require('./database');
const logic = require('./logic');
const jobs = require('./jobs');
const bosses = require('./bosses');
const skills = require('./skills');
require('dotenv').config();

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const activeBattles = new Map();
const allianceGroups = new Map();

const bot = {
    /**
     * バトル開始処理
     */
    async startBattle(msg, user, users) {
        if (activeBattles.has(msg.channel.id)) return msg.reply("⚠️ ボスはすでに戦場にいます！");

        const nextRank = (user.rank_cleared || 0) + 1;
        const bData = bosses[String(nextRank)] || bosses["1"];
        const mult = logic.calculateBossMultiplier(nextRank);

        // 連合・参加者の取得
        const myAlliance = allianceGroups.get(user.party) || (user.party ? [user.party] : null);
        const members = myAlliance ? await users.find({ party: { $in: myAlliance } }).toArray() : [user];
        
        // ターンテーブル生成
        const entities = logic.getTurnOrder(members, bData);

        const session = {
            boss: { ...bData, hp: Math.floor(bData.hp * mult), max_hp: Math.floor(bData.hp * mult) },
            participants: members.map(m => ({ ...m, damageDealt: 0 })),
            turnOrder: entities,
            currentIndex: 0,
            turnCount: 1
        };

        activeBattles.set(msg.channel.id, session);

        // DM送信
        for (const m of members) {
            try {
                const u = await client.users.fetch(m._id);
                const skillText = Object.keys(skills)
                    .filter(k => skills[k].job === m.job)
                    .map(k => `・${k}: ${skills[k].info} (Cost:${skills[k].cost})`)
                    .join('\n');
                await u.send(`⚔️ **${bData.name}** 戦開始！\n【スキル一覧】\n${skillText}\n\`b/攻撃\`, \`b/スキル [名]\``);
            } catch (e) { console.log("DM送信失敗"); }
        }

        await this.sendTurnStatus(msg.channel, session);
    },

    /**
     * ターン状態表示
     */
    async sendTurnStatus(channel, session) {
        const current = session.turnOrder[session.currentIndex];
        const table = session.turnOrder.map((e, i) => i === session.currentIndex ? `・**${e.name}** ◀️` : `・${e.name}`).join('\n');
        
        const embed = new EmbedBuilder()
            .setTitle(`🔄 ターン ${session.turnCount}`)
            .setDescription(`**【行動順】**\n${table}\n\n📢 **${current.name}** の番です！`)
            .setColor(current.isPlayer ? 0x00AAFF : 0xFF0000);

        await channel.send({ embeds: [embed] });
        if (!current.isPlayer) setTimeout(() => this.bossAction(channel, session), 2000);
    },

    /**
     * ターン進行
     */
    async nextTurn(channel, session, log) {
        await channel.send(log);
        session.currentIndex = (session.currentIndex + 1) % session.turnOrder.length;
        if (session.currentIndex === 0) session.turnCount++;
        await this.sendTurnStatus(channel, session);
    },

    /**
     * ボスのAI行動
     */
    async bossAction(channel, session) {
        const targetId = logic.selectTarget(session.participants);
        const target = session.participants.find(p => p._id === targetId);
        const res = logic.calculateDamage(session.boss, target.stats);
        
        let log = `👹 **${session.boss.name}** の攻撃！ **${target.name}** に ${res.dmg} ダメージ！`;
        await this.nextTurn(channel, session, log);
    }
};

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    const users = db.getCollection("users");

    if (msg.content === 'b/ボス出現') {
        const u = await users.findOne({ _id: msg.author.id });
        if (!u) return msg.reply("登録してね。");
        await bot.startBattle(msg, u, users);
    }

    if (msg.content.startsWith('b/攻撃') || msg.content.startsWith('b/スキル')) {
        const session = activeBattles.get(msg.channel.id);
        if (!session) return;
        const current = session.turnOrder[session.currentIndex];
        if (current.id !== msg.author.id) return msg.reply(`⚠️ **${current.name}** のターンです！`);

        const u = await users.findOne({ _id: msg.author.id });
        let log = "";

        if (msg.content === 'b/攻撃') {
            const res = logic.calculateDamage(u.stats, session.boss);
            session.boss.hp -= res.dmg;
            log = `💥 **${u.name}** の攻撃！ **${res.dmg}** ダメージ！`;
        } else {
            const skillName = msg.content.replace('b/スキル ', '').trim();
            const skill = skills[skillName];
            if (!skill || skill.job !== u.job) return msg.reply("そのスキルは使えません。");
            
            const res = logic.calculateDamage(u.stats, session.boss);
            const finalDmg = Math.floor(res.dmg * (skill.power || 1.2)); // 簡易
            session.boss.hp -= finalDmg;
            log = `🪄 **${u.name}** の **${skillName}**！ **${finalDmg}** ダメージ！`;
        }

        if (session.boss.hp <= 0) {
            msg.channel.send(`${log}\n🎊 撃破！`);
            activeBattles.delete(msg.channel.id);
        } else {
            await bot.nextTurn(msg.channel, session, log);
        }
    }
});

db.connect(process.env.MONGO_URL).then(() => client.login(process.env.DISCORD_TOKEN));
