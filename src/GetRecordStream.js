/**
 * @Author: abbeymart | Abi Akindele | @Created: 2017-01-09 | @Updated: 2020-04-05
 * @Company: mConnect.biz | @License: MIT
 * @Description: Get/stream records, by params, by role / by userId
 */

// Import required module(s)
const ObjectId           = require('mongodb').ObjectID;
const {getResMessage}    = require('@mconnect/res-messages');
const {ValidateCrud}     = require('@mconnect/validate-crud');
const {getParamsMessage} = require('@mconnect/utils')();
const checkAccess        = require('./common/checkAccess');
const {checkDb}          = require('./common/crudHelpers');

class GetRecordStream extends GetAllRecord {
    constructor(appDb, params, options = {}) {
        super(appDb, params, options);
    }

    async getRecordStream() {
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

        const errors = validateRecord.validateGetRecord(this.paramItems);
        if (Object.keys(errors).length > 0) {
            return getParamsMessage(errors);
        }

        // set maximum limit and default values per query
        if (this.paramItems.limit > this.maxQueryLimit) this.paramItems.limit = this.maxQueryLimit;
        if (this.paramItems.limit < 1) this.paramItems.limit = 1;
        if (this.paramItems.skip < 0) this.paramItems.skip = 0;

        // validate current user status: by token or userInfo/loggedIn-status
        let userActive   = false,
            userId       = '',
            isAdmin      = false,
            userRole     = '',
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
            userRole     = userStatus.value.userRole;
            roleServices = userStatus.value.roleServices;
        }

        // user-active-status
        if (!(userActive && userId)) {
            return getResMessage('unAuthorized');
        }

        // check the audit-log settings - to perform audit-log (read/search info - params, keywords etc.)
        if (this.logRead && Object.keys(this.paramItems.queryParams).length > 0) {
            await this.transLog.readLog(this.paramItems.coll, this.paramItems.queryParams, userId);
        }

        // get items for three scenarios => admin (all-records) | by-roles | by-userId
        // define db-client-handle and result variables
        let db, col;

        // id(s): convert string-id to ObjectId
        this.paramItems.docId = this.paramItems.docId ? this.paramItems.docId.map(id => ObjectId(id)) : [];
        // exclude _id, if present, from the queryParams
        if (this.paramItems.queryParams && Object.keys(this.paramItems.queryParams).length > 0) {
            const {_id, ...otherParams} = this.paramItems.queryParams; // exclude _id, if present
            this.paramItems.queryParams = otherParams;
        }

