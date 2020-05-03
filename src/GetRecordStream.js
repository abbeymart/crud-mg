/**
 * @Author: abbeymart | Abi Akindele | @Created: 2017-01-09 | @Updated: 2020-05-03
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
const CrudRecord         = require('./CrudRecord');

class GetRecordStream extends CrudRecord {
    constructor(appDb, params, options = {}) {
        super(appDb, params, options);

        this.db                  = null;
        this.coll                = null;
        this.userId              = '';
        this.isAdmin             = false;
        this.docIds              = [];
        this.roleServices        = [];
        this.actionAuthorized    = false;
        this.unAuthorizedMessage = 'You are not authorized to perform the requested action/task';
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
            // userRole     = '',
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
            // userRole     = userStatus.value.userRole;
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

        // check the audit-log settings - to perform audit-log (read/search info - params, keywords etc.)
        if (this.logRead && Object.keys(this.paramItems.queryParams).length > 0) {
            await this.transLog.readLog(this.paramItems.coll, this.paramItems.queryParams, userId);
        }

        // get items for three scenarios => admin (all-records) | by-roles | by-userId

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
                    this.db   = await this.dbConnect();
                    this.coll = this.db.collection(this.paramItems.coll);

                    return await this.coll.findOne({_id: this.paramItems.docId[0]}, this.paramItems.projectParams)
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
                    this.db   = await this.dbConnect();
                    this.coll = this.db.collection(this.paramItems.coll);

                    return await this.coll.find({_id: {$in: this.paramItems.docId}})
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
                    this.db   = await this.dbConnect();
                    this.coll = this.db.collection(this.paramItems.coll);

                    return await this.coll.find(this.paramItems.queryParams)
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
                this.db   = await this.dbConnect();
                this.coll = this.db.collection(this.paramItems.coll);

                return await this.coll.find({})
                    .skip(this.paramItems.skip)
                    .limit(this.paramItems.limit)
                    .project(this.paramItems.projectParams)
                    .sort(this.paramItems.sortParams)
                    .stream();
            } catch (error) {
                throw new Error(`notFound: ${error.message}`);
            }
        }

        // get items by userRole
        await this.taskPermitted();
        if (userActive && this.actionAuthorized) {
            // Get the item(s) by docId(s) or queryParams
            if (this.paramItems.docId && this.paramItems.docId.length === 1) {
                try {
                    // use / activate database || not necessary for streaming (included for completeness only)
                    this.db   = await this.dbConnect();
                    this.coll = this.db.collection(this.paramItems.coll);

                    // extract service-IDs from roleServices
                    roleServices = roleServices.map(item => item.service);
                    // check if the docId is in the list of role-services
                    const hasId  = roleServices.includes(this.paramItems.docId[0]);
                    if (hasId) {
                        return await this.coll.findOne({_id: this.paramItems.docId[0]}, this.paramItems.projectParams)
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
                    this.db   = await this.dbConnect();
                    this.coll = this.db.collection(this.paramItems.coll);

                    // extract service-IDs from roleServices
                    roleServices = roleServices.map(item => item.service);

                    // check/extract this.paramItems docId(s) in the list of roleServices
                    this.paramItems.docId = this.paramItems.docId.map(item => roleServices.includes(item));

                    // perform query
                    return await this.coll.find({_id: {$in: this.paramItems.docId}})
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
                    this.db   = await this.dbConnect();
                    this.coll = this.db.collection(this.paramItems.coll);

                    // consider role-based-items
                    // extract service-IDs from roleServices
                    roleServices = roleServices.map(item => item.service);

                    // updated queryParams
                    this.paramItems.queryParams._id.$in = roleServices;
                    // this.paramItems.queryParams['_id'] = {$in: roleServices};

                    // perform query
                    return await this.coll.find(this.paramItems.queryParams)
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
                this.db   = await this.dbConnect();
                this.coll = this.db.collection(this.paramItems.coll);

                // consider role-based-items
                // extract service-IDs from roleServices
                roleServices = roleServices.map(item => item.service);
                // perform query
                return await this.coll.find({_id: {$in: roleServices}})
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
                this.db   = await this.dbConnect();
                this.coll = this.db.collection(this.paramItems.coll);

                return await this.coll.findOne({
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
                this.db   = await this.dbConnect();
                this.coll = this.db.collection(this.paramItems.coll);

                return await this.coll.find({_id: {$in: this.paramItems.docId}, createdBy: userId})
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
                this.db   = await this.dbConnect();
                this.coll = this.db.collection(this.paramItems.coll);

                // consider user-owned-items
                this.paramItems.queryParams['createdBy'] = userId;

                return await this.coll.find(this.paramItems.queryParams)
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
            this.db   = await this.dbConnect();
            this.coll = this.db.collection(this.paramItems.coll);

            return await this.coll.find({createdBy: userId})
                .skip(this.paramItems.skip)
                .limit(this.paramItems.limit)
                .project(this.paramItems.projectParams)
                .sort(this.paramItems.sortParams)
                .stream();
        } catch (error) {
            throw new Error(`notFound: ${error.message}`);
        }
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
                    return ((role.service === (collInfo ? collInfo._id : '')) && role.canRead);
                });
            }

            // document level permission
            if (this.docIds.length) {
                docRolePermitted = await this.docIds.every(id => {
                    // check roleServices permission (canRead):
                    return this.roleServices.some(role => {
                        return (role.service === id && role.canRead);
                    })
                });
            }

            // permit task, by role or admin
            const taskPermitted = collRolePermitted || docRolePermitted || this.isAdmin;

            if (!taskPermitted) {
                return getResMessage('unAuthorized', {
                    message: this.unAuthorizedMessage,
                });
            } else {
                this.actionAuthorized = true;
                resolve(getResMessage('success', {
                    message: 'action authorised / permitted',
                }));
            }
        });
    }
}

function newGetRecordStream(appDb, params, options = {}) {
    return new GetRecordStream(appDb, params, options);
}

module.exports = {GetRecordStream, newGetRecordStream};
