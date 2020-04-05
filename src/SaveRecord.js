/**
 * @Author: abbeymart | Abi Akindele | @Created: 2020-02-17 | @Updated: 2020-04-05
 * @Company: mConnect.biz | @License: MIT
 * @Description: create/update method => insert/update one or many records/documents
 */

// Import required module/function(s)
const ObjectId           = require('mongodb').ObjectID;
const {getResMessage}    = require('@mconnect/res-messages');
const {cacheHash}        = require('@mconnect/cache');
const {TransLog}         = require('@mconnect/translog');
const {ValidateCrud}     = require('@mconnect/validate-crud');
const {getParamsMessage} = require('@mconnect/utils')();

const checkAccess  = require('./common/checkAccess');
const {checkDb}    = require('./common/crudHelpers');
const {mcMessages} = require('./locales/getMessage');

const CrudRecord = require('./CrudRecord');

function SaveRecord1(appDb, params, options = {}) {
    // ensure a new instance is returned, if constructor function is called without new
    if (typeof new.target === 'undefined') {
        return new SaveRecord(appDb, params, options);
    }
    // options / defaults
    const serviceColl = options && options.serviceColl ? options.serviceColl : 'services';
    const auditColl   = options && options.auditColl ? options.auditColl : 'audits';
    const accessColl  = options && options.accessColl ? options.accessColl : 'accessKeys';
    const userColl    = options && options.userColl ? options.userColl : 'users';
    const roleColl    = options && options.roleColl ? options.roleColl : 'roles';

    // params: {coll(string), actionParams[], queryParams{}, existParams[], token(string), userInfo{}}
    this.paramItems    = {
        coll        : params.coll ? params.coll : '',
        actionParams: params.actionParams ? params.actionParams : [], // array
        queryParams : params.queryParams ? params.queryParams : {}, // object, optional for update
        existParams : params.existParams ? params.existParams : [], // array
        token       : params.token ? params.token : '',
        userInfo    : params.userInfo ? params.userInfo : '',
    };
    this.dbConnect     = appDb;
    this.serviceColl   = serviceColl;
    this.auditColl     = auditColl;
    this.accessColl    = accessColl;
    this.userColl      = userColl;
    this.roleColl      = roleColl;
    this.accessDb      = options && options.accessDb ? options.accessDb : appDb;
    this.auditDb       = options && options.auditDb ? options.auditDb : appDb;
    this.maxQueryLimit = options && options.maxQueryLimit && (typeof options.maxQueryLimit === 'number') ?
                         options.maxQueryLimit : 10000;
    this.logCreate     = options && options.logCreate && (typeof options.logCreate === 'boolean') ?
                         options.logCreate : false;
    this.logUpdate     = options && options.logUpdate && (typeof options.logUpdate === 'boolean') ?
                         options.logUpdate : false;
    this.mcMessages    = options && options.mcMessages && (typeof options.mcMessages === 'object') ?
                         options.mcMessages : mcMessages;

    this.transLog = TransLog(this.auditDb, {
        auditColl,
        messages     : this.mcMessages,
        maxQueryLimit: this.maxQueryLimit,
    });
}

