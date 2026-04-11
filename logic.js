module.exports = {
    calculateDamage: (attacker, receiver, isSkill = false) => {
        const minGuarantee = isSkill ? 10 : 5;
        let dmg = Math.max(minGuarantee, attacker.atk - (receiver.def * 0.5));
        
        // クリティカル判定 (最大20%)
        const critRate = Math.min(0.20, attacker.luk / 100);
        const isCrit = Math.random() < critRate;
        if (isCrit) dmg *= 1.5;

        // 回避判定 (最大35%)
        const dodgeRate = Math.min(0.35, (receiver.spd * 0.02));
        const isDodge = Math.random() < dodgeRate;

        // 根性判定 (最大10%)
        const gutsRate = Math.min(0.10, receiver.luk / 100);
        let survived = false;
        if (!isDodge && dmg >= receiver.hp && Math.random() < gutsRate) {
            dmg = receiver.hp - 1;
            survived = true;
        }

        return { dmg: isDodge ? 0 : Math.floor(dmg), isCrit, isDodge, survived };
    },
    createHpBar: (current, max) => {
        const size = 10;
        const progress = Math.round((current / max) * size);
        return '`' + '■'.repeat(Math.max(0, progress)) + '□'.repeat(Math.max(0, size - progress)) + '`';
    }
};
