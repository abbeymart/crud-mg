/**
 * @Author: abbeymart | Abi Akindele | @Created: 2020-02-17 | @Updated: 2020-05-03
 * @Company: mConnect.biz | @License: MIT
 * @Description: create/update method => insert/update one or many records/documents
 */

// Import required module/function(s)
const ObjectId           = require('mongodb').ObjectID;
const {getResMessage}    = require('@mconnect/res-messages');
const {cacheHash}        = require('@mconnect/cache');
const {ValidateCrud}     = require('@mconnect/validate-crud');
const {getParamsMessage} = require('@mconnect/utils')();

const checkAccess = require('./common/checkAccess');
const {checkDb}   = require('./common/crudHelpers');

const CrudRecord = require('./CrudRecord');

class SaveRecord extends CrudRecord {
    constructor(appDb, params, options = {}) {
        super(appDb, params, options);
        // CRUD instance variables
        this.db                  = null;
        this.coll                = null;
        this.userId              = '';
        this.isAdmin             = false;
        this.createItems         = [];
        this.updateItems         = [];
        this.docIds              = [];
        this.currentRecs         = [];
        this.roleServices        = [];
        this.isRecExist          = true;
        this.actionAuthorized    = false;
        this.recExistMessage     = 'Save / update error or duplicate records exist: ';
        this.unAuthorizedMessage = 'Action / task not authorised or permitted ';
    }

    async saveRecord() {
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
            userActive   = userStatus.value.userActive;
            userId       = userStatus.value.userId;
            isAdmin      = userStatus.value.isAdmin;
            roleServices = userStatus.value.roleServices;

            // set user-id instance value
            this.userId       = userId;
            this.isAdmin      = isAdmin;
            this.roleServices = roleServices;
        }

        // user-active-status validation/check
        if (!(userActive && userId)) {
            return getResMessage('unAuthorized');
        }

        // determine update / create (new) items from actionParams
        let updateItems = [],
            docIds      = [],
            createItems = [];

