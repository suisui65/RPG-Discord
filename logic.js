module.exports = {
    // HPバーの生成
    createHpBar: (current, max) => {
        const length = 10;
        const filled = Math.max(0, Math.min(length, Math.round((current / max) * length)));
        return "🟥".repeat(filled) + "⬛".repeat(length - filled);
    },

    // ダメージ計算
    calculateDamage: (atk, def, luk, multiplier = 1.0) => {
        let damage = Math.max(atk * 0.1, (atk * multiplier) - def);
        let isCrit = Math.random() < Math.min(0.20, luk / 100);
        if (isCrit) damage *= 1.5;
        return { dmg: Math.floor(damage), isCrit };
    },

    // 🆕 状態異常の表示用
    getStatusDisplay: (statusList) => {
        if (!statusList || statusList.length === 0) return ""; // 何もないときは空白
        // [ 毒 ] [ スタン ] のように並べる
        return statusList.map(s => `［ ${s} ］`).join(" ");
    }
};
