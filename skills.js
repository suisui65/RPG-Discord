module.exports = {
    // 剣士
    "多段切り": { job: "剣士", cost: 3, cd: 3, type: "multi", minDmg: 5, info: "(ATK-5)x1~3回攻撃" },
    "エアカッター": { job: "剣士", cost: 2, cd: 2, type: "atk", minDmg: 10, info: "遠距離攻撃" },
    "深呼吸": { job: "剣士", cost: 3, cd: 3, type: "buff", buff: { spd: 3, hate: -5 }, info: "回避+3% ヘイト-5" },
    // タンク
    "ヘイト": { job: "タンク", cost: 3, cd: 3, type: "buff", buff: { hate: 10 }, info: "ヘイト+10" },
    "二重盾": { job: "タンク", cost: 3, cd: 3, type: "buff", buff: { def_rate: 1.05 }, info: "防御力+5%" },
    "ミラー": { job: "タンク", cost: 5, cd: 4, type: "special", info: "受けたダメージの8%を反射" },
    // 魔術師
    "火球": { job: "魔術師", cost: 2, cd: 2, type: "atk", minDmg: 15, info: "火属性攻撃" },
    "フラッシュ": { job: "魔術師", cost: 4, cd: 3, type: "debuff", stun: 0.25, info: "25%でスタン付与" },
    "防御ダウン": { job: "魔術師", cost: 5, cd: 3, type: "debuff", def_down: 0.95, info: "敵防御5%ダウン" },
    // 弓士
    "射貫く": { job: "弓士", cost: 3, cd: 2, type: "atk", ignore: 0.02, minDmg: 12, info: "防御-2%無視攻撃" },
    "連射": { job: "弓士", cost: 3, cd: 3, type: "multi", minDmg: 5, info: "1~3回攻撃" },
    "予測": { job: "弓士", cost: 3, cd: 3, type: "special", info: "次攻撃必中" },
    // 商人
    "商談": { job: "商人", cost: 3, cd: 3, type: "special", info: "所持品を売る(50-120%)" },
    "買取": { job: "商人", cost: 3, cd: 3, type: "special", info: "敵のアイテムを奪う" }
};
