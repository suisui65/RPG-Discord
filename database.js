const { MongoClient } = require('mongodb');

let db;
module.exports = {
    connect: async (url) => {
        const client = new MongoClient(url);
        await client.connect();
        db = client.db("rpg_game");
        console.log("MongoDB connected!");
    },
    getCollection: (name) => db.collection(name)
};
