/**
 * @Author: abbeymart | Abi Akindele | @Created: 2020-04-05 | @Updated: 2020-04-24
 * Updated 2018-04-08, prototype-to-class
 * @Company: mConnect.biz | @License: MIT
 * @Description: delete one or more records / documents
 */

// Import required module/function(s)
const ObjectId           = require('mongodb').ObjectID;
const {getResMessage}    = require('@mconnect/res-messages');
const {getParamsMessage} = require('@mconnect/utils')();
const {cacheHash}        = require('@mconnect/cache');
const {ValidateCrud}     = require('@mconnect/validate-crud');

const {checkDb}   = require('./common/crudHelpers');
const checkAccess = require('./common/checkAccess');
const CrudRecord  = require('./CrudRecord');

class DeleteRecord extends CrudRecord {
    constructor(appDb, params, options = {}) {
        super(appDb, params, options);

        // CRUD instance variables
        this.db          = null;
        this.coll        = null;
        this.userId      = '';
        this.isAdmin     = false;
        this.docIds      = [];
        this.currentRecs = [];
        this.subItems    = [];
    }

    async deleteRecord() {
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

        // user-active-status
        if (!(userActive && userId)) {
            return getResMessage('unAuthorized');
        }

        // for queryParams, exclude _id, if present
        if (this.paramItems.queryParams && Object.keys(this.paramItems.queryParams).length > 0) {
            const {_id, ...otherParams} = this.paramItems.queryParams;
            this.paramItems.queryParams = otherParams;
        }

        // delete / remove item(s) by docId(s)
        if (this.paramItems.docId.length >= 1) {
            try {
                // use / activate database
                this.db   = await this.dbConnect();
                this.coll = db.collection(this.paramItems.coll);

                // id(s): convert string to ObjectId
                this.docIds = this.paramItems.docId.length > 0 ? this.paramItems.docId.map(id => ObjectId(id)) : [];

                return new Promise(async (resolve) => {
                    // check if records exist, for delete and audit-log
                    const recExist = await this.getCurrentRecord();
                    if (!(recExist.code === 'success')) {
                        resolve(recExist);
                    }

                    // check permission
                    const taskPermitted = await this.taskPermitted();
                    if (!(taskPermitted.code === 'success')) {
                        resolve(taskPermitted);
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

        // delete by role assignment, ownership? or admin
        if (Object.keys(this.paramItems.queryParams).length && isAdmin) {
            try {
                // use / activate database
                this.db   = await this.dbConnect();
                this.coll = db.collection(this.paramItems.coll);

                return new Promise(async (resolve) => {
                    // check if records exist, for delete and audit-log
                    const recExist = await this.getCurrentRecordByParams();
                    if (!(recExist.code === 'success')) {
                        resolve(recExist);
                    }

                    // check permission
                    const taskPermitted = await this.taskPermittedByParams();
                    if (!(taskPermitted.code === 'success')) {
                        resolve(taskPermitted);
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
                    const removeRec = await this.removeRecord();
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

    async checkRecExist() {
        // check if items/records exist: uniqueness
        return new Promise(async (resolve) => {
            for (const existItem of this.paramItems.existParams) {
                let recordExist = await this.coll.findOne(existItem);
                if (recordExist) {
                    this.isRecExist = true;
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

    async getCurrentRecord() {
        // current records, prior to update, for audit-log
        return new Promise(async (resolve) => {
            // current records, prior to update
            const currentRecords = await col.find({
                _id: {
                    $in: docIds
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
            const currentRecords = await col.find(this.paramItems.queryParams).toArray();
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

    async taskPermitted() {
        return new Promise(async (resolve) => {
            // determine permission by userId/owner, role-assignment(canUpdate) or admin
            // collection level permission
            const serviceColl = this.db.collection(this.serviceColl);
            const collInfo    = await serviceColl.find({
                name: {$or: [this.paramItems.coll.toLowerCase(), (this.paramItems.coll[0].toUpperCase() + this.paramItems.coll.slice(1).toLowerCase())]},
                type: "Collection"
            });

            let rolePermitted = false;
            if (this.docIds.length) {
                rolePermitted = await this.docIds.every(id => {
                    // check roleServices permission (canDelete):
                    return this.roleServices.some(role => {
                        return ((role.service === id || role.service === (collInfo ? collInfo._id : '')) && role.canDelete);
                    })
                });
            }

            // permit task, by owner, role or admin only
            const taskPermitted = await this.currentRecords.every(item => {
                return (item.createdBy.toString() === this.userId.toString());
            }) || rolePermitted || this.isAdmin;

            if (!taskPermitted) {
                return getResMessage('unAuthorized', {
                    message: 'You are not authorized to perform the requested action/task',
                });
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
            // ids of records to be deleted, from queryParams
            this.docIds = [];           // reset docIds instance value
            this.currentRecords.forEach(item => {
                this.docIds.push(item._id);
            });
            resolve(await this.taskPermitted());
        });
    }

    async checkSubItem() {
        // same collection referential integrity checks
        // check if any/some of the current records contain at least a sub-item
        return new Promise(async (resolve) => {
            // same collection referential integrity checks
            // check if any/some of the current records contain at least a sub-item
            const docWithSubItems = await this.coll.findOne({
                parentId: {
                    $in: this.docIds
                }
            });

            if (docWithSubItems) {
                resolve(getResMessage('subItems', {
                    message: 'A record that includes sub-items cannot be deleted. Delete/remove the sub-items first.',
                }));
            } else {
                resolve(getResMessage('success', {
                    message: 'no data integrity issue',
                }));
            }
        });
    }

    async checkSubItemByParams() {
        // same collection referential integrity checks
        // check if any/some of the current records contain at least a sub-item
        return new Promise(async (resolve) => {
            // ids of records to be deleted
            this.docIds = [];           // reset docIds instance value
            this.currentRecs.forEach(item => {
                this.docIds.push(item._id);
            });
            resolve(await this.checkSubItem());
        });
    }

    async checkRefIntegrity() {
        // parent-child referential integrity checks
        // required-inputs: parent/child-collections and current item-id/item-name
        return new Promise(async (resolve) => {
            if (this.paramItems.childColl.length > 0 && this.docIds.length > 0) {
                for (const pId of this.docIds) {
                    // prevent item delete, if child-collection-items reference itemId
                    const childExist = this.paramItems.childColl.some(async (collName) => {
                        const col      = await this.db.collection(collName);
                        const collItem = await col.findOne({
                            parentId: {
                                $in: this.docIds
                            }
                        });
                        if (collItem) {
                            this.subItems.push(true);
                        }
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
        return new Promise(async (resolve) => {
            // ids of records to be deleted
            this.docIds = [];           // reset docIds instance value
            this.currentRecs.forEach(item => {
                this.docIds.push(item._id);
            });
            resolve(await this.checkRefIntegrity());
        });
    }

    async removeRecord() {
        // delete/remove records and log in audit
        return new Promise(async (resolve) => {
            try {
                // delete/remove record(s) and log in audit-collection
                const removed = await col.deleteMany({
                    _id: {
                        $in: this.docIds
                    }
                });
                if (removed.result.ok) {
                    // delete cache
                    await cacheHash.deleteCache(this.paramItems.coll);
                    // check the audit-log settings - to perform audit-log
                    if (this.logDelete) {
                        await this.transLog.deleteLog(this.paramItems.coll, this.currentRecords, this.userId);
                    }
                    resolve(getResMessage('success', {
                        message: 'Item/record deleted successfully',
                        value  : {
                            docId: Number(removed.result.n),
                        }
                    }));
                }
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
