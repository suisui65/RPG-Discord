/**
 * 【初心者ガイド：役職の調整】
 * spd, luk は全職 10 固定でスタート。
 * ポイント(SP)を振り分けることで最大 100 まで成長します。
 */
module.exports = {
    "剣士": {
        hp: 120, atk: 25, def: 15, spd: 10, luk: 10,
        weaponType: "剣", weaponRank: "見習い",
        hate_init: 15, hate_factor: 1.2, mp_regen: 5,
        imageUrl: "https://i.imgur.com/8Xb3A5O.png"
    },
    "弓士": {
        hp: 80, atk: 18, def: 8, spd: 10, luk: 10,
        weaponType: "弓", weaponRank: "見習い",
        hate_init: 10, hate_factor: 1.0, mp_regen: 5,
        imageUrl: "https://i.imgur.com/Yw4zG8M.png"
    },
    "魔術師": {
        hp: 70, atk: 40, def: 5, spd: 10, luk: 10,
        weaponType: "杖", weaponRank: "見習い",
        hate_init: 10, hate_factor: 1.0, mp_regen: 10,
        imageUrl: "https://i.imgur.com/vH4V0fN.png"
    },
    "タンク": {
        hp: 180, atk: 10, def: 25, spd: 10, luk: 10,
        weaponType: "盾", weaponRank: "見習い",
        hate_init: 30, hate_factor: 1.5, mp_regen: 5,
        imageUrl: "https://i.imgur.com/UfXb4zR.png"
    },
    "商人": {
        hp: 90, atk: 12, def: 10, spd: 10, luk: 10,
        weaponType: "カバン", weaponRank: "見習い",
        hate_init: 10, hate_factor: 1.1, mp_regen: 5,
        imageUrl: "https://i.imgur.com/wF9YkM0.png"
    }
};
