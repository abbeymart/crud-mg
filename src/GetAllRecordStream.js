/**
 * @Author: abbeymart | Abi Akindele | @Created: 2017-06-02 | @Updated: 2020-04-05
 * @Company: mConnect.biz | @License: MIT
 * @Description: get/stream all records
 */

// Import required module(s)
const {ValidateCrud}     = require('@mconnect/validate-crud');
const {getParamsMessage} = require('@mconnect/utils')();
const {checkDb}          = require('./common/crudHelpers');
const CrudRecord         = require('./CrudRecord');

class GetAllRecordStream extends CrudRecord {
    constructor(appDb, params, options = {}) {
        super(appDb, params, options);
    }

    async getAllRecordStream() {
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

        // set maximum limit and default values per query
        if (this.paramItems.limit > this.maxQueryLimit) this.paramItems.limit = this.maxQueryLimit;
        if (this.paramItems.limit < 1) this.paramItems.limit = 1;
        if (this.paramItems.skip < 0) this.paramItems.skip = 0;

        // check the audit-log settings - to perform audit-log (read/search info - params, keywords etc.)
        if (this.logRead && Object.keys(this.paramItems.queryParams).length > 0) {
            await this.transLog.readLog(this.paramItems.coll, this.paramItems.queryParams, 'lookupadminuserabcde9999');
        }

        // define db-client-handle and result variables
        let db, col;

        // stream response json transformation || .pipe(JSON.stringify), optional
        // const resTransform = {
        //     transform: function (doc) {
        //         return JSON.stringify(doc);
        //     }
        // };

        // Get items by queryParams
        if (Object.keys(this.paramItems.queryParams).length > 0) {
            // use connect method to connect to the Server
            try {
                // use / activate database
                db  = await this.dbConnect();
                col = db.collection(this.paramItems.coll);

                return await col.find(this.paramItems.queryParams)
                    .skip(this.paramItems.skip)
                    .limit(this.paramItems.limit)
                    .project(this.paramItems.projectParams)
                    .sort(this.paramItems.sortParams)
                    .stream();
            } catch (error) {
                throw new Error(`notFound: ${error.message}`);
            }
        }

        try {
            // use / activate database
            db  = await this.dbConnect();
            col = db.collection(this.paramItems.coll);

            return await col.find()
                .skip(this.paramItems.skip)
                .limit(this.paramItems.limit)
                .project(this.paramItems.projectParams)
                .sort(this.paramItems.sortParams)
                .stream();
        } catch (error) {
            throw new Error(`notFound: ${error.message}`);
        }
    }
}

function newGetAllRecordStream(appDb, params, options = {}) {
    return new GetAllRecordStream(appDb, params, options);
}

module.exports = {GetAllRecordStream, newGetAllRecordStream};