SaveRecord1.prototype.saveRecord = async function () {
    // Check/validate the attributes / parameters
    const dbCheck = checkDb(this.dbConnect);
    if (dbCheck && Object.keys(dbCheck).length > 0) {
        return dbCheck;
    }
    const auditDbCheck = checkDb(this.auditDb);
    if (auditDbCheck && Object.keys(auditDbCheck).length > 0) {
        return auditDbCheck;
    }
    const accessDbCheck = checkDb(this.accessDb);
    if (accessDbCheck && Object.keys(accessDbCheck).length > 0) {
        return accessDbCheck;
    }

    const validateRecord = ValidateCrud({messages: this.mcMessages});

    const errors = validateRecord.validateSaveRecord(this.paramItems);
    if (Object.keys(errors).length > 0) {
        return getParamsMessage(errors);
    }

    // validate current user active status: by token and/or user/loggedIn-status
    let userActive   = false,
        userId       = '',
        isAdmin      = false,
        //            userRole     = '',
        //            userRoles    = [],
        roleServices = [];

    // role-assignment / access rights
    const userStatus = await checkAccess(this.accessDb, {
        accessColl: this.accessColl,
        userColl  : this.userColl,
        token     : this.paramItems.token,
        userInfo  : this.paramItems.userInfo,
        messages  : this.messages,
    });

    if (userStatus.code === 'success') {
        userActive = userStatus.value.userActive;
        userId     = userStatus.value.userId;
        isAdmin    = userStatus.value.isAdmin;
//            userRole     = userStatus.value.userRole;
//            userRoles    = userStatus.value.userRoles;
        roleServices = userStatus.value.roleServices;
    }

    // user-active-status
    if (!(userActive && userId)) {
        return getResMessage('unAuthorized');
    }

    // determine update / create (new) items from actionParams
    let updateItems = [],
        docIds      = [],
        createItems = [];

    // Ensure the _id for actionParams are of type mongoDb-ObjectId, for create / update actions
    if (this.paramItems.actionParams.length > 0) {
        this.paramItems.actionParams.forEach(item => {
            // transform/cast i, from string, to mongoDB-ObjectId
            Object.keys(item).forEach(itemKey => {
                // simplify checking key that ends with id/ID/Id/iD, using toLowerCase()
                if (itemKey.toString().toLowerCase().endsWith('id')) {
                    if (typeof item[itemKey] === 'string' && item[itemKey] !== '') {
                        item[itemKey] = ObjectId(item[itemKey]);
                    }
                }
            });
            if (item._id) {
                // update/existing record
                item.updatedBy   = userId;
                item.updatedDate = new Date();
                updateItems.push(item);
                docIds.push(item._id);
            } else {
                // exclude any traces of _id without specified/concrete value ('', null, undefined), if present
                // eslint-disable-next-line no-unused-vars
                const {_id, ...saveParams} = item;
                item                       = saveParams;
                // create/new record
                item.createdBy             = userId;
                item.createdDate           = new Date();
                createItems.push(item);
            }
        });
    }

    // for queryParams, exclude _id, if present
    if (this.paramItems.queryParams && Object.keys(this.paramItems.queryParams).length > 0) {
        const {_id, ...otherParams} = this.paramItems.queryParams;
        this.paramItems.queryParams = otherParams;
    }

    // Ensure the _id for existParams are of type mongoDb-ObjectId, for create / update actions
    if (this.paramItems.existParams.length > 0) {
        this.paramItems.existParams.forEach(item => {
            // transform/cast i, from string, to mongoDB-ObjectId
            Object.keys(item).forEach(itemKey => {
                if (itemKey.toString().toLowerCase().endsWith('id')) {
                    // create
                    if (typeof item[itemKey] === 'string' && item[itemKey] !== '') {
                        item[itemKey] = ObjectId(item[itemKey]);
                    }
                    // update
                    if (typeof item[itemKey] === 'object' && item[itemKey]['$ne'] &&
                        (item[itemKey]['$ne'] !== '' || item[itemKey]['$ne'] !== null)) {
                        item[itemKey]['$ne'] = ObjectId(item[itemKey]['$ne'])
                    }
                }
            });
        });
    }

    // define db-client-handle and result variables
    let db, col;

    // console.log('****existParams*****: ', this.paramItems.existParams);

    // create action(s):  permitted by userId (own records), admin(all records) or role
    // createItems count should be less or equal to the existParams-items count
    if (createItems.length >= 1 && createItems.length <= this.paramItems.existParams.length) {
        // check if items/records exist using the existParams/actionParams
        try {
            // use / activate database
            db  = await this.dbConnect();
            col = db.collection(this.paramItems.coll);

            // check record(s) uniqueness, for create-action(s)
            // check if there are existing records with uniquely related attributes

            for (let existItem of this.paramItems.existParams) {
                // console.log('*****create-exist-params: ', existItem);
                let recordExist = await col.findOne(existItem);
                // console.log('*****create-exist***** ', recordExist);
                if (recordExist) {
                    // capture attributes for duplicateRec checking
                    let attributesMessage = '';
                    Object.entries(existItem)
                        .forEach(([key, value]) => {
                            attributesMessage = attributesMessage ? `${attributesMessage} | ${key}: ${value}` : `${key}: ${value}`;
                        });
                    return getResMessage('recExist', {
                        message: `Record with similar combined attributes [${attributesMessage}] exists. Provide unique record attributes to create new record(s).`,
                    });
                }
            }

            // TODO: determine permission by userId for collections (roleServices+), canCreate

            // insert/create multiple records and log in audit
            const records = await col.insertMany(createItems);
            if (records.insertedCount > 0) {
                // delete cache
                await cacheHash.deleteCache(this.paramItems.coll);
                // check the audit-log settings - to perform audit-log
                if (this.logCreate) await this.transLog.createLog(this.paramItems.coll, createItems, userId);
                return getResMessage('success', {
                    message: 'Record(s) created successfully.',
                    value  : {
                        docCount: records.insertedCount,
                    },
                });
            }
            return getResMessage('insertError', {
                message: 'No records updated. Please retry.',
            });
        } catch (error) {
            // console.error('Error-inserting/creating new record: ', error);
            return getResMessage('insertError', {
                message: 'Error-inserting/creating new record.',
                value  : {
                    error,
                },
            });
        }
    }

    // update action(s) by docIds: permitted by userId (own records), admin(all records) or role
    if (updateItems.length >= 1 && updateItems.length <= this.paramItems.existParams.length) {
        // check if items/records exist using the existParams/actionParams
        try {
            // use / activate database
            db  = await this.dbConnect();
            col = db.collection(this.paramItems.coll);

            // check record(s) uniqueness, for update-action(s)
            // check if other records beside the current-docIds exist
            for (let existItem of this.paramItems.existParams) {
                let recordExist = await col.findOne(existItem);
                if (recordExist) {
                    // capture attributes for duplicateRec checking
                    let attributesMessage = '';
                    Object.entries(existItem)
                        .forEach(([key, value]) => {
                            attributesMessage = attributesMessage ? `${attributesMessage} | ${key}: ${value}` : `${key}: ${value}`;
                        });
                    return getResMessage('recExist', {
                        message: `Record with similar combined attributes [${attributesMessage}] exists.
                             Provide unique record attributes to update existing records.`,
                    });
                }
            }
            // current records, prior to update
            const currentRecords = await col.find({
                _id: {
                    $in: docIds
                }
            }).toArray();
            if (currentRecords.length < 1) {
                return getResMessage('notFound', {
                    message: "Record(s) requested for updates, not found.",
                });
            }

            // determine permission by userId/owner, role-assignment(canUpdate) or admin
            const rolePermitted = await docIds.every(id => {
                // check roleServices permission (canUpdate):
                return roleServices.some(role => {
                    return (role.service === id && role.canUpdate);
                })
            });

            // permit update of users collection if user._id === userId (i.e. by record owner/user)
            let userAllowedUpdate = false;
            if (this.paramItems.coll === this.userColl) {
                userAllowedUpdate = await updateItems.every(item => {
                    // to compare ObjectId, convert to strings
                    return item._id.toString() === userId.toString();
                });
            }

            // permit task, by owner, role or admin only
            const taskPermitted = await currentRecords.every(item => {
                return (item.createdBy.toString() === userId.toString());
            }) || rolePermitted || userAllowedUpdate || isAdmin;
            if (!taskPermitted) {
                return getResMessage('unAuthorized', {
                    message: 'You are not authorized to update record(s)',
                });
            }

            // check/validate update/upsert command for multiple records
            let updateCount = 0;

            // update one record
            if (updateItems.length === 1) {
                // destruct _id /other attributes
                const {
                          _id,
                          ...otherParams
                      } = updateItems[0];
                // control isAdmin setting:
                if (this.paramItems.coll === this.userColl && !isAdmin) {
                    otherParams.profile.isAdmin = false;
                }
                const updateResult = await col.updateOne({
                    _id: _id
                }, {
                    $set: otherParams
                });
                updateCount += Number(updateResult.modifiedCount);
            }

            // update multiple records
            if (updateItems.length > 1) {
                for (let i = 0; i < updateItems.length; i++) {
                    const item = updateItems[i];
                    // destruct _id /other attributes
                    const {
                              _id,
                              ...otherParams
                          }    = item;
                    // control isAdmin setting:
                    if (this.paramItems.coll === this.userColl && !isAdmin) {
                        otherParams.profile.isAdmin = false;
                    }
                    const updateResult = await col.updateOne({
                        _id: _id
                    }, {
                        $set: otherParams
                    });
                    // updateCount += Number( updateResult.result.n );
                    updateCount += Number(updateResult.modifiedCount);

                }
            }

            if (updateCount > 0) {
                // delete cache
                await cacheHash.deleteCache(this.paramItems.coll);
                // check the audit-log settings - to perform audit-log
                if (this.logUpdate) await this.transLog.updateLog(this.paramItems.coll, currentRecords, updateItems, userId);
                return getResMessage('success', {
                    message: 'Record(s) updated successfully.',
                    value  : {
                        docCount: updateCount,
                    },
                });
            }
            return getResMessage('updateError', {
                message: 'No records updated. Please retry.',
            });
        } catch (error) {
            return getResMessage('updateError', {
                message: `Error updating existing record(s): ${error.message}`,
            });
        }
    }

    // update action(s) by queryParams: permitted by userId (own records), admin(all records) or role
    if (isAdmin && docIds.length < 1 && Object.keys(this.paramItems.queryParams).length > 0 && this.paramItems.actionParams.length === 1) {
        // check if items/records exist using the existParams/actionParams
        try {
            // use / activate database
            db  = await this.dbConnect();
            col = db.collection(this.paramItems.coll);

            // check record(s) uniqueness, for create-action(s)
            // check if other records beside the current-docIds exist
            for (let i = 0; i < this.paramItems.existParams.length; i++) {
                let recordExist = await col.findOne(this.paramItems.existParams[i]);
                if (recordExist) {
                    // capture attributes for duplicateRec checking
                    let attributesMessage = '';
                    Object.entries(this.paramItems.existParams[i])
                        .forEach(([key, value]) => {
                            attributesMessage = `${attributesMessage} | ${key}: ${value}`;
                        });
                    return getResMessage('duplicateRec', {
                        message: `Record with similar combined attributes [${attributesMessage}] exists. 
                            Provide unique record attributes to update existing records.`,
                    });
                }
            }
            // current records, prior to update
            const currentRecords = await col.find(this.paramItems.queryParams).toArray();
            if (currentRecords.length < 1) {
                return getResMessage('notFound', {
                    message: 'Record(s) requested for updates, not found.',
                });
            }

            // determine permission by userId/owner, role-assignment(canUpdate) or admin
            const taskPermitted = await currentRecords.every(item => {
                return (item.createdBy.toString() === userId.toString());
            }) || isAdmin;
            if (!taskPermitted) {
                return getResMessage('unAuthorized', {
                    message: 'You are not authorized to update record(s)',
                });
            }

            // update multiple records
            // destruct _id /other attributes
            const {_id, ...otherParams} = this.paramItems.actionParams[0];
            // include item stamps: userId and date
            otherParams.updatedBy       = userId;
            otherParams.updatedDate     = new Date();
            const updateResult          = await col.updateMany(this.paramItems.queryParams, {
                $set: otherParams
            });
            if (updateResult.modifiedCount > 0) {
                // delete cache
                await cacheHash.deleteCache(this.paramItems.coll);
                // check the audit-log settings - to perform audit-log
                if (this.logUpdate) await this.transLog.updateLog(this.paramItems.coll, currentRecords, otherParams, userId);
                return getResMessage('success', {
                    message: 'Requested action(s) performed successfully.',
                    value  : {
                        docCount: updateResult.modifiedCount,
                    },
                });
            }
            return getResMessage('updateError', {
                message: 'No records updated. Please retry.',
            });
        } catch (error) {
            // console.error('Error-inserting/creating new record: ', error.stack);
            return getResMessage('updateError', {
                message: error.message,
            });
        }
    }

    // return unAuthorised
    return getResMessage('unAuthorized', {
        message: 'requested action(s) not performed due to incomplete information. Please retry',
    });
};

