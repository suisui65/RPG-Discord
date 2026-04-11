/**
 * ==========================================
 * 【初心者向け編集ガイド：役職(Job)の追加・調整】
 * ==========================================
 * * 1. 【追加する方法】
 * 最後の役職の「},」のあとに、新しい役職のカタマリを貼り付けてください。
 * * 2. 【数字の意味】
 * - hp / atk / def / spd / luk: 基本ステータス。
 * - weaponRank: 解放できるスキルの「格」に関わります。
 * - hate_init: バトル開始時の狙われやすさ。
 * - hate_factor: 攻撃などの行動をした時に増えるヘイトの倍率。
 * - mp_regen: 自分のターンが回ってきた時のMP回復量。
 * * 3. 【注意点】
 * - 各項目の後ろにあるカンマ「,」や、カッコ「{ }」を消さないように注意してください。
 */

module.exports = {
    "剣士": {
        hp: 120, 
        atk: 25, 
        def: 15, 
        spd: 12, 
        luk: 10,
        weaponType: "剣", 
        weaponRank: "見習い",
        hate_init: 15,    // 中くらいの狙われやすさ
        hate_factor: 1.2, // 少し目立ちやすい
        mp_regen: 5,      // 通常のMP回復
        imageUrl: "https://i.imgur.com/8Xb3A5O.png"
    },

    "弓士": {
        hp: 80, 
        atk: 18, 
        def: 8, 
        spd: 15, 
        luk: 10,
        weaponType: "弓", 
        weaponRank: "見習い",
        hate_init: 10,    // 狙われにくい
        hate_factor: 1.0, // 標準的なヘイト上昇
        mp_regen: 5,
        imageUrl: "https://i.imgur.com/Yw4zG8M.png"
    },

    "魔術師": {
        hp: 70, 
        atk: 40, 
        def: 5, 
        spd: 10, 
        luk: 15,
        weaponType: "杖", 
        weaponRank: "見習い",
        hate_init: 10,    // 狙われにくい
        hate_factor: 1.0, 
        mp_regen: 10,     // MP回復量が多い！
        imageUrl: "https://i.imgur.com/vH4V0fN.png"
    },

    "タンク": {
        hp: 180, 
        atk: 10, 
        def: 25, 
        spd: 5, 
        luk: 5,
        weaponType: "盾", 
        weaponRank: "見習い",
        hate_init: 30,    // 最初から敵に狙われる
        hate_factor: 1.5, // 行動するとさらに狙われる
        mp_regen: 5,
        imageUrl: "https://i.imgur.com/UfXb4zR.png"
    },

    "商人": {
        hp: 90, 
        atk: 12, 
        def: 10, 
        spd: 10, 
        luk: 20,          // 運が高い
        weaponType: "カバン", 
        weaponRank: "見習い",
        hate_init: 10, 
        hate_factor: 1.1, 
        mp_regen: 5,
        imageUrl: "https://i.imgur.com/wF9YkM0.png"
    }
};
