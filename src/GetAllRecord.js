/**
 * @Author: abbeymart | Abi Akindele | @Created: 2017-01-09 | @Updated: 2020-05-03
 * @Company: mConnect.biz | @License: MIT
 * @Description: get all active records, by params, by role / by userId | cache-in-memory, lookup-items <= 1000 records
 */

// Import required module(s)
const {getResMessage}    = require('@mconnect/res-messages');
const {cacheHash}        = require('@mconnect/cache');
const {ValidateCrud}     = require('@mconnect/validate-crud');
const {getParamsMessage} = require('@mconnect/utils')();
const {checkDb}          = require('./common/crudHelpers');
const CrudRecord         = require('./CrudRecord');

class GetAllRecord extends CrudRecord {
    constructor(appDb, params, options = {}) {
        super(appDb, params, options);
    }
    async getAllRecord() {
        // Check/validate the attributes/parameters
        const dbCheck = checkDb(this.dbConnect);
        if (dbCheck && Object.keys(dbCheck).length > 0) {
            return dbCheck;
        }
        const auditDbCheck = checkDb(this.auditDb);
        if (auditDbCheck && Object.keys(auditDbCheck).length > 0) {
            return auditDbCheck;
        }

        const validateRecord = ValidateCrud({messages: this.mcMessages});

        const errors = validateRecord.validateGetAllRecord(this.paramItems);
        if (Object.keys(errors).length > 0) {
            return getParamsMessage(errors);
        }

        // check the audit-log settings - to perform audit-log (read/search info - params, keywords etc.)
        if (this.logRead && Object.keys(this.paramItems.queryParams).length > 0) {
            await this.transLog.readLog(this.paramItems.coll, this.paramItems.queryParams, 'lookupadminuserabcde9999');
        }

        // check cache for matching record(s), and return if exist
        try {
            const items = await cacheHash.getCache(this.paramItems.coll, this.paramItems);
            if (items && items.value && items.value.length > 0) {
                console.log('cache-items-before-query: ', items.value[0]);
                return getResMessage('success', {
                    value  : items.value,
                    message: 'from cache',
                });
            }
        } catch (e) {
            console.error('error from the cache: ', e.stack);
        }

        // set maximum limit and default values per query
        if (this.paramItems.limit > this.maxQueryLimit) this.paramItems.limit = this.maxQueryLimit;
        if (this.paramItems.limit < 1) this.paramItems.limit = 1;
        if (this.paramItems.skip < 0) this.paramItems.skip = 0;

        // define db-client-handle and result variables
        let db, col;
        // Get items by queryParams
        if (Object.keys(this.paramItems.queryParams).length > 0) {
            // use connect method to connect to the Server
            try {
                // use / activate database
                db  = await this.dbConnect();
                col = db.collection(this.paramItems.coll);

                // include user/owned-items
                // this.paramItems.queryParams.createdBy = userId;
                const result = await col.find(this.paramItems.queryParams)
                    .skip(this.paramItems.skip)
                    .limit(this.paramItems.limit)
                    .project(this.paramItems.projectParams)
                    .sort(this.paramItems.sortParams)
                    .toArray();

                if (result.length > 0) {
                    // save copy in the cache
                    await cacheHash.setCache(this.paramItems.coll, {
                        key  : this.paramItems,
                        value: result
                    }, this.cacheExpire);
                    // await cacheHash.getCache(this.paramItems.coll, this.paramItems);
                    // const items = await cacheHash.getCache(this.paramItems.coll, this.paramItems);
                    // if (items && items.value && items.value.length > 0) {
                    //     console.log('cache items-after-query: ', items.value[0]);
                    // }
                    return getResMessage('success', {
                        value: result,
                    });
                }
                return getResMessage('notFound');

            } catch (error) {
                return getResMessage('notFound', {
                    value: error,
                });
            }
        }

        try {
            // use / activate database
            db  = await this.dbConnect();
            col = db.collection(this.paramItems.coll);

            const result = await col.find()
                .skip(this.paramItems.skip)
                .limit(this.paramItems.limit)
                .project(this.paramItems.projectParams)
                .sort(this.paramItems.sortParams)
                .toArray();

            if (result.length > 0) {
                // save copy in the cache
                await cacheHash.setCache(this.paramItems.coll, {key: this.paramItems, value: result}, this.cacheExpire);
                // const items = await cacheHash.getCache(this.paramItems.coll, this.paramItems);
                // if (items && items.value && items.value.length > 0) {
                //     console.log('cache items-after-query: ', items.value[0]);
                // }
                return getResMessage('success', {
                    value: result,
                });
            }
            return getResMessage('notFound');
        } catch (error) {
            return getResMessage('notFound', {
                value: error,
            });
        }
    }
}

function newGetAllRecord(appDb, params, options = {}) {
    return new GetAllRecord(appDb, params, options);
}

module.exports = {GetAllRecord, newGetAllRecord};
