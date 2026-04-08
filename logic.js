module.exports = {
    createHpBar: (current, max) => {
        const length = 10;
        const filled = Math.max(0, Math.min(length, Math.round((current / max) * length)));
        return "🟥".repeat(filled) + "⬛".repeat(length - filled);
    },
    calculateDamage: (atk, def, luk, multiplier = 1.0) => {
        let damage = Math.max(atk * 0.1, (atk * multiplier) - def);
        let isCrit = Math.random() < Math.min(0.20, luk / 100);
        if (isCrit) damage *= 1.5;
        return { dmg: Math.floor(damage), isCrit };
    }
};
