/**
 * @Author: abbeymart | Abi Akindele | @Created: 2018-11-19 | @Updated: 2019-06-15
 * @Company: mConnect.biz | @License: MIT
 * @Description: bulk load records / documents, strictly for server-side(admin) ETL tasks
 */

// Import required module/function(s)
const {getResMessage}    = require('@mconnect/res-messages');
const {ValidateCrud}     = require('@mconnect/validate-crud');
const {getParamsMessage} = require('@mconnect/utils')();

const {checkDb}    = require('./common/crudHelpers');
const {mcMessages} = require('./locales/getMessage');

function LoadRecord(appDb, params, options = {}) {
    // options / defaults
    // params: {coll(string), actionParams[]...
    this.paramItems = {
        coll        : params && params.coll ? params.coll : '',
        actionParams: params && params.actionParams ? params.actionParams : [],
        token       : params.token ? params.token : '',
        userInfo    : params.userInfo ? params.userInfo : '',
    };
    this.dbConnect  = appDb;
    this.maxRecords = options && options.maxRecords ? options.maxRecords : 10000; // 10,000 records
    this.mcMessages = options && options.mcMessages && (typeof options.mcMessages === 'object') ?
                      options.mcMessages : mcMessages;
}

LoadRecord.prototype.loadRecord = async function () {
    // Check/validate the attributes / parameters
    const dbCheck = checkDb(this.dbConnect);
    if (dbCheck && Object.keys(dbCheck).length > 0) {
        return dbCheck;
    }

    // limit maximum records to bulk-load to 10,000 records
    if (this.maxRecords > 10000) {
        this.maxRecords = 10000;
    }

    const validateRecord = ValidateCrud({messages: this.mcMessages});

    const errors = validateRecord.validateLoadRecord(this.paramItems);
    if (this.paramItems.actionParams.length > 10000) {
        errors.maxRecords = `${this.paramItems.actionParams.length} records load-request, exceeded ${this.maxRecords} limit. 
        Please send not more than ${this.maxRecords} records to load at a time`;
    }
    if (Object.keys(errors).length > 0) {
        return getParamsMessage(errors);
    }

    // define db-client-handle and result variables
    let db, col;

    // create/load multiple records
    if (this.paramItems.actionParams.length > 0) {
        // check if items/records exist using the existParams/actionParams
        try {
            // use / activate database
            db  = await this.dbConnect();
            col = db.collection(this.paramItems.coll);

            // clear the current collection documents/records, for refresh
            await col.deleteMany({});
            // refresh (insert/create) new multiple records
            const records = await col.insertMany(this.paramItems.actionParams);
            if (records.insertedCount > 0) {
                return getResMessage('success', {
                    message: `${records.insertedCount} record(s) created successfully.`,
                    value  : {
                        docCount: records.insertedCount,
                    },
                });
            }
            return getResMessage('insertError', {
                message: 'Error-inserting/creating new record(s). Please retry.',
                value  : {
                    docCount: records.insertedCount,
                },
            });
        } catch (error) {
            return getResMessage('insertError', {
                message: 'Error-inserting/creating new record(s). Please retry.',
                value  : {
                    error,
                },
            });
        }
    }
    // return unAuthorised
    return getResMessage('insertError', {
        message: 'No records inserted. Please retry',
    });
};

module.exports = LoadRecord;
