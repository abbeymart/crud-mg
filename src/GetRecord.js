/**
 * @Author: abbeymart | Abi Akindele | @Created: 2020-04-05 | @Updated: 2020-05-03
 * @Company: mConnect.biz | @License: MIT
 * @Description: get records, by params, by role / by userId | cache-in-memory
 */

// Import required module(s)
const ObjectId           = require('mongodb').ObjectID;
const {getResMessage}    = require('@mconnect/res-messages');
const {cacheHash}        = require('@mconnect/cache');
const {ValidateCrud}     = require('@mconnect/validate-crud');
const {getParamsMessage} = require('@mconnect/utils')();
const checkAccess        = require('./common/checkAccess');
const {checkDb}          = require('./common/crudHelpers');
const CrudRecord         = require('./CrudRecord');

class GetRecord extends CrudRecord {
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

    async getRecord() {
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
            messages  : this.mcMessages,
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

        // check the audit-log settings - to perform audit-log (read/search info - params, keywords etc.)
        if (this.logRead && Object.keys(this.paramItems.queryParams).length > 0) {
            await this.transLog.readLog(this.paramItems.coll, this.paramItems.queryParams, userId);
        }

        // check cache for matching record(s), and return if exist
        try {
            // console.log('cache-params: ', this.paramItems.coll, this.paramItems);
            const items = await cacheHash.getCache(this.paramItems.coll, this.paramItems);
            // console.log('cache-items: ', items);
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

        // get items for three scenarios => admin (all-records) | by-roles | by-userId

        // id(s): convert string to ObjectId
        this.paramItems.docId = this.paramItems.docId && this.paramItems.docId.length > 0 ? this.paramItems.docId.map(id => ObjectId(id)) : [];
        // exclude _id, if present, from the queryParams
        if (this.paramItems.queryParams && Object.keys(this.paramItems.queryParams).length > 0) {
            const {_id, ...otherParams} = this.paramItems.queryParams; // exclude _id, if present
            this.paramItems.queryParams = otherParams;
        }

        // define db-client-handle and collection variables
        // let db, col;
        // get items/records by adminRole | isAdmin determined from the server-side
        if (userActive && userId && isAdmin) {
            // Get the item(s) by docId(s) or queryParams
            if (this.paramItems.docId && this.paramItems.docId.length === 1) {
                try {
                    // use / activate database/collection
                    this.db   = await this.dbConnect();
                    this.coll = this.db.collection(this.paramItems.coll);

                    const result = await this.coll.findOne({_id: this.paramItems.docId[0]}, this.paramItems.projectParams);

                    if (Object.keys(result).length > 0) {
                        // save copy in the cache | put single result {} in an array for getCache result consistency/check
                        await cacheHash.setCache(this.paramItems.coll, {
                            key  : this.paramItems,
                            value: [result]
                        }, this.cacheExpire);
                        return getResMessage('success', {
                            value: [result],
                        });
                    }
                    return getResMessage('notFound');
                } catch (error) {
                    return getResMessage('notFound', {
                        value: error,
                    });
                }
            }
            if (this.paramItems.docId && this.paramItems.docId.length > 1) {
                try {
                    // use / activate database
                    this.db   = await this.dbConnect();
                    this.coll = this.db.collection(this.paramItems.coll);

                    const result = await this.coll.find({_id: {$in: this.paramItems.docId}})
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
            if (Object.keys(this.paramItems.queryParams).length > 0) {
                try {
                    // use / activate database
                    this.db   = await this.dbConnect();
                    this.coll = this.db.collection(this.paramItems.coll);

                    const result = await this.coll.find(this.paramItems.queryParams)
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
            // get all records, up to the permissible limit
            try {
                // use / activate database
                this.db   = await this.dbConnect();
                this.coll = this.db.collection(this.paramItems.coll);

                const result = await this.coll.find()
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
                    // console.log('cache-get-value: ', cacheHash.getCache(this.paramItems.coll, this.paramItems));
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
        // get items by userRole
        await this.taskPermitted();
        if (userActive && this.actionAuthorized) {
            // this.actionAuthorized: apply to all collections/functions
            // Get the item(s) by docId(s) or queryParams
            if (this.paramItems.docId && this.paramItems.docId.length === 1) {
                try {
                    // use / activate database
                    this.db   = await this.dbConnect();
                    this.coll = this.db.collection(this.paramItems.coll);

                    // extract service-IDs from roleServices
                    roleServices = roleServices.map(item => item.service);
                    // check if the docId is in the list of role-services
                    const hasId  = roleServices.includes(this.paramItems.docId[0]);
                    let result   = '';
                    if (hasId) {
                        result = await this.coll.findOne({_id: this.paramItems.docId[0]}, this.paramItems.projectParams);
                    }
                    if (Object.keys(result).length > 0) {
                        // save copy in the cache | put single result {} in an array for getCache result consistency/check
                        await cacheHash.setCache(this.paramItems.coll, {
                            key  : this.paramItems,
                            value: [result]
                        }, this.cacheExpire);
                        return getResMessage('success', {
                            value: [result],
                        });
                    }
                    return getResMessage('notFound');
                } catch (error) {
                    return getResMessage('notFound', {
                        value: error,
                    });
                }
            }
            if (this.paramItems.docId && this.paramItems.docId.length > 1) {
                try {
                    // use / activate database
                    this.db   = await this.dbConnect();
                    this.coll = this.db.collection(this.paramItems.coll);

                    // extract service-IDs from roleServices
                    roleServices          = roleServices.map(item => item.service);
                    // check/extract this.paramItems docId(s) in the list of roleServices
                    this.paramItems.docId = this.paramItems.docId.map(item => roleServices.includes(item));

                    // perform query
                    const result = await this.coll.find({_id: {$in: this.paramItems.docId}})
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
            if (Object.keys(this.paramItems.queryParams).length > 0) {
                try {
                    // use / activate database
                    this.db   = await this.dbConnect();
                    this.coll = this.db.collection(this.paramItems.coll);

                    // consider role-based-items
                    // extract service-IDs from roleServices
                    roleServices = roleServices.map(item => item.service);

                    // update queryParams, with role-services assignment
                    this.paramItems.queryParams._id.$in = roleServices;
                    // this.paramItems.queryParams['_id'] = {$in: roleServices};

                    // perform query
                    const result = await this.coll.find(this.paramItems.queryParams)
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
            // get all records, permissible by roleServices
            try {
                // use / activate database
                this.db   = await this.dbConnect();
                this.coll = this.db.collection(this.paramItems.coll);

                // consider role-based-items
                // extract service-IDs from roleServices
                roleServices = roleServices.map(item => item.service);

                // perform query
                const result = await this.coll.find({_id: {$in: roleServices}})
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
        // get items(s) by userId
        if (this.paramItems.docId && this.paramItems.docId.length === 1) {
            try {
                // use / activate database
                this.db   = await this.dbConnect();
                this.coll = this.db.collection(this.paramItems.coll);

                const result = await this.coll.findOne({
                    _id      : this.paramItems.docId[0],
                    createdBy: userId,
                }, this.paramItems.projectParams);

                if (Object.keys(result).length > 0) {
                    // save copy in the cache | wrap single result {} in an array for getCache result consistency/check
                    await cacheHash.setCache(this.paramItems.coll, {
                        key  : this.paramItems,
                        value: [result]
                    }, this.cacheExpire);
                    return getResMessage('success', {
                        value: [result],
                    });
                } else {
                    return getResMessage('notFound');
                }
            } catch (error) {
                return getResMessage('notFound', {
                    value: error,
                });
            }
        }
        if (this.paramItems.docId && this.paramItems.docId.length > 1) {
            try {
                // use / activate database
                this.db   = await this.dbConnect();
                this.coll = this.db.collection(this.paramItems.coll);

                const result = await this.coll.find({
                    _id      : {$in: this.paramItems.docId},
                    createdBy: userId,
                }).skip(this.paramItems.skip).limit(this.paramItems.limit)
                    .project(this.paramItems.projectParams)
                    .sort(this.paramItems.sortParams)
                    .toArray();

                if (result.length > 0) {
                    // save copy in the cache
                    await cacheHash.setCache(this.paramItems.coll, {
                        key  : this.paramItems,
                        value: result
                    }, this.cacheExpire);
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
        if (Object.keys(this.paramItems.queryParams).length > 0) {
            try {
                // use / activate database
                this.db   = await this.dbConnect();
                this.coll = this.db.collection(this.paramItems.coll);

                // include user/owned-items
                this.paramItems.queryParams.createdBy = userId;

                const result = await this.coll.find(this.paramItems.queryParams)
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
        // get all records, by userId
        try {
            // use / activate database
            this.db   = await this.dbConnect();
            this.coll = this.db.collection(this.paramItems.coll);

            const result = await this.coll.find({createdBy: userId})
                .skip(this.paramItems.skip)
                .limit(this.paramItems.limit)
                .project(this.paramItems.projectParams)
                .sort(this.paramItems.sortParams)
                .toArray();

            if (result.length > 0) {
                // save copy in the cache
                await cacheHash.setCache(this.paramItems.coll, {key: this.paramItems, value: result}, this.cacheExpire);
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

function newGetRecord(collName, params, options = {}) {
    return new GetRecord(collName, params, options);
}

module.exports = {GetRecord, newGetRecord};