        // Ensure the _id for actionParams are of type mongoDb-ObjectId, for update actions
        if (this.paramItems.actionParams.length > 0) {
            this.paramItems.actionParams.forEach(item => {
                // transform/cast id, from string, to mongoDB-ObjectId
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

            // instance values
            this.createItems = createItems;
            this.updateItems = updateItems;
            this.docIds      = docIds;
        }

        // for queryParams, exclude _id, if present
        if (this.paramItems.queryParams && Object.keys(this.paramItems.queryParams).length > 0) {
            const {_id, ...otherParams} = this.paramItems.queryParams;
            this.paramItems.queryParams = otherParams;
        }

        // Ensure the _id for existParams are of type mongoDb-ObjectId, for create / update actions
        if (this.paramItems.existParams.length > 0) {
            this.paramItems.existParams.forEach(item => {
                // transform/cast id, from string, to mongoDB-ObjectId
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

        // create records/documents
        if (this.createItems.length > 0 && this.createItems.length <= this.paramItems.existParams.length) {
            try {
                // use / activate database
                this.db   = await this.dbConnect();
                this.coll = this.db.collection(this.paramItems.coll);
                return new Promise(async (resolve) => {
                    // check duplicate records, i.e. if similar records exist
                    const recExist = await this.checkRecExist();
                    if (!(recExist.code === 'success')) {
                        resolve(recExist);
                    }

                    // check/validate action permissions
                    const taskPermitted = await this.createPermitted();
                    if (!(taskPermitted.code === 'success')) {
                        resolve(taskPermitted);
                    }

                    // create records
                    resolve(await this.createRecord());
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
                // use / activate database
                this.db   = await this.dbConnect();
                this.coll = this.db.collection(this.paramItems.coll);

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

                    // check/validate action permissions
                    const taskPermitted = await this.taskPermitted();
                    if (!(taskPermitted.code === 'success')) {
                        resolve(taskPermitted);
                    }

                    // update records
                    resolve(await this.updateRecord());
                });
            } catch (e) {
                return getResMessage('updateError', {
                    message: `Error updating record(s): ${e.message ? e.message : ""}`,
                    value  : e,
                });
            }
        }

        // update records/documents by queryParams: permitted by userId (own records), admin(all records) or role
        if (isAdmin && docIds.length < 1 && Object.keys(this.paramItems.queryParams).length > 0 && this.paramItems.actionParams.length === 1) {
            try {
                // use / activate database
                this.db   = await this.dbConnect();
                this.coll = this.db.collection(this.paramItems.coll);

                return new Promise(async (resolve) => {
                    // check duplicate records, i.e. if similar records exist
                    const recExist = await this.checkRecExist();
                    if (!(recExist.code === 'success')) {
                        resolve(recExist);
                    }

                    // get current records update and audit log
                    const currentRec = await this.getCurrentRecordByParams();
                    if (!(currentRec.code === 'success')) {
                        resolve(currentRec);
                    }

                    // check/validate action permissions
                    const taskPermitted = await this.taskPermittedByParams();
                    if (!(taskPermitted.code === 'success')) {
                        resolve(taskPermitted);
                    }

                    // update records
                    const updateRec = await this.updateRecordByParams();
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
        return new Promise(async (resolve) => {
            for (const existItem of this.paramItems.existParams) {
                let recordExist = await this.coll.findOne(existItem);
                if (recordExist) {
                    this.isRecExist       = true;
                    // capture attributes for duplicateRec checking
                    let attributesMessage = '';
                    Object.entries(existItem)
                        .forEach(([key, value]) => {
                            attributesMessage = attributesMessage ? `${attributesMessage} | ${key}: ${value}` : `${key}: ${value}`;
                        });
                    resolve(getResMessage('recExist', {
                        message: `Record with similar combined attributes [${attributesMessage}] exists. Provide unique record attributes to create or update record(s).`,
                    }));
                } else {
                    this.isRecExist = false;
                }
            }
            if (!this.isRecExist) {
                resolve(getResMessage('success', {
                    message: 'no integrity conflict',
                }));
            } else {
                resolve(getResMessage('error', {
                    message: 'unable to verify integrity conflict',
                }));
            }
        });
    }

    async createRecord() {
        // insert/create multiple records and log in audit
        return new Promise(async (resolve) => {
            try {
                if (!this.isRecExist) {
                    // insert/create multiple records and log in audit
                    const records = await this.coll.insertMany(this.createItems);
                    if (records.insertedCount > 0) {
                        // delete cache
                        await cacheHash.deleteCache(this.paramItems.coll);
                        // check the audit-log settings - to perform audit-log
                        if (this.logCreate) await this.transLog.createLog(this.paramItems.coll, this.createItems, this.userId);
                        resolve(getResMessage('success', {
                            message: 'Record(s) created successfully.',
                            value  : {
                                docCount: records.insertedCount,
                            },
                        }));
                    }
                } else {
                    resolve(getResMessage('recExist', {
                        message: this.recExistMessage,
                    }));
                }
            } catch (e) {
                resolve(getResMessage('insertError', {
                    message: `Error inserting/creating new record(s): ${e.message ? e.message : ""}`,
                    value  : e,
                }));
            }
        });
    }

    async getCurrentRecord() {
        // current records, prior to update, for audit-log
        return new Promise(async (resolve) => {
            // current records, prior to update
            const currentRecords = await this.coll.find({
                _id: {
                    $in: this.docIds
                }
            }).toArray();

            if (currentRecords.length < 1) {
                resolve(getResMessage('notFound', {
                    message: "Record(s) requested for updates, not found.",
                }));
            } else {
                this.currentRecs = currentRecords;
                resolve(getResMessage('success', {
                    message: 'record exists for update',
                }));
            }
        });
    }

    async getCurrentRecordByParams() {
        // current records, prior to update, for audit-log
        return new Promise(async (resolve) => {
            // current records, prior to update
            const currentRecords = await this.coll.find(this.paramItems.queryParams).toArray();
            if (currentRecords.length < 1) {
                return getResMessage('notFound', {
                    message: 'Record(s) requested for updates, not found.',
                });
            } else {
                this.currentRecs = currentRecords;
                resolve(getResMessage('success', {
                    message: 'record exists for update',
                }));
            }
        });
    }

    async createPermitted() {
        return new Promise(async (resolve) => {
            // determine permission by role-assignment(canCreate) or admin, for collection by coll-id
            const serviceColl   = this.db.collection(this.serviceColl);
            const collInfo      = await serviceColl.find({
                name: {$or: [this.paramItems.coll.toLowerCase(), (this.paramItems.coll[0].toUpperCase() + this.paramItems.coll.slice(1).toLowerCase())]},
                type: "Collection"
            });
            const rolePermitted = await this.roleServices.some(role => {
                return (role.service === (collInfo ? collInfo._id : '') && role.canCreate);
            })

            // permit task, by owner, role or admin only
            const taskPermitted = rolePermitted || this.isAdmin;

            if (!taskPermitted) {
                this.actionAuthorized = false;
                resolve(getResMessage('unAuthorized', {
                    message: 'You are not authorized to update record(s)',
                }));
            } else {
                this.actionAuthorized = true;
                resolve(getResMessage('success', {
                    message: 'action authorised / permitted',
                }));
            }
        });
    }

    async taskPermitted() {
        return new Promise(async (resolve) => {
            // determine permission by userId/owner, role-assignment(canUpdate) or admin
            let docRolePermitted  = false,
                collRolePermitted = false;

            // collection level permission
            const serviceColl = this.db.collection(this.serviceColl);
            const collInfo    = await serviceColl.find({
                name: {$or: [this.paramItems.coll.toLowerCase(), (this.paramItems.coll[0].toUpperCase() + this.paramItems.coll.slice(1).toLowerCase())]},
                type: "Collection"
            });

            if (collInfo) {
                collRolePermitted = this.roleServices.some(role => {
                    return ((role.service === (collInfo ? collInfo._id : '')) && role.canUpdate);
                });
            }

            // document level permission
            if (this.docIds.length) {
                docRolePermitted = await this.docIds.every(id => {
                    // check roleServices permission (canRead):
                    return this.roleServices.some(role => {
                        return (role.service === id && role.canUpdate);
                    })
                });
            }

            // permit update of users collection if user._id === userId (i.e. by record owner/user)
            let userAllowedUpdate = false;
            if (this.paramItems.coll === this.userColl) {
                userAllowedUpdate = await this.updateItems.every(item => {
                    // to compare ObjectId, convert to strings
                    return item._id.toString() === this.userId.toString();
                });
            }

            // permit task, by owner, role or admin only
            const taskPermitted = await this.currentRecords.every(item => {
                return (item.createdBy.toString() === this.userId.toString());
            }) || collRolePermitted || docRolePermitted || userAllowedUpdate || this.isAdmin;

            if (!taskPermitted) {
                this.actionAuthorized = false;
                resolve(getResMessage('unAuthorized', {
                    message: 'You are not authorized to perform the requested action/task',
                }));
            } else {
                this.actionAuthorized = true;
                resolve(getResMessage('success', {
                    message: 'action authorised / permitted',
                }));
            }
        });
    }

    async taskPermittedByParams() {
        return new Promise(async (resolve) => {
            // determine permission by userId/owner, role-assignment(canUpdate) or admin
            // ids of records to be deleted, from queryParams
            this.docIds = [];           // reset docIds instance value
            this.currentRecords.forEach(item => {
                this.docIds.push(item._id);
            });
            resolve(await this.taskPermitted());
        });
    }

    async updateRecord() {
        // updated records
        return new Promise(async (resolve) => {
            try {
                // check/validate update/upsert command for multiple records
                let updateCount = 0;

                if (!this.isRecExist && this.actionAuthorized) {
                    // update one record
                    if (this.updateItems.length === 1) {
                        // destruct _id /other attributes
                        const {
                                  _id,
                                  ...otherParams
                              } = this.updateItems[0];
                        // control isAdmin setting:
                        if (this.paramItems.coll === this.userColl && !this.isAdmin) {
                            const currentRec            = await this.coll.find({_id: _id});
                            otherParams.profile.isAdmin = currentRec && currentRec.profile && currentRec.profile.isAdmin ?
                                                          currentRec.profile.isAdmin :
                                                          false;
                        }
                        const updateResult = await this.coll.updateOne({
                            _id: _id
                        }, {
                            $set: otherParams
                        });
                        updateCount += Number(updateResult.modifiedCount);
                    }

                    // update multiple records
                    if (this.updateItems.length > 1) {
                        for (let i = 0; i < this.updateItems.length; i++) {
                            const item = this.updateItems[i];
                            // destruct _id /other attributes
                            const {
                                      _id,
                                      ...otherParams
                                  }    = item;
                            // control isAdmin setting:
                            if (this.paramItems.coll === this.userColl && !this.isAdmin) {
                                const currentRec            = await this.coll.find({_id: _id});
                                otherParams.profile.isAdmin = currentRec && currentRec.profile && currentRec.profile.isAdmin ?
                                                              currentRec.profile.isAdmin :
                                                              false;
                            }
                            const updateResult = await this.coll.updateOne({
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
                        if (this.logUpdate) await this.transLog.updateLog(this.paramItems.coll, this.currentRecords, this.updateItems, this.userId);
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
                } else if (!this.actionAuthorized) {
                    resolve(getResMessage('unAuthorized', {
                        message: this.unAuthorizedMessage,
                    }));
                } else if (this.isRecExist) {
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

    async updateRecordByParams() {
        // updated records
        return new Promise(async (resolve) => {
            try {
                // check/validate update/upsert command for multiple records
                if (!this.isRecExist && this.actionAuthorized) {
                    // update multiple records
                    // destruct _id /other attributes
                    const {_id, ...otherParams} = this.paramItems.actionParams[0];
                    // control isAdmin setting:
                    if (this.paramItems.coll === this.userColl && !this.isAdmin) {
                        otherParams.profile.isAdmin = false;
                    }
                    // include item stamps: userId and date
                    otherParams.updatedBy   = this.userId;
                    otherParams.updatedDate = new Date();
                    const updateResult      = await this.coll.updateMany(this.paramItems.queryParams, {
                        $set: otherParams
                    });
                    if (Number(updateResult.modifiedCount) > 0) {
                        // delete cache
                        await cacheHash.deleteCache(this.paramItems.coll);
                        // check the audit-log settings - to perform audit-log
                        if (this.logUpdate) await this.transLog.updateLog(this.paramItems.coll, this.currentRecords, otherParams, this.userId);
                        return getResMessage('success', {
                            message: 'Requested action(s) performed successfully.',
                            value  : {
                                docCount: updateResult.modifiedCount,
                            },
                        });
                    }
                } else if (!this.actionAuthorized) {
                    resolve(getResMessage('unAuthorized', {
                        message: this.unAuthorizedMessage,
                    }));
                } else if (this.isRecExist) {
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
