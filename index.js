const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const dbManager = require('./database');
const logic = require('./logic');
const jobs = require('./jobs');
const skills = require('./skills');
const bosses = require('./bosses');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// バトルセッション管理用
let activeBattles = new Map();

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    const users = dbManager.getCollection("users");

    // --- 強化コマンド ---
    if (msg.content.startsWith('p/強化')) {
        const stat = msg.content.split(' ')[1];
        const u = await users.findOne({ _id: msg.author.id });
        if (!u || u.sp < 1) return msg.reply("SPが足りません。");
        
        // ステータス上限100 (装備分は別途計算)
        if (u.stats[stat] >= 100 && stat !== 'hp') return msg.reply("その値はポイントではこれ以上上げられません。");

        let update = { $inc: { sp: -1 } };
        update.$inc[`stats.${stat}`] = (stat === 'hp') ? 10 : 1;
        await users.updateOne({ _id: msg.author.id }, update);
        msg.reply(`${stat} を強化しました！`);
    }

    // --- スキルセット ---
    if (msg.content.startsWith('p/スキルセット')) {
        const [_, name, slot] = msg.content.split(' ');
        const slotIdx = parseInt(slot) - 1;
        const u = await users.findOne({ _id: msg.author.id });
        if (!u.unlocked_skills.includes(name)) return msg.reply("未開放のスキルです。");
        
        let newSlots = [...u.skill_slots];
        newSlots[slotIdx] = name;
        await users.updateOne({ _id: msg.author.id }, { $set: { skill_slots: newSlots } });
        msg.reply(`スロット${slot}に ${name} をセットしました。`);
    }

    // --- バトル進行 (簡易版) ---
    if (msg.content === 'b/攻撃') {
        const channelId = msg.channel.id;
        let session = activeBattles.get(channelId);
        if (!session) return;

        // 1. プレイヤーの攻撃
        const u = await users.findOne({ _id: msg.author.id });
        const res = logic.calculateDamage(u.stats, session.boss);
        session.boss.hp -= res.dmg;
        msg.reply(`💥 ${res.dmg}ダメージ！ (Boss HP: ${session.boss.hp})`);

        // 2. ボスの反撃 (30%)
        if (Math.random() < 0.3) {
            const targetId = logic.selectTarget(session.participants);
            const bRes = logic.calculateDamage(session.boss, (await users.findOne({_id: targetId})).stats);
            // ここでプレイヤーHP減少処理...
            msg.channel.send(`⚠️ **ボスの反撃！** <@${targetId}> は ${bRes.dmg} ダメージを受けた！`);
        }

        // 3. 撃破判定
        if (session.boss.hp <= 0) {
            const rewards = logic.distributeRewards(100, 500, session.boss.rank, session.participants);
            for (const r of rewards) {
                // 自動振り込み & ペナルティリセット
                await users.updateOne({_id: r.id}, { $inc: { exp: r.exp, money: r.money }, $set: { escape_stack: 0 } });
            }
            msg.channel.send("🎊 ボスを撃破！報酬が各プレイヤーに振り込まれました。");
            activeBattles.delete(channelId);
        }
    }
});

dbManager.connect(process.env.MONGO_URL).then(() => client.login(process.env.DISCORD_TOKEN));