        // get items/records by adminRole | isAdmin determined from the server-side
        if (userActive && userId && isAdmin) {
            // Get the item(s) by docId(s) or queryParams
            if (this.paramItems.docId && this.paramItems.docId.length === 1) {
                try {
                    // use / activate database || not necessary for streaming (included for completeness only)
                    db  = await this.dbConnect();
                    col = db.collection(this.paramItems.coll);

                    return await col.findOne({_id: this.paramItems.docId[0]}, this.paramItems.projectParams)
                        .stream({
                            transform: function (doc) {
                                return [doc];
                            }
                        });
                } catch (error) {
                    throw new Error(`notFound: ${error.message}`);
                }
            }
            if (this.paramItems.docId && this.paramItems.docId.length > 1) {
                try {
                    // use / activate database
                    db  = await this.dbConnect();
                    col = db.collection(this.paramItems.coll);

                    return await col.find({_id: {$in: this.paramItems.docId}})
                        .skip(this.paramItems.skip)
                        .limit(this.paramItems.limit)
                        .project(this.paramItems.projectParams)
                        .sort(this.paramItems.sortParams)
                        .stream();
                } catch (error) {
                    throw new Error(`notFound: ${error.message}`);
                }
            }
            if (Object.keys(this.paramItems.queryParams).length > 0) {
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
            // get all records, up to the permissible limit
            try {
                // use / activate database
                db  = await this.dbConnect();
                col = db.collection(this.paramItems.coll);

                return await col.find({})
                    .skip(this.paramItems.skip)
                    .limit(this.paramItems.limit)
                    .project(this.paramItems.projectParams)
                    .sort(this.paramItems.sortParams)
                    .stream();
            } catch (error) {
                throw new Error(`notFound: ${error.message}`);
            }
        }

        // get items by userRole/assigned/granted items
        if (userActive && userRole && roleServices.length > 0 && this.paramItems.coll === this.serviceColl) {
            // TODO: apply to all collections/functions, post grant/roles/users collections' update
            // Get the item(s) by docId(s) or queryParams
            if (this.paramItems.docId && this.paramItems.docId.length === 1) {
                try {
                    // use / activate database || not necessary for streaming (included for completeness only)
                    db  = await this.dbConnect();
                    col = db.collection(this.paramItems.coll);

                    // extract service-IDs from roleServices
                    roleServices = roleServices.map(item => item.service);
                    // check if the docId is in the list of role-services
                    const hasId  = roleServices.includes(this.paramItems.docId[0]);
                    if (hasId) {
                        return await col.findOne({_id: this.paramItems.docId[0]}, this.paramItems.projectParams)
                            .stream({
                                transform: function (doc) {
                                    return [doc];
                                }
                            });
                    }
                } catch (error) {
                    throw new Error(`notFound: ${error.message}`);
                }
            }
            if (this.paramItems.docId && this.paramItems.docId.length > 1) {
                try {
                    // use / activate database
                    db  = await this.dbConnect();
                    col = db.collection(this.paramItems.coll);

                    // extract service-IDs from roleServices
                    roleServices = roleServices.map(item => item.service);

                    // check/extract this.paramItems docId(s) in the list of roleServices
                    this.paramItems.docId = this.paramItems.docId.map(item => roleServices.includes(item));

                    // perform query
                    return await col.find({_id: {$in: this.paramItems.docId}})
                        .skip(this.paramItems.skip)
                        .limit(this.paramItems.limit)
                        .project(this.paramItems.projectParams)
                        .sort(this.paramItems.sortParams)
                        .stream();
                } catch (error) {
                    throw new Error(`notFound: ${error.message}`);
                }
            }
            if (Object.keys(this.paramItems.queryParams).length > 0) {
                try {
                    // use / activate database
                    db  = await this.dbConnect();
                    col = db.collection(this.paramItems.coll);

                    // consider role-based-items
                    // extract service-IDs from roleServices
                    roleServices = roleServices.map(item => item.service);

                    // updated queryParams
                    this.paramItems.queryParams._id.$in = roleServices;
                    // this.paramItems.queryParams['_id'] = {$in: roleServices};

                    // perform query
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
            // get all records, permissible by roleServices
            try {
                // use / activate database
                db  = await this.dbConnect();
                col = db.collection(this.paramItems.coll);

                // consider role-based-items
                // extract service-IDs from roleServices
                roleServices = roleServices.map(item => item.service);
                // perform query
                return await col.find({_id: {$in: roleServices}})
                    .skip(this.paramItems.skip)
                    .limit(this.paramItems.limit)
                    .project(this.paramItems.projectParams)
                    .sort(this.paramItems.sortParams)
                    .stream();
            } catch (error) {
                throw new Error(`notFound: ${error.message}`);
            }
        }

        // get items(s) by userId, by docId(s)/queryParams
        if (this.paramItems.docId && this.paramItems.docId.length === 1) {
            try {
                // use / activate database || not necessary for streaming (included for completeness only)
                db  = await this.dbConnect();
                col = db.collection(this.paramItems.coll);

                return await col.findOne({
                    _id      : this.paramItems.docId[0],
                    createdBy: userId
                }, this.paramItems.projectParams)
                    .stream({
                        transform: function (doc) {
                            return [doc];
                        }
                    });
            } catch (error) {
                throw new Error(`notFound: ${error.message}`);
            }
        }
        if (this.paramItems.docId && this.paramItems.docId.length > 1) {
            try {
                // use / activate database
                db  = await this.dbConnect();
                col = db.collection(this.paramItems.coll);

                return await col.find({_id: {$in: this.paramItems.docId}, createdBy: userId})
                    .skip(this.paramItems.skip)
                    .limit(this.paramItems.limit)
                    .project(this.paramItems.projectParams)
                    .sort(this.paramItems.sortParams)
                    .stream();
            } catch (error) {
                throw new Error(`notFound: ${error.message}`);
            }
        }
        if (Object.keys(this.paramItems.queryParams).length > 0) {
            try {
                // use / activate database
                db  = await this.dbConnect();
                col = db.collection(this.paramItems.coll);

                // consider user-owned-items
                this.paramItems.queryParams['createdBy'] = userId;

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
        // get all records, by userId
        try {
            // use / activate database
            db  = await this.dbConnect();
            col = db.collection(this.paramItems.coll);

            return await col.find({createdBy: userId})
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

function newGetRecordStream(appDb, params, options = {}) {
    return new GetRecordStream(appDb, params, options);
}

module.exports = {GetRecordStream, newGetRecordStream};