class SaveRecord extends CrudRecord {
    constructor(appDb, params, options = {}) {
        super(appDb, params, options = {});
        // CRUD instance variables
        this.createItems     = [];
        this.updateItems     = [];
        this.docIds          = [];
        this.currentRecs     = [];
        this.isRecExist      = true;
        this.recExistMessage = 'Save error or duplicate records exist: ';
    }

    async saveRecord() {
        const validateRecord = ValidateCrud({messages: this.mcMessages});

        const errors = validateRecord.validateSaveRecord(this.paramItems);
        if (Object.keys(errors).length > 0) {
            return getParamsMessage(errors);
        }

        // validate current user active status: by token/userId and loginRequired status
        if (this.loginRequired && !this.paramItems.token) {
            return getResMessage('unAuthorized');
        }

        // determine update / create items from actionParams
        this.paramItems.actionParams.forEach(item => {
            // set parentId
            if (!item.parentId) {
                item.parentId = '';
            }
            if (item._id) {
                item.updatedBy   = this.userId;
                item.updatedDate = new Date();
                this.updateItems.push(item);
                this.docIds.push(item._id);
            } else {
                // exclude _id attribute, if present (optional)
                const {_id, ...otherParams} = item;
                otherParams.createdBy       = this.userId;
                otherParams.createdDate     = new Date();
                this.createItems.push(otherParams);
            }
        });

        // exclude _id attribute, if present (optional) from queryParams
        const {_id, ...otherParams} = this.paramItems.queryParams;
        this.paramItems.queryParams = otherParams;

        // create records/documents
        if (this.createItems.length > 0 && this.createItems.length <= this.paramItems.existParams.length) {
            try {
                return new Promise(async (resolve) => {
                    // check duplicate records, i.e. if similar records exist
                    const recExist = await this.checkRecExist();
                    if (!(recExist.code === 'success')) {
                        resolve(recExist);
                    }
                    // create records
                    const createRec = await this.createRecord();
                    resolve(createRec);
                });
            } catch (e) {
                return getResMessage('insertError', {
                    message: 'Error-inserting/creating new record.',
                    value  : e,
                });
            }
        }

        // update existing records/documents
        if (this.updateItems.length > 0 && this.updateItems.length <= this.paramItems.existParams.length) {
            try {
                return new Promise(async (resolve) => {
                    // check duplicate records, i.e. if similar records exist
                    const recExist = await this.checkRecExist();
                    if (!(recExist.code === 'success')) {
                        resolve(recExist);
                    }

                    // get current records update and audit log
                    const currentRec = await this.getCurrentRecord();
                    if (!(currentRec.code === 'success')) {
                        resolve(currentRec);
                    }

                    // update records
                    const updateRec = await this.updateRecord();
                    resolve(updateRec);
                });
            } catch (e) {
                return getResMessage('updateError', {
                    message: `Error updating record(s): ${e.message ? e.message : ""}`,
                    value  : e,
                });
            }
        }

        // return save-error message
        return getResMessage('saveError', {
            message: 'Error performing the requested operation(s). Please retry',
        });
    }

