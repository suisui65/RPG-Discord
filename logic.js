module.exports = {
    // ダメージ計算（攻撃力、防御力、運）
    calculateDamage: (atk, def, luk) => {
        const baseDamage = Math.max(1, atk - (def / 2));
        const isCritical = Math.random() < (luk / 100);
        const dmg = Math.floor(isCritical ? baseDamage * 1.5 : baseDamage);
        return { dmg, isCritical };
    },

    // 視覚的なHPバー生成
    createHpBar: (current, max) => {
        const size = 10;
        const progress = Math.round((current / max) * size);
        return '`' + '■'.repeat(Math.max(0, progress)) + '□'.repeat(Math.max(0, size - progress)) + '`';
    },

    // レベルアップ判定（100 EXPで昇格）
    checkLevelUp: (exp) => {
        if (exp >= 100) {
            return { leveledUp: true, nextExp: exp - 100 };
        }
        return { leveledUp: false, nextExp: exp };
    }
};
