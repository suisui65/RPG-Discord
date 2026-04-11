/**
 * 【編集ガイド】
 * hate_init: バトル開始時の狙われやすさ
 * hate_factor: 行動した時のヘイト上昇倍率 (1.5なら通常の1.5倍狙われやすくなる)
 * mp_regen: 自分のターンが回ってきた時のMP回復量
 */
module.exports = {
    "剣士": {
        hp: 120, atk: 25, def: 15, spd: 12, luk: 10,
        pos: "前衛", weaponType: "剣",
        hate_init: 15, hate_factor: 1.2, mp_regen: 5,
        imageUrl: "https://i.imgur.com/8Xb3A5O.png"
    },
    "弓士": {
        hp: 80, atk: 18, def: 8, spd: 15, luk: 10,
        pos: "後衛", weaponType: "弓",
        hate_init: 10, hate_factor: 1.0, mp_regen: 5,
        imageUrl: "https://i.imgur.com/Yw4zG8M.png"
    },
    "魔術師": {
        hp: 70, atk: 40, def: 5, spd: 10, luk: 15,
        pos: "中衛", weaponType: "杖",
        hate_init: 10, hate_factor: 1.0, mp_regen: 10, // 魔術師はMP回復が多い
        imageUrl: "https://i.imgur.com/vH4V0fN.png"
    },
    "タンク": {
        hp: 180, atk: 10, def: 25, spd: 5, luk: 5,
        pos: "前衛", weaponType: "盾",
        hate_init: 30, hate_factor: 1.5, mp_regen: 5,
        imageUrl: "https://i.imgur.com/UfXb4zR.png"
    },
    "商人": {
        hp: 90, atk: 12, def: 10, spd: 10, luk: 20,
        pos: "中衛", weaponType: "カバン",
        hate_init: 10, hate_factor: 1.1, mp_regen: 5,
        imageUrl: "https://i.imgur.com/wF9YkM0.png"
    }
};