    async checkRecExist() {
        // check if items/records exist: uniqueness
        return new Promise((resolve) => {
            for (const existItem of this.paramItems.existParams) {
                this.coll.find(existItem, (err, recExist) => {
                    console.log('check-records-exist');
                    if (err) {
                        resolve(getResMessage('saveError', {
                            message: "Error creating or updating the requested record(s). Please retry",
                            value  : err,
                        }));
                    } else if (recExist && Array.isArray(recExist) && recExist.length) {
                        // capture attributes for duplicateRec checking
                        let attributesMessage = '';
                        Object.entries(existItem)
                            .forEach(([key, value]) => {
                                attributesMessage = attributesMessage ? `${attributesMessage} | ${key}: ${value}` : `${key}: ${value}`;
                            });
                        this.recExistMessage = this.recExistMessage + attributesMessage;
                        resolve(getResMessage('recExist', {
                            message: `Record with similar combined attributes [${attributesMessage}] exists. Provide unique record attributes to create new record(s).`,
                        }));
                    } else {
                        this.isRecExist = false;
                        resolve(getResMessage('success', {
                            message: 'no integrity conflict',
                        }));
                    }
                });
            }
        });
    }

    async getCurrentRecord() {
        // current records, prior to update, for audit-log
        return new Promise((resolve) => {
            this.coll.find({_id: {$in: this.docIds}}, (err, currentRecords) => {
                console.log('get-current-records');
                this.currentRecs = currentRecords;
                if (err) {
                    resolve(getResMessage('updateError', {
                        message: "Error updating the requested record(s).",
                        value  : err,
                    }));
                } else if (currentRecords && Array.isArray(currentRecords) && currentRecords.length < 1) {
                    resolve(getResMessage('updateError', {
                        message: "Record(s) requested for updates, not found.",
                    }));
                } else {
                    resolve(getResMessage('success', {
                        message: 'record exists for update',
                    }));
                }
            });
        });
    }

