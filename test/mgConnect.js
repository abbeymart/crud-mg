/**
 * @Author: abbeymart | Abi Akindele | @Created: 2019-01-07 | @Updated: 2019-08-11
 * @Company: mConnect.biz | @License: MIT
 * @Description: MongoDB database connection | database collection handle (single and pool)
 */

// Require / Import db components
const MongoClient = require('mongodb').MongoClient;

// data-source
const dataSource = {
    location: 'mongodb://localhost:27017/mc-central',
    host    : 'localhost',
    username: 'your-username',
    password: 'your-password',
    database: 'mc-central',
    port    : '27017',
};

const dbenv = process.env.NODE_ENV || 'development';

let dbString = '',
    dbName   = '';
//    url      = '',
//    user     = '',
//    password = '';

//const authMechanism = 'DEFAULT';

if ( dbenv === 'production' && process.env.MONGODB_URI ) {
    dbString = process.env.MONGODB_URI;
} else {
    // dbString = `mongodb://${dataSource.host}:${dataSource.port}/${dataSource.database}?authMechanism=${authMechanism}`;
    dbName   = dataSource.database;
    dbString = `mongodb://${dataSource.host}:${dataSource.port}/${dataSource.database}`;
//    url      = `mongodb://${dataSource.host}:${dataSource.port}`;
//    user     = encodeURIComponent(dataSource.username);
//    password = encodeURIComponent(dataSource.password);
}

// setup db-connection pool
const options = {
    poolSize         : 20,
    reconnectTries   : Number.MAX_VALUE,
    reconnectInterval: 1000,
    useNewUrlParser  : true,
};

// connect to the server, pool
const mgdb = MongoClient.connect(dbString, options); // returns a promise

// setup dbConnection handler
async function dbConnect() {
    let db,
        client;
    try {
        // connect to the server
        client = await mgdb;
        db     = client.db(dbName);
        return db;
    } catch ( err ) {
        if ( client ) await client.close();
        console.error('MongoDB connection error:' + err.stack);
        return {
            code   : 'error',
            message: 'Error opening/creating a database/collection handle'
        }
    }
}

module.exports = { dbConnect, mgdb };
