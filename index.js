const { Client, GatewayIntentBits, EmbedBuilder, Partials } = require('discord.js');
const { MongoClient } = require('mongodb');
require('dotenv').config();

// --- 1. ボットの初期設定 ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel]
});

// --- 2. データベース(MongoDB)の準備 ---
const mongoClient = new MongoClient(process.env.MONGO_URL);
let db;

async function connectDB() {
    await mongoClient.connect();
    db = mongoClient.db("rpg_game");
    console.log("MongoDBに接続成功！");
}

// --- 3. ゲームデータ (ここを書き換えればステータス調整可能) ---
const JOBS = {
    "剣士": { hp: 40, atk: 40, def: 30, spd: 10, luk: 10, mp: 20, mp_regen: 5 },
    "弓士": { hp: 30, atk: 50, def: 30, spd: 15, luk: 15, mp: 20, mp_regen: 5 },
    "魔術師": { hp: 25, atk: 60, def: 25, spd: 8, luk: 12, mp: 20, mp_regen: 10 },
    "タンク": { hp: 50, atk: 20, def: 40, spd: 5, luk: 10, mp: 20, mp_regen: 5 }
};

// HPバーを作る関数
function createHpBar(current, max) {
    const length = 10;
    const filled = Math.max(0, Math.min(length, Math.round((current / max) * length)));
    return "🟥".repeat(filled) + "⬛".repeat(length - filled);
}

// --- 4. コマンド処理 ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // --- 【登録機能】 p/登録 [役職名] ---
    if (message.content.startsWith('p/登録')) {
        const args = message.content.split(' ');
        const jobName = args[1];

        if (!JOBS[jobName]) {
            return message.reply(`役職が正しくありません。 [ ${Object.keys(JOBS).join(', ')} ] から選んでください。`);
        }

        const userData = {
            _id: message.author.id,
            name: message.author.username,
            job: jobName,
            level: 1,
            stats: { ...JOBS[jobName] },
            current_hp: JOBS[jobName].hp,
            current_mp: JOBS[jobName].mp
        };

        await db.collection("users").updateOne({ _id: message.author.id }, { $set: userData }, { upsert: true });
        
        const embed = new EmbedBuilder()
            .setTitle("✨ 登録完了")
            .setDescription(`${message.author.username}さんは **${jobName}** として冒険を開始しました！`)
            .setColor(0x00FF00);
        
        message.reply({ embeds: [embed] });
    }

    // --- 【ステータス表示】 p/ステータス ---
    if (message.content === 'p/ステータス') {
        const user = await db.collection("users").findOne({ _id: message.author.id });
        if (!user) return message.reply("まずは `p/登録 [役職]` でキャラを作ってください。");

        const embed = new EmbedBuilder()
            .setTitle(`${user.name} のステータス`)
            .addFields(
                { name: "職業", value: user.job, inline: true },
                { name: "HP", value: `${user.current_hp} / ${user.stats.hp}`, inline: true },
                { name: "MP", value: `${user.current_mp} / ${user.stats.mp}`, inline: true },
                { name: "攻撃 / 防御", value: `${user.stats.atk} / ${user.stats.def}`, inline: true }
            )
            .setColor(0x00AAFF);
        
        message.reply({ embeds: [embed] });
    }

    // --- 【バトル開始】 b/ボス出現 ---
    if (message.content === 'b/ボス出現') {
        // ここに以前作成した イデア・ジェネシスのデータをセットする
        const bossData = {
            channelId: message.channel.id,
            name: "イデア・ジェネシス",
            hp: 1200,
            max_hp: 1200,
            atk: 10,
            def: 20,
            spd: 30,
            luk: 20,
            crystals: 0,
            image: "https://cdn.discordapp.com/attachments/1491215421146140823/1491215491669168168/1775603874321.jpg"
        };

        await db.collection("battles").updateOne({ channelId: message.channel.id }, { $set: bossData }, { upsert: true });

        const embed = new EmbedBuilder()
            .setTitle(`⚠ 強襲: ${bossData.name}`)
            .setImage(bossData.image)
            .setDescription(`HP: ${bossData.hp} / ${bossData.max_hp}\n${createHpBar(bossData.hp, bossData.max_hp)}`)
            .setColor(0xFF0000);

        message.reply({ embeds: [embed] });
    }
});

// ボット起動
connectDB().then(() => {
    client.login(process.env.DISCORD_TOKEN);
});

