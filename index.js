const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const db = require('./database');
const logic = require('./logic');
const bosses = require('./bosses');
const skills = require('./skills');
require('dotenv').config();

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const activeBattles = new Map();

module.exports = {
    /**
     * バトル進行管理
     */
    async handleAction(msg, type, user, session) {
        const uData = await db.getCollection("users").findOne({ _id: msg.author.id });
        let log = "";

        if (type === "attack") {
            const res = logic.calculateDamage(uData.stats, session.boss);
            session.boss.hp -= res.dmg;
            log = `💥 **${uData.name}** の攻撃！ **${res.dmg}** ダメージ！`;
        } 
        else if (type === "skill") {
            const skillName = msg.content.replace('b/スキル ', '').trim();
            const skill = skills[skillName];
            
            if (!skill || skill.job !== uData.job) return msg.reply("❌ 使えないスキルです。");
            if (uData.mp < skill.cost) return msg.reply("❌ MPが足りません！");

            // スキル種別ごとのロジック
            log = `🪄 **${uData.name}** の **${skillName}**！\n`;
            if (skill.type === "atk") {
                const res = logic.calculateDamage(uData.stats, session.boss);
                const d = Math.max(skill.minDmg, res.dmg);
                session.boss.hp -= d;
                log += `💥 ボスに **${d}** ダメージ！`;
            } else if (skill.type === "multi") {
                const hits = Math.floor(Math.random() * 3) + 1;
                let total = 0;
                for(let i=0; i<hits; i++) total += Math.max(skill.minDmg, uData.stats.atk - 5);
                session.boss.hp -= total;
                log += `⚔️ ${hits}回ヒット！ 合計 **${total}** ダメージ！`;
            } else {
                log += `✨ 効果：${skill.info}`;
            }

            // MP消費更新
            await db.getCollection("users").updateOne({ _id: uData._id }, { $inc: { mp: -skill.cost } });
        }

        // 決着判定
        if (session.boss.hp <= 0) {
            msg.channel.send(`${log}\n🎊 **${session.boss.name}** を撃破！`);
            activeBattles.delete(msg.channel.id);
        } else {
            this.proceedTurn(msg.channel, session, log);
        }
    },

    async proceedTurn(channel, session, log) {
        await channel.send(log);
        session.currentIndex = (session.currentIndex + 1) % session.turnOrder.length;
        if (session.currentIndex === 0) session.turnCount++;
        this.renderTurn(channel, session);
    },

    async renderTurn(channel, session) {
        const current = session.turnOrder[session.currentIndex];
        const table = session.turnOrder.map((e, i) => i === session.currentIndex ? `・**${e.name}** ◀️` : `・${e.name}`).join('\n');
        
        const embed = new EmbedBuilder()
            .setTitle(`🔄 ターン ${session.turnCount}`)
            .setDescription(`**【順序】**\n${table}\n\n📢 **${current.name}** の番です！`)
            .setColor(current.isPlayer ? 0x00AAFF : 0xFF0000);

        await channel.send({ embeds: [embed] });
        if (!current.isPlayer) setTimeout(() => this.bossTurn(channel, session), 2000);
    },

    async bossTurn(channel, session) {
        const targetId = logic.selectTarget(session.participants);
        const target = session.participants.find(p => p._id === targetId);
        const res = logic.calculateDamage(session.boss, target.stats);
        await this.proceedTurn(channel, session, `👹 **${session.boss.name}** の反撃！ **${target.name}** に ${res.dmg} ダメージ！`);
    }
};

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    const session = activeBattles.get(msg.channel.id);

    if (msg.content === 'b/ボス出現') {
        // ... (省略：前回の startBattle ロジックをここへ)
    }

    if (session && (msg.content === 'b/攻撃' || msg.content.startsWith('b/スキル'))) {
        const current = session.turnOrder[session.currentIndex];
        if (current.id !== msg.author.id) return msg.reply("⚠️ あなたのターンではありません！");
        const type = msg.content === 'b/攻撃' ? "attack" : "skill";
        module.exports.handleAction(msg, type, null, session);
    }
});

db.connect(process.env.MONGO_URL).then(() => client.login(process.env.DISCORD_TOKEN));
