import mcDb from "../../../mc-clients/mc-desk-apps/src/main/data/datastore";

/**
 * @Author: abbeymart | Abi Akindele | @Created: 2020-04-05 | @Updated: 2020-04-05
 * Updated 2018-04-08, prototype-to-class
 * @Company: mConnect.biz | @License: MIT
 * @Description: delete one or more records / documents
 */

// Import required module/function(s)
const ObjectId           = require('mongodb').ObjectID;
const {getResMessage}    = require('@mconnect/res-messages');
const {getParamsMessage} = require('@mconnect/utils')();
const {cacheHash}        = require('@mconnect/cache');
const {TransLog}         = require('@mconnect/translog');
const {ValidateCrud}     = require('@mconnect/validate-crud');

const {checkDb}    = require('./common/crudHelpers');
const checkAccess  = require('./common/checkAccess');
const {mcMessages} = require('./locales/getMessage');
const CrudRecord = require('./CrudRecord');

function DeleteRecord1(appDb, params, options = {}) {
    // ensure a new instance is returned, if constructor function is called without new
    if (typeof new.target === 'undefined') {
        return new DeleteRecord(appDb, params, options);
    }
    // options / defaults
    const serviceColl = options && options.serviceColl ? options.serviceColl : 'services';
    const auditColl   = options && options.auditColl ? options.auditColl : 'audits';
    const accessColl  = options && options.accessColl ? options.accessColl : 'accessKeys';
    const userColl    = options && options.userColl ? options.userColl : 'users';
    const roleColl    = options && options.roleColl ? options.roleColl : 'roles';

    // params: {coll(string), docId[], queryParams{}, token(string), userInfo{}, parentColl[], childColl[]}
    this.paramItems    = {
        coll           : params && params.coll && typeof params.coll === 'string' ? params.coll : '',
        docId          : params && params.docId ? params.docId : [], // array
        queryParams    : params && params.queryParams ? params.queryParams : {}, // object, optional
        token          : params && params.token ? params.token : '',
        userInfo       : params && params.userInfo ? params.userInfo : '',
        parentColl     : params && params.parentColl || [],
        childColl      : params && params.childColl || [],
        recursiveDelete: params && params.recursiveDelete || false,
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
    this.logDelete     = options && options.logDelete && (typeof options.logDelete === 'boolean') ?
                         options.logDelete : false;
    this.mcMessages    = options && options.mcMessages && (typeof options.mcMessages === 'object') ?
                         options.mcMessages : mcMessages;

    this.transLog = TransLog(this.auditDb, {
        auditColl,
        messages     : this.mcMessages,
        maxQueryLimit: this.maxQueryLimit,
    });
}

DeleteRecord1.prototype.deleteRecord = async function () {
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

    const errors = validateRecord.validateDeleteRecord(this.paramItems);
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

    // for queryParams, exclude _id, if present
    if (this.paramItems.queryParams && Object.keys(this.paramItems.queryParams).length > 0) {
        const {_id, ...otherParams} = this.paramItems.queryParams;
        this.paramItems.queryParams = otherParams;
    }

    // Delete operations: db-connection and db-collection variables/handles
    let db, col;
    // delete / remove item(s) by docId(s)
    if (this.paramItems.docId.length === 1) {
        try {
            // use / activate database
            db  = await this.dbConnect();
            col = db.collection(this.paramItems.coll);

            // id(s): convert id of value string type to ObjectId
            this.paramItems.docId = this.paramItems.docId ? this.paramItems.docId.map(id => ObjectId(id)) : [];

            // check / get currentRecord for audit-log
            const currentRecord = await col.findOne({
                _id: this.paramItems.docId[0]
            });

            if (!currentRecord || Object.keys(currentRecord).length < 1) {
                return getResMessage('notFound');
            }

            // determine permission (by admin or role)
            const rolePermitted = await this.paramItems.docId.every(id => {
                // check roleServices permission (canDelete):
                return roleServices.some(role => (role.service === id && role.canDelete));
            });

            const taskPermitted = rolePermitted || isAdmin;
            if (!taskPermitted) return getResMessage('unAuthorized', {
                message: 'You are not authorized to delete/remove the specified item/record',
            });

            // same collection referential integrity check
            // Check if current record contains at least a sub-item to determine if remove is permissible
            const docWithSubItems = await col.findOne({
                parentId: this.paramItems.docId[0]
            });

            if (docWithSubItems && Object.keys(docWithSubItems).length > 0) {
                return getResMessage('subItems', {
                    message: "A record that includes sub-items cannot be deleted. Delete/remove the sub-items first.",
                });
            }

            // parent-child referential integrity checks
            // required-inputs: parent/child-collections and current item-id/item-name
            let subItems = [];
            if (this.paramItems.childColl.length > 0) {
                // prevent item delete, if child-collection-items reference itemId
                await this.paramItems.childColl.forEach(async (collName) => {
                    const col      = await db.collection(collName);
                    const collItem = await col.findOne({
                        parentId: {
                            $in: this.paramItems.docId
                        }
                    });
                    if (collItem) {
                        subItems.push(true);
                    }
                });

                if (subItems.length > 0) {
                    return getResMessage('subItems', {
                        message: 'A record that includes sub-items cannot be deleted. Delete/remove the sub-items first.',
                    });
                }
            }

            // delete record and log in audit-collection
            const removed = await col.deleteOne({
                _id: this.paramItems.docId[0]
            });

            if (removed.result.ok) {
                // delete cache
                await cacheHash.deleteCache(this.paramItems.coll);
                // check the audit-log settings - to perform audit-log
                if (this.logDelete) {
                    await this.transLog.deleteLog(this.paramItems.coll, currentRecord, userId);
                }
                return getResMessage('success', {
                    message: 'Item/record deleted successfully',
                    value  : {
                        docId: Number(removed.result.n),
                    }
                });
            }
        } catch (error) {
            return getResMessage('removeError', {
                message: error.message,
            });
        }
    }

    if (this.paramItems.docId.length > 1) {
        try {
            // use / activate database
            db  = await this.dbConnect();
            col = db.collection(this.paramItems.coll);

            // id(s): convert string to ObjectId
            this.paramItems.docId = this.paramItems.docId ? this.paramItems.docId.map(id => ObjectId(id)) : [];

            // check / get currentRecords for audit-log
            const currentRecords = await col.find({_id: {$in: this.paramItems.docId}}).toArray();
            if (currentRecords.length < 1) {
                return getResMessage('notFound');
            }

            // determine permission by userId/owner, role-assignment(canUpdate) or admin
            const rolePermitted = await this.paramItems.docId.every(id => {
                // check roleServices permission (canDelete):
                return roleServices.some(role => role.service === id && role.canDelete);
            });

            const taskPermitted = rolePermitted || isAdmin;
            if (!taskPermitted) {
                return getResMessage('unAuthorized', {
                    message: 'You are not authorized to delete/remove the specified items/records',
                });
            }

            // same collection referential integrity checks
            // check if any/some of the current records contain at least a sub-item
            const docWithSubItems = await col.findOne({
                parentId: {
                    $in: this.paramItems.docId
                }
            });

            if (docWithSubItems) {
                return getResMessage('subItems', {
                    message: 'A record that includes sub-items cannot be deleted. Delete/remove the sub-items first.',
                });
            }

            // parent-child referential integrity checks
            // required-inputs: parent/child-collections and current item-id/item-name
            let subItems = [];
            if (this.paramItems.childColl.length > 0) {
                // prevent item delete, if child-collection-items reference itemId
                await this.paramItems.childColl.forEach(async (collName) => {
                    const col      = await db.collection(collName);
                    const collItem = await col.findOne({
                        parentId: {
                            $in: this.paramItems.docId
                        }
                    });
                    if (collItem) {
                        subItems.push(true);
                    }
                });

                if (subItems.length > 0) {
                    return getResMessage('subItems', {
                        message: 'A record that includes sub-items cannot be deleted. Delete/remove the sub-items first.',
                    });
                }
            }

            // delete record(s) and log in audit-collection
            const removed = await col.deleteMany({
                _id: {
                    $in: this.paramItems.docId
                }
            });
            if (removed.result.ok) {
                // delete cache
                await cacheHash.deleteCache(this.paramItems.coll);
                // check the audit-log settings - to perform audit-log
                if (this.logDelete) {
                    await this.transLog.deleteLog(this.paramItems.coll, currentRecords, userId);
                }
                return getResMessage('success', {
                    message: 'Item/record deleted successfully',
                    value  : {
                        docId: Number(removed.result.n),
                    }
                });
            }
        } catch (error) {
            return getResMessage('removeError', {
                message: error.message,
            });
        }
    }

    // delete by queryParams, for admin-user only
    if (Object.keys(this.paramItems.queryParams).length > 0 && isAdmin) {
        try {
            // use / activate database
            db  = await this.dbConnect();
            col = db.collection(this.paramItems.coll);

            // check / get currentRecords for audit-log
            let currentRecords = await col.find(this.paramItems.queryParams).toArray();
            if (currentRecords.length < 1) {
                return getResMessage('notFound');
            }

            // re-validate admin-role, redundant
            if (!isAdmin) {
                return getResMessage('unAuthorized', {
                    message: 'You are not authorized to delete record(s)',
                });
            }

            // ids of records to be deleted
            let docIds = [];
            currentRecords.forEach(item => {
                docIds.push(item._id);
            });

            // Check if any/some of the current records contain at least a sub-item
            const docWithSubItems = await col.findOne({
                parentId: {
                    $in: docIds
                }
            });

            if (docWithSubItems) {
                return getResMessage('subItems', {
                    message: 'A record that includes sub-items cannot be deleted. Delete/remove the sub-items first.',
                });
            }

            // console.log('delete-doc-ids-2: ', docIds);
            // parent-child referential integrity checks
            // required-inputs: parent/child-collections and current item-id/item-name
            let subItems = [];
            if (this.paramItems.childColl.length > 0) {
                // prevent item delete, if child-collection-items reference itemId
                await this.paramItems.childColl.forEach(async (collName) => {
                    // console.log('child-coll-name: ', collName);
                    // console.log('sub-item-1: ', subItems);
                    const col      = await db.collection(collName);
                    const collItem = await col.findOne({
                        parentId: {
                            $in: docIds
                        }
                    });
                    if (collItem) {
                        subItems.push(true);
                    }
                });

                // console.log('sub-items-2: ', subItems);
                if (subItems.length > 0) {
                    return getResMessage('subItems', {
                        message: '***A record that includes sub-items cannot be deleted. Delete/remove the sub-items first.',
                    });
                }
            }

            // delete records and log in audit-collection
            const removed = await col.deleteMany({
                _id: {
                    $in: docIds
                }
            });
            if (removed.result.ok) {
                // delete cache
                await cacheHash.deleteCache(this.paramItems.coll);
                // check the audit-log settings - to perform audit-log
                if (this.logDelete) await this.transLog.deleteLog(this.paramItems.coll, currentRecords, userId);
                return getResMessage('success', {
                    message: 'Item(s)/record(s) deleted successfully',
                    value  : {
                        docId: Number(removed.result.n),
                    }
                });
            }
        } catch (error) {
            return getResMessage('removeError', {
                message: error.message,
            });
        }
    }

    // could not remove document
    return getResMessage('removeError', {
        message: 'Unable to perform the requested action(s).',
    });
};

class DeleteRecord extends CrudRecord{
    constructor(appDb, params, options = {}) {
        super(appDb, params, options );

        // CRUD instance variables
        this.docIds      = [];
        this.currentRecs = [];
    }

    async deleteRecord() {
        const validateRecord = ValidateCrud({messages: this.mcMessages});

        const errors = validateRecord.validateDeleteRecord(this.paramItems);
        if (Object.keys(errors).length > 0) {
            return getParamsMessage(errors);
        }

        // validate current user active status: by token and loginRequired status
        if (this.loginRequired && !this.paramItems.token) {
            return getResMessage('unAuthorized');
        }

        if (this.paramItems.queryParams && Object.keys(this.paramItems.queryParams).length > 0) {
            const {_id, ...otherParams} = this.paramItems.queryParams; // exclude _id, if present
            this.paramItems.queryParams = otherParams;
        }

        // delete / remove item(s) by docId(s)
        if (this.paramItems.docId.length >= 1) {
            try {
                return new Promise(async (resolve) => {
                    // check if records exist, for delete and audit-log
                    const recExist = await this.getCurrentRecord();
                    if (!(recExist.code === 'success')) {
                        resolve(recExist);
                    }

                    // sub-items integrity check, same collection
                    const subItem = await this.checkSubItem();
                    if (!(subItem.code === 'success')) {
                        resolve(subItem);
                    }

                    // parent-child integrity check, multiple collections
                    const refIntegrity = await this.checkRefIntegrity();
                    if (!(refIntegrity.code === 'success')) {
                        resolve(refIntegrity);
                    }

                    // delete/remove records
                    const removeRec = await this.removeRecord();
                    resolve(removeRec);
                });
            } catch (error) {
                return getResMessage('removeError', {
                    message: error.message ? error.message : 'Error removing record(s)',
                });
            }
        }

        // optional...
        const isAdmin = this.paramItems.isAdmin;
        if (Object.keys(this.paramItems.queryParams).length && isAdmin) {
            try {
                return new Promise(async (resolve) => {
                    // check if records exist, for delete and audit-log
                    const recExist = await this.getCurrentRecordByParams();
                    if (!(recExist.code === 'success')) {
                        resolve(recExist);
                    }

                    // sub-items integrity check, same collection
                    const subItem = await this.checkSubItemByParams();
                    if (!(subItem.code === 'success')) {
                        resolve(subItem);
                    }

                    // parent-child integrity check, multiple collections
                    const refIntegrity = await this.checkRefIntegrityByParams();
                    if (!(refIntegrity.code === 'success')) {
                        resolve(refIntegrity);
                    }

                    // delete/remove records
                    const removeRec = await this.removeRecordByParams();
                    resolve(removeRec);
                });

            } catch (error) {
                return getResMessage('removeError', {
                    message: error.message,
                });
            }
        }

        // could not remove document
        return getResMessage('removeError', {
            message: 'Unable to perform the requested action(s).',
        });
    }

    async getCurrentRecord() {
        // current records, prior to update, for audit-log
        return new Promise((resolve) => {
            this.coll.find({_id: {$in: this.paramItems.docId}}, (err, currentRecords) => {
                console.log('get-current-records');
                this.currentRecs = currentRecords;
                if (err) {
                    resolve(getResMessage('removeError', {
                        message: "Error removing the requested record(s).",
                        value  : err,
                    }));
                } else if (currentRecords && Array.isArray(currentRecords) && currentRecords.length < 1) {
                    resolve(getResMessage('removeError', {
                        message: "Record(s) requested for removal, not found.",
                    }));
                } else {
                    resolve(getResMessage('success', {
                        message: 'record exists for update',
                    }));
                }
            });
        });
    }

    async getCurrentRecordByParams() {
        // current records, prior to update, for audit-log
        return new Promise((resolve) => {
            this.coll.find(this.paramItems.queryParams, (err, currentRecords) => {
                console.log('get-current-records');
                this.currentRecs = currentRecords;
                if (err) {
                    resolve(getResMessage('removeError', {
                        message: "Error removing the requested record(s).",
                        value  : err,
                    }));
                } else if (currentRecords && Array.isArray(currentRecords) && currentRecords.length < 1) {
                    resolve(getResMessage('updateError', {
                        message: "Record(s) requested for removal, not found.",
                    }));
                } else {
                    resolve(getResMessage('success', {
                        message: 'record exists for update',
                    }));
                }
            });
        });
    }

    async checkSubItem() {
        // same collection referential integrity checks
        // check if any/some of the current records contain at least a sub-item
        return new Promise((resolve) => {
            this.coll.find({
                parentId: {
                    $in: this.paramItems.docId
                }
            }, (err, docWithSubItems) => {
                console.log('subItem-ref-integrity');
                if (err) {
                    resolve(getResMessage('removeError', {value: err}));
                } else if (docWithSubItems && Array.isArray(docWithSubItems) && docWithSubItems.length) {
                    resolve(getResMessage('subItems', {
                        message: `A record that contains sub-items cannot be deleted. Delete/remove the sub-items [from ${this.paramItems.coll} collection] first.`,
                    }));
                } else {
                    resolve(getResMessage('success', {
                        message: 'no data integrity issue',
                    }));
                }
            });
        });
    }

    async checkSubItemByParams() {
        // same collection referential integrity checks
        // check if any/some of the current records contain at least a sub-item
        return new Promise((resolve) => {
            // ids of records to be deleted
            this.currentRecs.forEach(item => {
                this.docIds.push(item._id);
            });
            this.coll.find({
                parentId: {
                    $in: this.docIds
                }
            }, (err, docWithSubItems) => {
                console.log('subItem-ref-integrity');
                if (err) {
                    resolve(getResMessage('removeError', {value: err}));
                } else if (docWithSubItems && Array.isArray(docWithSubItems) && docWithSubItems.length) {
                    resolve(getResMessage('subItems', {
                        message: `A record that contains sub-items cannot be deleted. Delete/remove the sub-items [from ${this.paramItems.coll} collection] first.`,
                    }));
                } else {
                    resolve(getResMessage('success', {
                        message: 'no data integrity issue',
                    }));
                }
            });
        });
    }

    async checkRefIntegrity() {
        // parent-child referential integrity checks
        // required-inputs: parent/child-collections and current item-id/item-name
        return new Promise((resolve) => {
            if (this.paramItems.childColl.length > 0) {
                console.log('parent-child-ref-integrity');
                for (const pId of this.paramItems.docId) {
                    // prevent item delete, if child-collection-items reference itemId
                    const childExist = this.paramItems.childColl.some((collName) => {
                        const col = mcDb[collName];
                        col.find({
                            parentId: pId
                        }, (err, subItem) => {
                            return (!err && Array.isArray(subItem) && subItem.length);
                        });
                    });
                    if (childExist) {
                        resolve(getResMessage('subItems', {
                            message: `A record that contains sub-items cannot be deleted. Delete/remove the sub-items [from ${this.paramItems.childColl.join(', ')} collection(s)], first.`,
                        }));
                    } else {
                        resolve(getResMessage('success', {
                            message: 'no data integrity issue',
                        }));
                    }
                }
            } else {
                resolve(getResMessage('success', {
                    message: 'no data integrity issue',
                }));
            }
        });
    }

    async checkRefIntegrityByParams() {
        // parent-child referential integrity checks
        // required-inputs: parent/child-collections and current item-id/item-name
        return new Promise((resolve) => {
            // ids of records to be deleted
            this.currentRecs.forEach(item => {
                this.docIds.push(item._id);
            });
            if (this.paramItems.childColl.length > 0) {
                console.log('parent-child-ref-integrity');
                for (const pId of this.docIds) {
                    // prevent item delete, if child-collection-items reference itemId
                    const childExist = this.paramItems.childColl.some((collName) => {
                        const col = mcDb[collName];
                        col.find({
                            parentId: pId
                        }, (err, subItem) => {
                            return (!err && Array.isArray(subItem) && subItem.length);
                        });
                    });
                    if (childExist) {
                        resolve(getResMessage('subItems', {
                            message: `A record that contains sub-items cannot be deleted. Delete/remove the sub-items [from ${this.paramItems.childColl.join(', ')} collection(s)], first.`,
                        }));
                    } else {
                        resolve(getResMessage('success', {
                            message: 'no data integrity issue',
                        }));
                    }
                }
            } else {
                resolve(getResMessage('success', {
                    message: 'no data integrity issue',
                }));
            }
        });
    }

    async removeRecord() {
        // delete/remove records and log in audit
        return new Promise(async (resolve) => {
            try {
                // delete record(s) and log in audit-collection
                let removeCount = 0;
                // remove record
                this.coll.remove({_id: {$in: this.paramItems.docId}}, {multi: true}, async (err, numRemoved) => {
                    console.log('remove-task-1');
                    if (err) {
                        resolve(getResMessage('removeError', {value: err}));
                    }
                    if (numRemoved > 0) {
                        removeCount += numRemoved;
                    }
                    if (removeCount === this.paramItems.docId.length) {
                        console.log('remove-task-2');
                        if (removeCount > 0) {
                            // clear cache
                            await cacheHash.deleteCache(this.paramItems.coll);
                            // check the audit-log settings - to perform audit-log
                            if (this.logDelete) await this.transLog.deleteLog(this.paramItems.coll, this.currentRecs, this.userId);

                            resolve(getResMessage('success', {
                                message: 'Item(s)/record(s) deleted successfully',
                                value  : {
                                    docId: this.paramItems.docId,
                                    removeCount,
                                }
                            }));
                        }
                    } else {
                        resolve(getResMessage('removeError', {
                            message: 'Error removing/deleting record(s)',
                        }));
                    }
                });
            } catch (e) {
                resolve(getResMessage('removeError', {
                    message: `Error removing/deleting record(s): ${e.message ? e.message : ""}`,
                    value  : e,
                }));
            }
        });
    }

    async removeRecordByParams() {
        // insert/create multiple records and log in audit
        return new Promise(async (resolve) => {
            try {
                // delete/remove record(s) and log in audit-collection
                let removeCount = 0;
                this.coll.remove(this.paramItems.queryParams, {multi: true}, async (err, numRemoved) => {
                    console.log('remove-task-1');
                    if (err) {
                        resolve(getResMessage('removeError', {value: err}));
                    }
                    if (numRemoved > 0) {
                        removeCount += numRemoved;
                    }
                    if (removeCount === this.paramItems.docId.length) {
                        console.log('remove-task-2');
                        if (removeCount > 0) {
                            // clear cache
                            await cacheHash.deleteCache(this.paramItems.coll);
                            // check the audit-log settings - to perform audit-log
                            if (this.logDelete) await this.transLog.deleteLog(this.paramItems.coll, this.currentRecs, this.userId);

                            resolve(getResMessage('success', {
                                message: 'Item(s)/record(s) deleted successfully',
                                value  : {
                                    docId: this.paramItems.docId,
                                    removeCount,
                                }
                            }));
                        }
                    } else {
                        resolve(getResMessage('removeError', {
                            message: 'Error removing/deleting record(s)',
                        }));
                    }
                });
            } catch (e) {
                resolve(getResMessage('removeError', {
                    message: `Error removing/deleting record(s): ${e.message ? e.message : ""}`,
                    value  : e,
                }));
            }
        });
    }
}

function newDeleteRecord(collName, params, options = {}) {
    return new DeleteRecord(collName, params, options);
}

module.exports = {DeleteRecord, newDeleteRecord};