    async createRecord() {
        // insert/create multiple records and log in audit
        return new Promise(async (resolve) => {
            try {
                if (!this.isRecExist) {
                    this.coll.insert(this.createItems, async (err, records) => {
                        console.log('create-task');
                        if (err) {
                            resolve(getResMessage('insertError', {
                                message: 'Error creating new record(s). Please retry.',
                                value  : err,
                            }));
                        }
                        // delete cache
                        await cacheHash.deleteCache(this.paramItems.coll);
                        // check the audit-log settings - to perform audit-log
                        if (this.logCreate) await this.transLog.createLog(this.paramItems.coll, this.createItems, this.userId);
                        resolve(getResMessage('success', {
                            message: 'Record(s) created successfully.',
                            value  : {
                                docCount: records.length,
                            },
                        }));
                    });
                } else {
                    resolve(getResMessage('recExist', {
                        message: this.recExistMessage,
                    }));
                }
            } catch (e) {
                resolve(getResMessage('insertError', {
                    message: `Error inserting new record(s): ${e.message ? e.message : ""}`,
                    value  : e,
                }));
            }
        });
    }

    async updateRecord() {
        // updated records
        return new Promise(async (resolve) => {
            try {
                let updateCount = 0;
                if (!this.isRecExist) {
                    for (const updateItem of this.updateItems) {
                        // destruct _id /other attributes
                        const {_id, ...otherParams} = updateItem;
                        this.coll.update({_id: _id}, {$set: otherParams}, async (err, numUpdated) => {
                            console.log('update-task-1');
                            if (err) {
                                resolve(getResMessage('updateError', {
                                    message: "Error updating the requested record(s).",
                                    value  : err,
                                }));
                            }
                            if (numUpdated > 0) {
                                updateCount += numUpdated;
                            }
                            if (updateCount === this.updateItems.length) {
                                console.log('update-task-2');
                                if (updateCount > 0) {
                                    // delete cache
                                    await cacheHash.deleteCache(this.paramItems.coll);
                                    // check the audit-log settings - to perform audit-log
                                    if (this.logUpdate) await this.transLog.updateLog(this.paramItems.coll, this.currentRecs, this.updateItems, this.userId);
                                    resolve(getResMessage('success', {
                                        message: 'Record(s) updated successfully.',
                                        value  : {
                                            docCount: updateCount,
                                        },
                                    }));
                                } else {
                                    resolve(getResMessage('updateError', {
                                        message: 'No records updated. Please retry.',
                                    }));
                                }
                            }
                        });
                    }
                } else {
                    resolve(getResMessage('recExist', {
                        message: this.recExistMessage,
                    }));
                }
            } catch (e) {
                resolve(getResMessage('updateError', {
                    message: `Error updating record(s): ${e.message ? e.message : ""}`,
                    value  : e,
                }));
            }
        });
    }
}

function newSaveRecord(collName, params, options = {}) {
    return new SaveRecord(collName, params, options);
}

module.exports = {SaveRecord, newSaveRecord};
