module.exports = {
    "イデア・ジェネシス": {
        "イデア・スパーク": {
            cost: 20, cd: 2, type: "spawn", power: 1.0, 
            info: "単体攻撃＋理想結晶を1つ生成（最大3）"
        },
        "オーバーブレス": {
            cost: 30, cd: 4, type: "trap_buff", 
            info: "対象を3ターン超強化し、後に範囲爆発させる"
        },
        "イデア・レゾナンス": {
            cost: 40, cd: 5, type: "resonance", 
            info: "場の結晶とバフを共鳴させ、数に応じて大ダメージ"
        },
        "ジェネシス・リメイク": {
            cost: 25, cd: 3, type: "copy", 
            info: "直前のプレイヤー行動を反転・コピーして放つ"
        },
        "イデア・ビッグバン": {
            cost: 60, cd: 8, type: "ultimate", 
            info: "全てを吸収し、その総量に応じた全体固定ダメージ"
        }
    }
};
